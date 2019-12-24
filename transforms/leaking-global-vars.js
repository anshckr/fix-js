var fs = require('fs');
var jscodeshift = require('jscodeshift');
var _ = require('lodash');
var acorn = require('acorn');
var findGlobals = require('acorn-globals');
var walk = require('acorn-walk');

var j = jscodeshift;

// global objects
var constants = require("../static/constants.json");
var allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

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

  if (parentNodePath.type === 'Property') {
    return j.memberExpression(
      constructMemberExpressionForObjectKey(closestScopeCollec.closest(j.ObjectExpression), parentNodePath.key.name),
      j.identifier(property)
    );
  }

  if (parentNodePath.type === 'AssignmentExpression') {
    return j.memberExpression(
      parentNodePath.left,
      j.identifier(property)
    );
  }
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
      .filter(path => !_.map(path.parentPath.scope.path.get('params').value, 'name').includes(depName));

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

  var source = fs.readFileSync(filePath, { encoding: 'utf8' });

  var ast = acorn.parse(source, {
    loc: true
  });

  if (!dependencies.length) {
    // get the global dependencies and fix them if no dependencies are passed

    dependencies = findGlobals(ast)
      .filter(dep => allExternalDeps.indexOf(dep.name) === -1);
  } else {
    dependencies = dependencies.map(function(dep) {
      if (dep.constructor === String) {
        var nodes = [];

        // walk full AST to get all references to dep
        walk.full(ast, function(node, state, type) {
          if (type === 'Identifier' && node.name === dep) {
            nodes.push(node);
          }
        });

        return { name: dep, nodes: nodes };
      }

      if (dep.constructor === Object && dep.hasOwnProperty('name') && dep.hasOwnProperty('nodes')) {
        return dep;
      }

      throw new Error('Invalid element passed in dependencies Array');
    });
  }

  var root = j(source);

  console.log('\nFixing FileName - %s\n', filePath);

  dependencies.forEach(({ name, nodes }) => {
    console.log('Dependency - %s\n', name);

    var nodesStart = _.map(nodes, 'start');

    var nodePathsCollection = root.find(j.Identifier, path => name === path.name && nodesStart.includes(path.start));

    if (!nodePathsCollection.length) {
      console.log('\nFixing FileName - %s\nNo matching nodes found for dependency - %s\n', filePath, name);
      return;
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

  var results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(filePath, results.replace(/;;/g, ';'));
  }

  return results;
}