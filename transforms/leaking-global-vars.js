const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');
const _ = require('lodash');
const acorn = require('acorn');
const findGlobals = require('acorn-globals');
const walk = require('acorn-walk');

const j = jscodeshift;

// global objects
const constants = require('../static/constants.json');

const allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

const getAllAncestors = (path) => {
  const results = [];
  let { parent } = path;
  while (parent) {
    parent = parent.parent;
    if (parent) {
      results.push(parent);
    }
  }

  return results;
};

const insertVarDeclaration = (blockStatementNode, depName) => {
  const variableDeclaration = blockStatementNode.body.find((node) => node.type === 'VariableDeclaration');

  if (variableDeclaration) {
    // there is already variable declaration inside BlockStatement
    j(variableDeclaration)
      .get('declarations')
      .push(j.variableDeclarator(j.identifier(depName), null));
  } else {
    blockStatementNode.body.unshift(j.variableDeclaration('var', [j.variableDeclarator(j.identifier(depName), null)]));
  }
};

const constructMemberExpressionForObjectKey = (closestScopeCollec, property) => {
  const parentNodePath = closestScopeCollec.paths()[0].parentPath.value;

  if (parentNodePath.type === 'VariableDeclarator') {
    return j.memberExpression(j.identifier(parentNodePath.id.name), j.identifier(property));
  }

  if (parentNodePath.type === 'Property') {
    return j.memberExpression(
      constructMemberExpressionForObjectKey(closestScopeCollec.closest(j.ObjectExpression), parentNodePath.key.name),
      j.identifier(property)
    );
  }

  if (parentNodePath.type === 'AssignmentExpression') {
    return j.memberExpression(parentNodePath.left, j.identifier(property));
  }

  return new Error("Unhandled node type '%s' in constructMemberExpressionForObjectKey", parentNodePath.type);
};

const insertObjectProperty = (closestScopeCollec, depName) => {
  if (closestScopeCollec.paths()[0].scope.isGlobal) {
    const objectExpressionNode = closestScopeCollec.nodes()[0];

    // insert corresponding key in the object
    objectExpressionNode.properties.unshift(j.property('init', j.identifier(depName), j.literal(null)));

    const depUsageCollec = closestScopeCollec
      .find(j.Identifier, { name: depName })
      .filter((path) => path.parentPath.value.type !== 'Property')
      .filter((path) => !['params'].includes(path.parentPath.name))
      .filter((path) => !_.map(path.parentPath.scope.path.get('params').value, 'name').includes(depName));

    const [depUsagePathsNonVariableDeclarations, depUsagePathsVariableDeclarations] = _.partition(
      depUsageCollec.paths(),
      (path) => path.parentPath.value.type !== 'VariableDeclarator'
    );

    // replace all occurences with Obj.key except those which are coming from param in the scope

    const memberExpressionToInsert = constructMemberExpressionForObjectKey(closestScopeCollec.at(0), depName);
    j(depUsagePathsNonVariableDeclarations).forEach((path) => {
      path.replace(memberExpressionToInsert);
    });

    j(depUsagePathsVariableDeclarations).forEach((path) => {
      const pathCollec = j(path);

      const variableDeclarationCollec = pathCollec.closest(j.VariableDeclaration);
      const variableDeclaratorCollec = variableDeclarationCollec.findVariableDeclarators(depName);

      const variableDeclarationNodePath = variableDeclarationCollec.paths()[0];
      const variableDeclaratorNodePath = variableDeclaratorCollec.paths()[0];

      if (variableDeclarationNodePath.value.declarations.length === 1) {
        variableDeclarationNodePath.replace(
          j.expressionStatement(
            j.assignmentExpression('=', memberExpressionToInsert, variableDeclaratorNodePath.value.init)
          )
        );
      } else {
        variableDeclarationCollec
          .closest(j.BlockStatement)
          .get('body')
          .value.push(
            j.expressionStatement(
              j.assignmentExpression('=', memberExpressionToInsert, variableDeclaratorNodePath.value.init)
            )
          );
        variableDeclaratorNodePath.replace();
      }
    });

    // handle depUsageCollecVariableDeclarations
  } else {
    insertObjectProperty(closestScopeCollec.closest(j.ObjectExpression), depName);
  }
};

