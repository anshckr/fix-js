const _ = require('lodash');

module.exports = (file, api, options) => {
  const j = api.jscodeshift;

  const printOptions = options.printOptions || { quote: 'single' };
  const root = j(file.source);

  console.log('\nFixing FilePath - %s\n', file.path);

  const isParamGettingUsed = (nodePathCollection, variableName) => {
    const depUsageCollec = nodePathCollection.find(j.Identifier, { name: variableName }).filter((depPath) => {
      if (depPath.name === 'property') {
        return depPath.parentPath.value.computed;
      }

      return !['key'].includes(depPath.name);
    });

    return depUsageCollec.length - 1;
  };

  const checkIfVarGettingUsed = (nodePathCollection, variableName) => {
    const depUsageCollec = nodePathCollection
      .find(j.Identifier, { name: variableName })
      .filter((depPath) => {
        if (depPath.name === 'property') {
          return depPath.parentPath.value.computed;
        }

        return !['key'].includes(depPath.name);
      })
      .filter((nodePath) => {
        if (nodePath.parent.value.type !== 'AssignmentExpression') {
          return true;
        }

        if (nodePath.name === 'left') {
          return nodePath.parent.value.operator !== '=';
        }

        // parent is a AssignmentExpression then node.name should not be 'left'
        return nodePath.name !== 'left';
      });

    return depUsageCollec.length - 1;
  };

  const checkIfFunctionGettingUsed = (functionName) => {
    // check function invocations
    const functionIsInvoked = root
      .find(j.CallExpression, (callExpressionNode) => {
        return callExpressionNode.callee && callExpressionNode.callee.name === functionName;
      })
      .size();

    // check exposed property values
    const functionIsReturned = root
      .find(j.Property, (propertyNode) => {
        return propertyNode.value.name === functionName;
      })
      .size();

    // check call expression arguments
    const functionHasCallExpression = root
      .find(j.Identifier, (identifierNode) => {
        return identifierNode.name === functionName;
      })
      .filter((identifierNodePath) => {
        return identifierNodePath.parent.value.type === 'CallExpression';
      })
      .size();

    // check member expression with call, bind, apply
    const functionIsGettingBinded = root
      .find(j.MemberExpression, (memberExpNode) => {
        return (
          memberExpNode.object.name === functionName && ['call', 'bind', 'apply'].includes(memberExpNode.property.name)
        );
      })
      .size();

    // check ArrayExpression
    const functionUsedInArray = root
      .find(j.ArrayExpression, (arrayExpNode) => {
        return arrayExpNode.elements.find((ele) => {
          return ele.name === functionName;
        });
      })
      .size();

    // check AssignmentExpressions
    const functionUsedInAssignmentExp = root
      .find(j.AssignmentExpression, (assignExpNode) => {
        return assignExpNode.right.name === functionName;
      })
      .size();

    // check F.prototype
    const functionPrototypeInvokedUsed = root
      .find(j.MemberExpression, (memExpNode) => {
        return memExpNode.property.name === 'prototype' && memExpNode.object.name === functionName;
      })
      .size();

    // check new F();
    const functionInstanceUsed = root
      .find(j.NewExpression, (newExpNode) => {
        return newExpNode.callee.name === functionName;
      })
      .size();

    const functionUsedInVarDeclarator = root
      .find(j.VariableDeclarator, (varDeclNode) => {
        return (
          varDeclNode.init &&
          j(varDeclNode.init)
            .find(j.Identifier, {
              name: functionName
            })
            .filter((identifierNodePath) => {
              return !['FunctionDeclaration', 'FunctionExpression'].includes(identifierNodePath.parent.value.type);
            })
            .size()
        );
      })
      .size();

    return (
      functionIsInvoked ||
      functionIsReturned ||
      functionHasCallExpression ||
      functionIsGettingBinded ||
      functionUsedInArray ||
      functionUsedInAssignmentExp ||
      functionPrototypeInvokedUsed ||
      functionInstanceUsed ||
      functionUsedInVarDeclarator
    );
  };

  const getLastUsedParamIndex = (nodePath) => {
    let lastUsedParamIndex = -1;

    nodePath.value.params.forEach((paramNode, index) => {
      const variableName = paramNode.name;

      if (isParamGettingUsed(j(nodePath), variableName)) {
        lastUsedParamIndex = index;
      }
    });

    return lastUsedParamIndex;
  };

  const checkIfDeclaratorIsComplex = (declaratorNode) => {
    return (
      declaratorNode.init &&
      ['CallExpression', 'NewExpression', 'AssignmentExpression'].includes(declaratorNode.init.type)
    );
  };

  const handleDeclarationWithComplexDeclarators = (varDeclarationNodePath, idsOfComplexDeclarators) => {
    const varDeclCollec = j(varDeclarationNodePath);

    const closestScopeCollec = varDeclCollec.closestScope();

    const scopeType = closestScopeCollec.get('type').value;

    let varDeclarationParentType;

    if (scopeType !== 'Program') {
      varDeclarationParentType = varDeclarationNodePath.parent.value.type;
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
      return node.start === varDeclarationNodePath.value.start;
    });

    const [complexDeclarators, nonComplexDeclarators] = _.partition(
      varDeclarationNodePath.value.declarations,
      (declaratorNode) => {
        return idsOfComplexDeclarators.includes(declaratorNode.id.name);
      }
    );

    let leadingCommentNodeIndex = -1;
    let trailingCommentNodeIndex = -1;
    let leadingComments;
    let trailingComments;

    if (varDeclarationNodePath.value.comments) {
      [leadingComments, trailingComments] = _.partition(
        varDeclarationNodePath.value.comments,
        (comment) => comment.leading
      );

      if (leadingComments.length) {
        leadingCommentNodeIndex = index;
      }

      if (trailingComments.length) {
        trailingCommentNodeIndex = index + complexDeclarators.length - 1;
      }
    }

    if (varDeclarationParentType !== 'Program') {
      complexDeclarators.forEach((node) => {
        let expressionStatementToInsert;

        if (varDeclarationParentType !== 'Program') {
          const replacementNode = getReplacementNodeFromRightStatement(node.init);

          if (replacementNode) {
            expressionStatementToInsert = j.expressionStatement(replacementNode);
          }
        }

        if (expressionStatementToInsert) {
          // re-insert just after the variable declaration
          if (node.comments) {
            expressionStatementToInsert.comments = node.comments;
          }

          parentKeyToModify.splice(++index, 0, expressionStatementToInsert);
        }
      });
    } else if (complexDeclarators.length === 1 && complexDeclarators[0].init) {
      const varDeclarator = complexDeclarators[0];

      const expressionStatementToInsert = j.expressionStatement(
        j.assignmentExpression(
          '=',
          j.memberExpression(j.identifier('window'), j.identifier(varDeclarator.id.name)),
          varDeclarator.init
        )
      );

      if (!nonComplexDeclarators.length) {
        expressionStatementToInsert.comments = varDeclarationNodePath.value.comments;
      }

      parentKeyToModify.splice(++index, 0, expressionStatementToInsert);
    } else {
      const varDeclarationToInsert = j.variableDeclaration('var', complexDeclarators);
      const commentsArr = [
        j.commentBlock(' eslint-disable no-unused-vars ', true),
        j.commentBlock(' eslint-enable no-unused-vars ', false, true)
      ];

      if (!nonComplexDeclarators.length && varDeclarationNodePath.value.comments) {
        varDeclarationToInsert.comments = varDeclarationNodePath.value.comments;
      } else {
        varDeclarationToInsert.comments = [];
      }

      varDeclarationToInsert.comments = varDeclarationToInsert.comments.concat(commentsArr);

      parentKeyToModify.splice(++index, 0, varDeclarationToInsert);
    }

    if (leadingCommentNodeIndex !== -1) {
      parentKeyToModify[leadingCommentNodeIndex].comments = leadingComments;
    }

    if (nonComplexDeclarators.length) {
      // keep only used var declarators
      varDeclarationNodePath.value.declarations = nonComplexDeclarators;
    } else {
      // remove the var declarator
      varDeclarationNodePath.replace();
    }

    if (trailingCommentNodeIndex !== -1) {
      parentKeyToModify[trailingCommentNodeIndex].comments = trailingComments;
    }
  };

  const handleRemovalOfAssignmentExp = (assignExpNodePath) => {
    const closestExpStatementCollec = j(assignExpNodePath).closest(j.ExpressionStatement);

    const closestExpStatementNodePath = closestExpStatementCollec.paths()[0];

    let nodeKeyToSearch;

    switch (closestExpStatementNodePath.parent.value.type) {
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

    // check if there are no more statements post this removal
    if (closestExpStatementNodePath.parent.value[nodeKeyToSearch].length === 1) {
      const expStatementParentNodePath = closestExpStatementNodePath.parent;

      if (
        expStatementParentNodePath.parent.value.type === 'IfStatement' &&
        !expStatementParentNodePath.parent.value.alternate
      ) {
        expStatementParentNodePath.parent.replace();
      } else {
        expStatementParentNodePath.replace();
      }
    } else {
      console.log('\nRemoved %s', j(closestExpStatementNodePath).toSource());

      closestExpStatementNodePath.replace();
    }
  };

  const getReplacementNodeFromRightStatement = (rightNode) => {
    let replacementNode;

    switch (rightNode.type) {
      case 'AssignmentExpression': {
        replacementNode = rightNode;

        break;
      }
      case 'NewExpression': {
        const newExpressionNode = rightNode;

        replacementNode = j.callExpression(newExpressionNode.callee, newExpressionNode.arguments);

        break;
      }
      default: {
        replacementNode = '';

        break;
      }
    }

    return replacementNode;
  };

  const fixFunctionalNodePath = (nodePath) => {
    const lastUsedParamIndex = getLastUsedParamIndex(nodePath);

    if (lastUsedParamIndex !== -1) {
      nodePath.value.params = nodePath.value.params.slice(0, lastUsedParamIndex + 1);
    } else {
      nodePath.value.params = [];
    }

    // fix variableDeclaration in current scope
    j(nodePath)
      .find(j.VariableDeclaration)
      .filter((varDeclNodePath) => {
        return varDeclNodePath.scope.node.start === nodePath.value.start;
      })
      .forEach((varDeclNodePath) => {
        let didAlteredDeclaration;

        do {
          didAlteredDeclaration = false;

          const idsOfComplexDeclarators = [];

          const oldDeclaratorsCount = varDeclNodePath.value.declarations.length;

          varDeclNodePath.value.declarations = varDeclNodePath.value.declarations.filter((declaratorNode) => {
            const variableName = declaratorNode.id.name;

            let keepDeclarator = true;

            const isVarGettingUsed = checkIfVarGettingUsed(j(nodePath), variableName);
            const isDeclaratorComplex = checkIfDeclaratorIsComplex(declaratorNode);

            if (!isVarGettingUsed) {
              keepDeclarator = false;

              if (isDeclaratorComplex) {
                keepDeclarator = true;

                idsOfComplexDeclarators.push(variableName);
              }

              // handle AssignmentExpression of variable
              j(nodePath)
                .find(j.AssignmentExpression, (node) => {
                  return node.left.name === variableName;
                })
                .forEach((assignExpNodePath) => {
                  const replacementNode = getReplacementNodeFromRightStatement(assignExpNodePath.value.right);

                  if (replacementNode) {
                    assignExpNodePath.replace(replacementNode);
                  } else {
                    handleRemovalOfAssignmentExp(assignExpNodePath);
                  }
                });
            }

            return keepDeclarator;
          });

          if (varDeclNodePath.value.declarations.length !== oldDeclaratorsCount || idsOfComplexDeclarators.length) {
            didAlteredDeclaration = true;
          }

          if (!varDeclNodePath.value.declarations.length) {
            didAlteredDeclaration = false;
            varDeclNodePath.replace();
          } else if (idsOfComplexDeclarators.length) {
            handleDeclarationWithComplexDeclarators(varDeclNodePath, idsOfComplexDeclarators);
          }
        } while (varDeclNodePath.value && varDeclNodePath.value.declarations.length && didAlteredDeclaration);
      });

    // check if function itself is getting used/not
    if (nodePath.value.id && nodePath.name !== 'right') {
      // fix only if there is function name
      const functionName = nodePath.value.id.name;

      const isFunctionGettingUsed = checkIfFunctionGettingUsed(functionName);

      if (!isFunctionGettingUsed) {
        if (!nodePath.scope.parent.isGlobal) {
          if (nodePath.parent.value.type !== 'CallExpression') {
            console.log('\n Removed Function: %s', functionName);
            nodePath.replace();
          }
        } else {
          const commentToInsert = j.commentLine(' eslint-disable-next-line no-unused-vars', true);

          if (nodePath.value.comments) {
            nodePath.value.comments.push(commentToInsert);
          } else {
            nodePath.value.comments = [commentToInsert];
          }
        }
      }
    }
  };

  const transformedFunctionExpression = root
    .find(j.FunctionExpression)
    .forEach((nodePath) => {
      fixFunctionalNodePath(nodePath);
    })
    .size();

  const transformedFunctionDeclaration = root
    .find(j.FunctionDeclaration)
    .forEach((nodePath) => {
      fixFunctionalNodePath(nodePath);
    })
    .size();

  const transformedProgramDeclaration = root
    .find(j.Program)
    .forEach((nodePath) => {
      // variableDeclaration in Program scope
      const variableDeclarationCollec = j(nodePath)
        .find(j.VariableDeclaration)
        .filter((varDeclNodePath) => {
          return varDeclNodePath.scope.node.start === nodePath.value.start;
        });

      variableDeclarationCollec.forEach((varDeclNodePath) => {
        const idsOfComplexDeclarators = [];

        varDeclNodePath.value.declarations.forEach((declaratorNode) => {
          const variableName = declaratorNode.id.name;

          const isVarGettingUsed = checkIfVarGettingUsed(j(nodePath), variableName);

          if (!isVarGettingUsed) {
            idsOfComplexDeclarators.push(variableName);
          }
        });

        if (idsOfComplexDeclarators.length) {
          handleDeclarationWithComplexDeclarators(varDeclNodePath, idsOfComplexDeclarators);
        }
      });
    })
    .size();

  return transformedFunctionExpression || transformedFunctionDeclaration || transformedProgramDeclaration
    ? root.toSource(printOptions)
    : null;
};
