var fs = require('fs');
var jscodeshift = require('jscodeshift');
var _ = require('underscore');

var j = jscodeshift;

var getAllAncestors = (path) => {
  var results = [];
  var parent = path.parent;
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

var allCommonScopeTypes = [];

var insertVarDeclaration = (blockStatementNode, depName) => {
  var variableDeclaration = blockStatementNode.body.find(node => node.type === 'VariableDeclaration');

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

var constructMemberExpressionForObjectKey = (closestScopeCollec, property) => {
  var parentNodePath = closestScopeCollec.paths()[0].parentPath.value;

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

var insertObjectProperty = (closestScopeCollec, depName) => {
  if (closestScopeCollec.paths()[0].scope.isGlobal) {
    var objectExpressionNode = closestScopeCollec.nodes()[0];

    // insert corresponding key in the object
    objectExpressionNode.properties.unshift(
      j.property(
        "init",
        j.identifier(depName),
        j.literal(null)
      )
    );

    var depUsageCollec = closestScopeCollec.find(j.Identifier, { name: depName })
      .filter(path => path.parentPath.value.type !== "Property")
      .filter(path => !['params'].includes(path.parentPath.name))
      .filter(path => !_.pluck(path.parentPath.scope.path.get('params').value, 'name').includes(depName));

    var [depUsagePathsNonVariableDeclarations, depUsagePathsVariableDeclarations] = _.partition(depUsageCollec.paths(), path => path.parentPath.value.type !== "VariableDeclarator")

    // replace all occurences with Obj.key except those which are coming from param in the scope

    var memberExpressionToInsert = constructMemberExpressionForObjectKey(closestScopeCollec.at(0), depName);
    j(depUsagePathsNonVariableDeclarations).forEach(path => {
      path.replace(memberExpressionToInsert);
    });

    j(depUsagePathsVariableDeclarations).forEach(path => {
      var pathCollec = j(path);

      var variableDeclarationCollec = pathCollec.closest(j.VariableDeclaration);
      var variableDeclaratorCollec = variableDeclarationCollec.findVariableDeclarators(depName);

      var variableDeclarationNodePath = variableDeclarationCollec.paths()[0];
      var variableDeclaratorNodePath = variableDeclaratorCollec.paths()[0];

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

var handleScopeByType = (closestScopeCollec, depName, filePath) => {
  if (closestScopeCollec.length > 1) {
    console.log('\nFilePath - %s\nmultiple closest scope', filePath);
  }

  var scopeType = closestScopeCollec.get('type').value;

  switch (scopeType) {
    case 'Program':
      {
        var assignmentExpressionNodePath = closestScopeCollec.find(j.AssignmentExpression, { left: { name: depName } }).paths()[0];

        if (!assignmentExpressionNodePath) {
          console.log('\nFilePath - %s\nNo assignmentExpression found at program level for %s', filePath, depName);
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
        var blockStatementNode = closestScopeCollec.nodes()[0];

        insertVarDeclaration(blockStatementNode, depName);

        break;
      }
    case 'FunctionDeclaration':
    case 'FunctionExpression':
      {
        var blockStatementNode = closestScopeCollec.find(j.BlockStatement).paths().find(path => path.parent === closestScopeCollec.paths()[0]).node;

        insertVarDeclaration(blockStatementNode, depName);

        break;
      }
    case 'ObjectExpression':
      {
        console.log("\nFilePath - %s\nInserting object property: %s", filePath, depName);
        insertObjectProperty(closestScopeCollec, depName);

        break;
      }
    default:
      console.log('\nFilePath - %s\nUnhandled scope type - %s for dependency - %s', filePath, scopeType, depName);
  }
}

/**
 * { Transformer to fix all the leaking globals from a JS file }
 *
 * @param      {<String>}  filePath      Path of the file to fix
 * @param      {<Array>}   dependencies  Array of Dependencies for the file at filePath 
 * @return     {<String>}  { Transformed string to write to the file }
 */
module.exports = (filePath, dependencies) => {
  var source = fs.readFileSync(filePath, { encoding: 'utf8' });

  var root = j(source);

  console.log('\nFixing FileName - %s\n', filePath);

  dependencies.forEach(({ name, nodes }) => {
    console.log('Dependency - %s\n', name);

    var nodesStart = _.pluck(nodes, 'start');

    var nodePathsCollection = root.find(j.Identifier, path => name === path.name && nodesStart.includes(path.start));

    if (!nodePathsCollection.length) {
      console.log('\nFixing FileName - %s\nNo matching nodes found for dependency - %s\n', filePath, name);
      return;
    }

    // fix only dependencies with AssignmentExpression, ex: a = 1;
    var identifiersWithinAssignExpCollection = nodePathsCollection
      .filter(path => path.parentPath.value.type === "AssignmentExpression");

    if (identifiersWithinAssignExpCollection.length === nodePathsCollection.length) {
      var standaloneExpressionStatement = identifiersWithinAssignExpCollection.closest(j.ExpressionStatement);

      // only one references to the variable and that too not at Program level then directly remove its expression
      if (standaloneExpressionStatement.length && standaloneExpressionStatement.closestScope().paths()[0].value.type !== 'Program') {
        standaloneExpressionStatement.paths()[0].replace();

        return;
      }
    }

    // group nodes with common scope together
    var groupedByScopeNodePathsObj = _.chain(nodePathsCollection.paths())
      .groupBy(path => j(path).closestScope().get(0).scope.path.value.start)
      .value();

    var isDeclaredAtProgramLevel = false;

    // var eachGroupHasAssignmentExp = true;

    var scopesStart = Object.keys(groupedByScopeNodePathsObj);

    var insertAtScopeCollec;

    scopesStart.forEach((start) => {
      var nodePaths = groupedByScopeNodePathsObj[start];

      var groupedCollection = j(nodePaths);

      var closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start) });

      if (closestScopeCollec.paths()[0].value.type === 'Program') {
        isDeclaredAtProgramLevel = true;

        insertAtScopeCollec = closestScopeCollec;
      };
    });

    // find closest common scope
    var argumentsArr = [];

    nodePathsCollection.forEach(path => {
      argumentsArr.push(getAllAncestors(path));
    });

    var allCommonAncestorNodes = _.intersection(...argumentsArr);

    var closestParentCollec = j(allCommonAncestorNodes).at(0);

    var closestScopeCollec = closestParentCollec.closestScope();

    if (closestScopeCollec.length) {
      var isAtProgramScope = closestScopeCollec.paths()[0].value.type === 'Program';

      if (!isAtProgramScope) {
        insertAtScopeCollec = closestScopeCollec;
      }

      if (isAtProgramScope && closestParentCollec.get('type').value === 'ObjectExpression') {
        insertAtScopeCollec = closestParentCollec;
      }
    }

    if (insertAtScopeCollec) {
      // if insertAtScopeCollec scope
      handleScopeByType(insertAtScopeCollec, name, filePath);

      return; // found a common scope
    }

    scopesStart.forEach((start) => {
      var nodePaths = groupedByScopeNodePathsObj[start];

      var groupedCollection = j(nodePaths);

      var closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start) });

      // declare at each scope level
      handleScopeByType(closestScopeCollec, name, filePath);
    });
  });

  return root.toSource();
}
