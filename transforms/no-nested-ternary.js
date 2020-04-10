module.exports = (file, api, options) => {
  const j = api.jscodeshift;

  const printOptions = options.printOptions || { quote: 'single' };
  const root = j(file.source);

  // console.log('\nFixing FilePath - %s\n', file.path);

  const constructBlockStatement = (conditionExpressionNode, type, variableName = null) => {
    const blockStatementNodes = [];

    if (conditionExpressionNode[type].type === 'ConditionalExpression') {
      blockStatementNodes.push(
        constructIfElseBlockFromConditionalExpression(conditionExpressionNode[type], variableName)
      );
    } else if (variableName) {
      blockStatementNodes.push(
        j.expressionStatement(j.assignmentExpression('=', j.identifier(variableName), conditionExpressionNode[type]))
      );
    } else {
      blockStatementNodes.push(j.returnStatement(conditionExpressionNode[type]));
    }

    return j.blockStatement(blockStatementNodes);
  };

  const constructIfElseBlockFromConditionalExpression = (conditionExpressionNode, variableName = null) => {
    const ifStatementNode = j.ifStatement(
      conditionExpressionNode.test,
      constructBlockStatement(conditionExpressionNode, 'consequent', variableName),
      constructBlockStatement(conditionExpressionNode, 'alternate', variableName)
    );

    return ifStatementNode;
  };

  const constructIIFE = (conditionExpressionNode) => {
    const blockStatementNodes = [constructIfElseBlockFromConditionalExpression(conditionExpressionNode)];

    const blockStatement = j.blockStatement(blockStatementNodes);

    return j.callExpression(j.functionExpression(null, [], blockStatement), []);
  };

  const conditionExpressionCollec = root.find(j.ConditionalExpression, (node) => {
    return node.consequent.type === 'ConditionalExpression' || node.alternate.type === 'ConditionalExpression';
  });

  const didTransform = conditionExpressionCollec
    .forEach((nodePath) => {
      nodePath.replace(constructIIFE(nodePath.value));
    })
    .size();

  return didTransform ? root.toSource(printOptions) : null;
};
