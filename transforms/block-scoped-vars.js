const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');
const _ = require('lodash');

const j = jscodeshift;

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

const handleScopeByType = (closestScopeCollec, depName, filePath) => {
  if (closestScopeCollec.length > 1) {
    console.log('\nFilePath - %s\nmultiple closest scope', filePath);
  }

  const scopeType = closestScopeCollec.get('type').value;

  switch (scopeType) {
    case 'BlockStatement':
    case 'Program': {
      const [closestScopeNode] = closestScopeCollec.nodes();

      insertVarDeclaration(closestScopeNode, depName);

      break;
    }
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'CatchClause': {
      const blockStatementNode = closestScopeCollec
        .find(j.BlockStatement)
        .paths()
        .find((path) => path.parent === closestScopeCollec.paths()[0]).node;

      insertVarDeclaration(blockStatementNode, depName);

      break;
    }
    default:
      console.log('\nFilePath - %s\nUnhandled scope type - %s for dependency - %s', filePath, scopeType, depName);
  }
};

const isFixableDeclaration = (variableDeclarationNodePath) => {
  const closestScopeCollec = j(variableDeclarationNodePath).closestScope();

  const scopeType = closestScopeCollec.get('type').value;

  let scopeNodeStart;

  if (scopeType !== 'Program') {
    scopeNodeStart = closestScopeCollec.find(j.BlockStatement).get('start').value;
  } else {
    scopeNodeStart = closestScopeCollec.get('start').value;
  }

  return variableDeclarationNodePath.parent.value.start !== scopeNodeStart;
};

const handleDeclaratorsByScope = (closestScopeCollec, nodePath) => {
  const scopeType = closestScopeCollec.get('type').value;

  let reDeclareVar = false;

  const variableDeclaratorCollec = j(nodePath);

  const closestVarDeclCollec = variableDeclaratorCollec.closest(j.VariableDeclaration);

  const variableDeclarationNodePath = closestVarDeclCollec.paths()[0];

  if (isFixableDeclaration(variableDeclarationNodePath)) {
    let varDeclarationParentType;

    if (scopeType !== 'Program') {
      varDeclarationParentType = variableDeclarationNodePath.parent.value.type;
    } else {
      varDeclarationParentType = scopeType;
    }

    reDeclareVar = true;

    switch (varDeclarationParentType) {
      case 'BlockStatement':
      case 'Program':
      case 'SwitchCase': {
        if (variableDeclarationNodePath.value.declarations.length > 1) {
          // Multiple declarators without init value
          const hasInitDeclarator = variableDeclarationNodePath.value.declarations.find((node) => {
            return node.init;
          });

          if (!hasInitDeclarator) {
            nodePath.replace();
          }
        } else if (nodePath.value.init) {
          // Single declarator with init
          const expressionStatementToInsert = j.expressionStatement(
            j.assignmentExpression('=', nodePath.value.id, nodePath.value.init)
          );

          if (variableDeclarationNodePath.value.comments) {
            expressionStatementToInsert.comments = variableDeclarationNodePath.value.comments;
          }

          variableDeclarationNodePath.replace(expressionStatementToInsert);
        } else {
          // Single declarator without init value
          variableDeclarationNodePath.replace();
        }

        break;
      }
      case 'ForInStatement': {
        variableDeclarationNodePath.replace(nodePath.value.id);

        break;
      }
      case 'ForStatement': {
        if (variableDeclarationNodePath.value.declarations.length === 1) {
          // Handle Single Decl ForStatement
          const expressionStatementToInsert = j.expressionStatement(
            j.assignmentExpression('=', nodePath.value.id, nodePath.value.init)
          );

          variableDeclarationNodePath.replace(expressionStatementToInsert);
        }

        break;
      }
      default: {
        reDeclareVar = false;
        console.log('\nUnhandled scope type');
      }
    }
  }

  return reDeclareVar;
};

/**
 * { Transformer to fix all the unused assigned variables from a JS file }
 *
 * @param      {String}   filePath                Path of the file to fix
 * @param      {Boolean}  [updateInplace=false]   Whether to update the file or not
 * @param      {Object}   [collectedGlobals={}]   Contains two keys globalsExposed, dependencies for the file
 * @return     {String}   { Transformed string to write to the file }
 */
