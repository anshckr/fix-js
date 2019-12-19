const jscodeshift = require('jscodeshift');
const _ = require('underscore');

const j = jscodeshift;

const getAllAncestors = (path) => {
  let results = [];
  let parent = path.parent;
  while (
    parent
  ) {
    parent = parent.parent;
    if (parent) {
      results.push(parent);
    }
  }

  return results;
}

const allCommonScopeTypes = [];

const insertVarDeclaration = (blockStatementNode, depName) => {
  const variableDeclaration = blockStatementNode.body.find(node => node.type === 'VariableDeclaration');

  if (variableDeclaration) {
    // there is already variable declaration inside BlockStatement
    j(variableDeclaration).get('declarations').push(
      j.variableDeclarator(j.identifier(depName), null)
    );
  } else {
    blockStatementNode.body.unshift(
      j.variableDeclaration(
        'var',
        [j.variableDeclarator(j.identifier(depName), null)]
      )
    );
  }
}

const constructMemberExpressionForObjectKey = (closestScopeCollec, property) => {
  const parentNodePath = closestScopeCollec.paths()[0].parentPath.value;

  if (parentNodePath.type === 'VariableDeclarator') {
    return j.memberExpression(
      j.identifier(parentNodePath.id.name),
      j.identifier(property)
    );
  }

  return j.memberExpression(
    constructMemberExpressionForObjectKey(closestScopeCollec.closest(j.ObjectExpression), closestScopeCollec.paths()[0].parentPath.value.key.name),
    j.identifier(property)
  );
};

const insertObjectProperty = (closestScopeCollec, depName) => {
  if (closestScopeCollec.paths()[0].scope.isGlobal) {
    const objectExpressionNode = closestScopeCollec.nodes()[0];

    // insert corresponding key in the object
    objectExpressionNode.properties.unshift(
      j.property(
        "init",
        j.identifier(depName),
        j.literal(null)
      )
    );

    const depUsageCollec = closestScopeCollec.find(j.Identifier, { name: depName })
      .filter(path => path.parentPath.value.type !== "Property")
      .filter(path => !['params'].includes(path.parentPath.name))
      .filter(path => !_.pluck(path.parentPath.scope.path.get('params').value, 'name').includes(depName));

    const [depUsagePathsNonVariableDeclarations, depUsagePathsVariableDeclarations] = _.partition(depUsageCollec.paths(), path => path.parentPath.value.type !== "VariableDeclarator")

    // replace all occurences with Obj.key except those which are coming from param in the scope

    const memberExpressionToInsert = constructMemberExpressionForObjectKey(closestScopeCollec.at(0), depName);
    j(depUsagePathsNonVariableDeclarations).forEach(path => {
      path.replace(memberExpressionToInsert);
    });

    j(depUsagePathsVariableDeclarations).forEach(path => {
      const pathCollec = j(path);

      const variableDeclarationCollec = pathCollec.closest(j.VariableDeclaration);
      const variableDeclaratorCollec = variableDeclarationCollec.findVariableDeclarators(depName);

      const variableDeclarationNodePath = variableDeclarationCollec.paths()[0];
      const variableDeclaratorNodePath = variableDeclaratorCollec.paths()[0];

      if (variableDeclarationNodePath.value.declarations.length === 1) {
        variableDeclarationNodePath
          .replace(j.expressionStatement(
            j.assignmentExpression(
              '=',
              memberExpressionToInsert,
              variableDeclaratorNodePath.value.init
            )
          ));
      } else {
        variableDeclarationCollec.closest(j.BlockStatement).get('body').value.push(
          j.expressionStatement(
            j.assignmentExpression(
              '=',
              memberExpressionToInsert,
              variableDeclaratorNodePath.value.init
            )
          )
        );
        variableDeclaratorNodePath.replace();
      }
    });

    // handle depUsageCollecVariableDeclarations
  } else {
    insertObjectProperty(closestScopeCollec.closest(j.ObjectExpression), depName);
  }
}