const handleScopeByType = (closestScopeCollec, depName, filePath) => {
  if (closestScopeCollec.length > 1) {
    console.log('\nFilePath - %s\nmultiple closest scope', filePath);
  }

  const scopeType = closestScopeCollec.get('type').value;
  let blockStatementNode;

  switch (scopeType) {
    case 'Program': {
      const assignmentExpressionNodePath = closestScopeCollec
        .find(j.AssignmentExpression, { left: { name: depName } })
        .paths()[0];

      if (!assignmentExpressionNodePath) {
        console.log('\nFilePath - %s\nNo assignmentExpression found at program level for %s', filePath, depName);
        return;
      }

      assignmentExpressionNodePath.replace(
        j.variableDeclaration('var', [
          j.variableDeclarator(j.identifier(depName), assignmentExpressionNodePath.value.right)
        ])
      );

      break;
    }
    case 'BlockStatement': {
      [blockStatementNode] = closestScopeCollec.nodes();

      insertVarDeclaration(blockStatementNode, depName);

      break;
    }
    case 'FunctionDeclaration':
    case 'FunctionExpression': {
      blockStatementNode = closestScopeCollec
        .find(j.BlockStatement)
        .paths()
        .find((path) => path.parent === closestScopeCollec.paths()[0]).node;

      insertVarDeclaration(blockStatementNode, depName);

      break;
    }
    case 'ObjectExpression': {
      console.log('\nFilePath - %s\nInserting object property: %s', filePath, depName);
      insertObjectProperty(closestScopeCollec, depName);

      break;
    }
    default:
      console.log('\nFilePath - %s\nUnhandled scope type - %s for dependency - %s', filePath, scopeType, depName);
  }
};

/**
 * { Transformer to fix all the leaking globals from a JS file }
 *
 * @param      {String}     filePath                  Path of the file to fix
 * @param      {Array}      [dependencies=[]]         Array of Dependencies for the file at filePath
 * @param      {Boolean}    [updateInplace=false]     Whether to update the file or not
 * @return     {String}     { Transformed string to write to the file }
 */
module.exports = (filePath, dependencies = [], updateInplace = false) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  if (dependencies.constructor !== Array) {
    throw new Error('dependencies should be an Array');
  }

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const ast = acorn.parse(source, {
    loc: true
  });

  if (!dependencies.length) {
    // get the global dependencies and fix them if no dependencies are passed

    dependencies = findGlobals(ast).filter((dep) => allExternalDeps.indexOf(dep.name) === -1);
  } else {
    dependencies = dependencies.map((dep) => {
      if (dep.constructor === String) {
        const nodes = [];

        // walk full AST to get all references to dep
        walk.full(ast, (node, state, type) => {
          if (type === 'Identifier' && node.name === dep) {
            nodes.push(node);
          }
        });

        return { name: dep, nodes };
      }

      if (
        dep.constructor === Object &&
        Object.hasOwnProperty.call(dep, 'name') &&
        Object.hasOwnProperty.call(dep, 'nodes')
      ) {
        return dep;
      }

      throw new Error('Invalid element passed in dependencies Array');
    });
  }

  const root = j(source);

  console.log('\nFixing FileName - %s\n', filePath);

  dependencies.forEach(({ name, nodes }) => {
    console.log('Dependency - %s\n', name);

    const nodesStart = _.map(nodes, 'start');

    const nodePathsCollection = root.find(
      j.Identifier,
      (path) => name === path.name && nodesStart.includes(path.start)
    );

    if (!nodePathsCollection.length) {
      console.log('\nFixing FileName - %s\nNo matching nodes found for dependency - %s\n', filePath, name);
      return;
    }

    // group nodes with common scope together
    const groupedByScopeNodePathsObj = _.chain(nodePathsCollection.paths())
      .groupBy(
        (path) =>
          j(path)
            .closestScope()
            .get(0).scope.path.value.start
      )
      .value();

    // var eachGroupHasAssignmentExp = true;

    const scopesStart = Object.keys(groupedByScopeNodePathsObj);

    let insertAtScopeCollec;

    scopesStart.forEach((start) => {
      const nodePaths = groupedByScopeNodePathsObj[start];

      const groupedCollection = j(nodePaths);

      const closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start, 10) });

      if (closestScopeCollec.paths()[0].value.type === 'Program') {
        insertAtScopeCollec = closestScopeCollec;
      }
    });

    // find closest common scope
    const argumentsArr = [];

    nodePathsCollection.forEach((path) => {
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
      handleScopeByType(insertAtScopeCollec, name, filePath);

      return; // found a common scope
    }

    scopesStart.forEach((start) => {
      const nodePaths = groupedByScopeNodePathsObj[start];

      const groupedCollection = j(nodePaths);

      const closestScopeNodeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start, 10) });

      // declare at each scope level
      handleScopeByType(closestScopeNodeCollec, name, filePath);
    });
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};