const transformBlockScopedVar = (filePath, updateInplace = false, collectedGlobals = {}) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const root = j(source);

  console.log('\nFixing FilePath - %s\n', filePath);

  let variableDeclaratorCollec;

  if (collectedGlobals.globalsExposed) {
    variableDeclaratorCollec = root.find(j.VariableDeclarator, (node) => {
      return !collectedGlobals.globalsExposed.includes(node.id.name);
    });
  } else {
    variableDeclaratorCollec = root.find(j.VariableDeclarator);
  }

  // group nodes with common variable name decl
  const groupedByVarNodePathsObj = _.chain(variableDeclaratorCollec.paths())
    .groupBy((nodePath) => {
      return nodePath.value.id.name;
    })
    .value();

  const variableNames = Object.keys(groupedByVarNodePathsObj);

  // console.log('\nPrinting Variable Names - %s\n', JSON.stringify(variableNames));

  variableNames.forEach((variable) => {
    console.log('\nFixing Variable - %s\n', variable);

    const groupedByVarNodePaths = groupedByVarNodePathsObj[variable];

    // group nodes with common scope together
    const groupedByScopeNodePathsObj = _.chain(groupedByVarNodePaths)
      .groupBy(
        (path) =>
          j(path)
            .closestScope()
            .get(0).scope.path.value.start
      )
      .value();

    const scopesStart = Object.keys(groupedByScopeNodePathsObj);

    scopesStart.forEach((start) => {
      const groupedByStartNodePaths = groupedByScopeNodePathsObj[start];

      const groupedCollection = j(groupedByStartNodePaths);

      const closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start, 10) });

      let reDeclareVar = false;

      // Declaration is not at the block level in the current scope
      groupedCollection.forEach((nodePath) => {
        const returnedValue = handleDeclaratorsByScope(closestScopeCollec, nodePath);

        if (returnedValue) {
          reDeclareVar = returnedValue;
        }
      });

      if (reDeclareVar) {
        handleScopeByType(closestScopeCollec, variable, filePath);
      }
    });
  });

  // Handle Multiple Decl ForStatements Separately
  const forStatementCollec = root
    .find(j.ForStatement)
    .filter((path) => {
      const forStatementInitNode = path.value.init;

      return forStatementInitNode && forStatementInitNode.type === 'VariableDeclaration';
    })
    .filter((path) => {
      return path.value.init.declarations.length > 1;
    });

  forStatementCollec.forEach((nodePath) => {
    const variableDeclarationNodePath = root
      .find(j.VariableDeclaration, {
        start: parseInt(nodePath.value.init.start, 10)
      })
      .paths()[0];

    const assignmentExpressions = variableDeclarationNodePath.value.declarations.map((node) => {
      return j.assignmentExpression('=', node.id, node.init);
    });

    const sequenceExpressionToInsert = j.sequenceExpression(assignmentExpressions);

    variableDeclarationNodePath.replace(sequenceExpressionToInsert);
  });

  // Multiple declarators with any init value
  const variableDeclarationCollec = root
    .find(j.VariableDeclaration)
    .filter((nodePath) => {
      // Declaration has initialized Declarator
      return nodePath.value.declarations.find((node) => {
        return node.init;
      });
    })
    .filter((nodePath) => {
      // And there are multiple Declarators
      return nodePath.value.declarations.length > 1;
    })
    .filter(isFixableDeclaration);

  variableDeclarationCollec.forEach((nodePath) => {
    const varDeclCollec = j(nodePath);

    const closestScopeCollec = varDeclCollec.closestScope();

    const scopeType = closestScopeCollec.get('type').value;

    let varDeclarationParentType;

    if (scopeType !== 'Program') {
      varDeclarationParentType = nodePath.parent.value.type;
    } else {
      varDeclarationParentType = scopeType;
    }

    let nodeKeyToSearch;

    switch (varDeclarationParentType) {
      case 'BlockStatement':
      case 'Program': {
        nodeKeyToSearch = 'body';

        break;
      }
      case 'SwitchCase': {
        nodeKeyToSearch = 'consequent';

        break;
      }
      default: {
        console.log('\nUnhandled scope type');
      }
    }

    const parentKeyToModify = varDeclCollec.closest(j[varDeclarationParentType]).get(nodeKeyToSearch).value;

    let index = _.findIndex(parentKeyToModify, (node) => {
      return node.start === nodePath.value.start;
    });

    const initDeclarators = nodePath.value.declarations.filter((node) => {
      return node.init;
    });

    let leadingCommentNodeIndex = -1;
    let trailingCommentNodeIndex = -1;
    let leadingComments;
    let trailingComments;

    if (nodePath.value.comments) {
      [leadingComments, trailingComments] = _.partition(nodePath.value.comments, (comment) => comment.leading);

      if (leadingComments.length) {
        leadingCommentNodeIndex = index;
      }

      if (trailingComments.length) {
        trailingCommentNodeIndex = index + initDeclarators.length - 1;
      }
    }

    initDeclarators.forEach((node) => {
      const expressionStatementToInsert = j.expressionStatement(j.assignmentExpression('=', node.id, node.init));

      if (node.comments) {
        expressionStatementToInsert.comments = node.comments;
      }

      // re-insert just before the variable declaration
      parentKeyToModify.splice(index++, 0, expressionStatementToInsert);
    });

    if (leadingCommentNodeIndex !== -1) {
      parentKeyToModify[leadingCommentNodeIndex].comments = leadingComments;
    }

    nodePath.replace();

    if (trailingCommentNodeIndex !== -1) {
      parentKeyToModify[trailingCommentNodeIndex].comments = trailingComments;
    }
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};

module.exports = transformBlockScopedVar;