const handleScopeByType = (closestScopeCollec, depName, fileName) => {
  if (closestScopeCollec.length > 1) {
    console.log('\nFileName - %s\nmultiple closest scope', fileName);
  }

  const scopeType = closestScopeCollec.get('type').value;

  switch (scopeType) {
    case 'Program':
      {
        const assignmentExpressionNodePath = closestScopeCollec.find(j.AssignmentExpression, { left: { name: depName } }).paths()[0];

        if (!assignmentExpressionNodePath) {
          console.log('\nFileName - %s\nNo assignmentExpression found at program level for %s', fileName, depName);
          return;
        }

        assignmentExpressionNodePath
        .replace(j.variableDeclaration(
          'var',
          [j.variableDeclarator(j.identifier(depName), assignmentExpressionNodePath.value.right)]
        ));

        break;
      }
    case 'BlockStatement':
      {
        const blockStatementNode = closestScopeCollec.nodes()[0];

        insertVarDeclaration(blockStatementNode, depName);

        break;
      }
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      {
        const blockStatementNode = closestScopeCollec.find(j.BlockStatement).paths().find(path => path.parent === closestScopeCollec.paths()[0]).node;

        insertVarDeclaration(blockStatementNode, depName);

        break;
      }
    case 'ObjectExpression':
      {
        console.log("\nFileName - %s\nInserting object property: %s", fileName, depName);
        insertObjectProperty(closestScopeCollec, depName);

        break;
      }
    default:
      console.log('\nFileName - %s\nUnhandled scope type - %s for dependency - %s', fileName, scopeType, depName);
  }
}

module.exports = (source, dependencies, fileName) => {
  const root = j(source);

  console.log('\nFixing FileName - %s\n', fileName);

  dependencies.forEach(({ name, nodes }) => {
    console.log('Dependency - %s\n', name);

    const nodesStart = _.pluck(nodes, 'start');

    let nodePathsCollection = root.find(j.Identifier, path => name === path.name && nodesStart.includes(path.start));

    if (!nodePathsCollection.length) {
      console.log('\nFixing FileName - %s\nNo matching nodes found for dependency - %s\n', fileName, name);
      return;
    }

    // fix only dependencies with AssignmentExpression, ex: a = 1;
    const identifiersWithinAssignExpCollection = nodePathsCollection
      .filter(path => path.parentPath.value.type === "AssignmentExpression");

    if (identifiersWithinAssignExpCollection.length === nodePathsCollection.length) {
      const standaloneExpressionStatement = identifiersWithinAssignExpCollection.closest(j.ExpressionStatement);

      // only one references to the variable and that too not at Program level then directly remove its expression
      if (standaloneExpressionStatement.length && standaloneExpressionStatement.closestScope().paths()[0].value.type !== 'Program') {
        standaloneExpressionStatement.paths()[0].replace();

        return;
      }
    }

    // group nodes with common scope together
    const groupedByScopeNodePathsObj = _.chain(nodePathsCollection.paths())
      .groupBy(path => j(path).closestScope().get(0).scope.path.value.start)
      .value();

    let isDeclaredAtProgramLevel = false;

    // let eachGroupHasAssignmentExp = true;

    const scopesStart = Object.keys(groupedByScopeNodePathsObj);

    let insertAtScopeCollec;

    scopesStart.forEach((start) => {
      const nodePaths = groupedByScopeNodePathsObj[start];

      const groupedCollection = j(nodePaths);

      const closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start) });

      if (closestScopeCollec.paths()[0].value.type === 'Program') {
        isDeclaredAtProgramLevel = true;

        insertAtScopeCollec = closestScopeCollec;
      };
    });

    // find closest common scope
    let argumentsArr = [];

    nodePathsCollection.forEach(path => {
      argumentsArr.push(getAllAncestors(path));
    });

    const allCommonAncestorNodes = _.intersection(...argumentsArr);

    const closestParentCollec = j(allCommonAncestorNodes).at(0);

    const closestScopeCollec = closestParentCollec.closestScope();

    if (closestScopeCollec.length) {
      const isAtProgramScope = closestScopeCollec.paths()[0].value.type === 'Program';

      if (!isAtProgramScope) {
        insertAtScopeCollec = closestScopeCollec;
      }

      if (isAtProgramScope && closestParentCollec.get('type').value === 'ObjectExpression') {
        insertAtScopeCollec = closestParentCollec;
      }
    }

    if (insertAtScopeCollec) {
      // if insertAtScopeCollec scope
      handleScopeByType(insertAtScopeCollec, name, fileName);

      return; // found a common scope
    }

    scopesStart.forEach((start) => {
      const nodePaths = groupedByScopeNodePathsObj[start];

      const groupedCollection = j(nodePaths);

      const closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start) });

      // declare at each scope level
      handleScopeByType(closestScopeCollec, name, fileName);
    });
  });

  return root.toSource();
}