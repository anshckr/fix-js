const _ = require('lodash');

module.exports = (file, api, options) => {
  const j = api.jscodeshift;

  const printOptions = options.printOptions || { quote: 'single' };
  const root = j(file.source);

  // console.log('\nFixing FilePath - %s\n', filePath);

  const insertVarDeclaration = (declarationParentNode, depName) => {
    const variableDeclaration = declarationParentNode.body.find((node) => node.type === 'VariableDeclaration');

    if (variableDeclaration) {
      // there is already variable declaration inside BlockStatement
      j(variableDeclaration)
        .get('declarations')
        .push(j.variableDeclarator(j.identifier(depName), null));
    } else {
      declarationParentNode.body.unshift(
        j.variableDeclaration('var', [j.variableDeclarator(j.identifier(depName), null)])
      );
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

  const handleCurrentStateOfDeclarators = (closestScopeCollec, varDeclaratorsCollec) => {
    let shouldReDeclareVariable = false;

    varDeclaratorsCollec.forEach((nodePath) => {
      const scopeType = closestScopeCollec.get('type').value;

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

        switch (varDeclarationParentType) {
          case 'BlockStatement':
          case 'Program':
          case 'SwitchCase': {
            shouldReDeclareVariable = true;

            if (variableDeclarationNodePath.value.declarations.length > 1) {
              // Multiple declarators without any init declarator
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
            shouldReDeclareVariable = true;

            variableDeclarationNodePath.replace(nodePath.value.id);

            break;
          }
          case 'ForStatement': {
            shouldReDeclareVariable = true;

            if (variableDeclarationNodePath.value.declarations.length === 1) {
              // Handle Single Decl ForStatement

              variableDeclarationNodePath.replace(j.assignmentExpression('=', nodePath.value.id, nodePath.value.init));
            }

            break;
          }
          default: {
            console.log('\nUnhandled declarator scope type: %s', varDeclarationParentType);
          }
        }
      }
    });

    return shouldReDeclareVariable;
  };

  const variableDeclaratorCollec = root.find(j.VariableDeclarator).filter((nodePath) => {
    const closestVarDeclCollec = j(nodePath).closest(j.VariableDeclaration);

    const variableDeclarationNodePath = closestVarDeclCollec.paths()[0];

    return isFixableDeclaration(variableDeclarationNodePath);
  });

  // group declarators with common variable name
  const groupedVarDeclaratorNodePathsByName = _.chain(variableDeclaratorCollec.paths())
    .groupBy((nodePath) => {
      return nodePath.value.id.name;
    })
    .value();

  const variableNames = Object.keys(groupedVarDeclaratorNodePathsByName);

  // console.log('\nPrinting Variable Names - %s\n', JSON.stringify(variableNames));

  variableNames.forEach((variable) => {
    // console.log('\nFixing Variable - %s\n', variable);

    const groupedVarNodePaths = groupedVarDeclaratorNodePathsByName[variable];

    // group nodes with common scope together
    const groupedVarNodePathsByScope = _.chain(groupedVarNodePaths)
      .groupBy((path) => j(path).closestScope().get(0).scope.path.value.start)
      .value();

    const scopesStart = Object.keys(groupedVarNodePathsByScope);

    scopesStart.forEach((start) => {
      const groupedByStartNodePaths = groupedVarNodePathsByScope[start];

      const groupedCollection = j(groupedByStartNodePaths);

      const closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start, 10) });

      // Declaration is not at the block level in the current scope
      const shouldReDeclareVariable = handleCurrentStateOfDeclarators(closestScopeCollec, groupedCollection);

      if (shouldReDeclareVariable) {
        handleScopeByType(closestScopeCollec, variable, file.path);
      }
    });
  });

  const transformsedVars = variableDeclaratorCollec.size();

  // Handle Multiple Decl ForStatements Separately
  const transformedMultipleDeclaratorForStatements = root
    .find(j.ForStatement)
    .filter((path) => {
      const forStatementInitNode = path.value.init;

      return forStatementInitNode && forStatementInitNode.type === 'VariableDeclaration';
    })
    .filter((path) => {
      return path.value.init.declarations.length > 1;
    })
    .forEach((nodePath) => {
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
    })
    .size();

  // Multiple declarators with any init value
  const transformedMultipleDeclaratorWithInitValue = root
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
    .filter(isFixableDeclaration)
    .forEach((nodePath) => {
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
    })
    .size();

  return transformsedVars || transformedMultipleDeclaratorForStatements || transformedMultipleDeclaratorWithInitValue
    ? root.toSource(printOptions)
    : null;
};
