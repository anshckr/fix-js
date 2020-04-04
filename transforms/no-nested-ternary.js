const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');

const j = jscodeshift;

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

/**
 * { Fixes eslint no-nested-ternary rule by converting the
 * nested ConditionalExpressions into an IIFE block with If/Else Statements }
 *
 * @param      {String}   filePath                Path of the file to fix
 * @param      {Boolean}  [updateInplace=false]   Whether to update the file or not
 * @return     {String}   { Transformed string to write to the file }
 */
const transformNoNestedTernary = (filePath, updateInplace = false) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const root = j(source);

  console.log('\nFixing FilePath - %s\n', filePath);

  // debugger;

  const conditionExpressionCollec = root.find(j.ConditionalExpression, (node) => {
    return node.consequent.type === 'ConditionalExpression' || node.alternate.type === 'ConditionalExpression';
  });

  conditionExpressionCollec.forEach((nodePath) => {
    const conditionExpParentNodePath = nodePath.parent;

    switch (conditionExpParentNodePath.value.type) {
      case 'VariableDeclarator':
      case 'BinaryExpression':
      case 'AssignmentExpression':
      case 'ReturnStatement':
      case 'CallExpression':
      case 'Property': {
        nodePath.replace(constructIIFE(nodePath.value));

        break;
      }
      default: {
        console.log('\nUnhandled ConditionalExpression Parent: %s', conditionExpParentNodePath.value.type);
      }
    }
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};

module.exports = transformNoNestedTernary;
