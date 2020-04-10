const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');

const j = jscodeshift;

const isParamGettingUsed = (nodePathCollection, variableName) => {
  const depUsageCollec = nodePathCollection.find(j.Identifier, { name: variableName }).filter((depPath) => {
    if (depPath.name === 'property') {
      return depPath.parentPath.value.computed;
    }

    return !['key'].includes(depPath.name);
  });

  return depUsageCollec.length - 1;
};

const isVarGettingUsed = (nodePathCollection, variableName) => {
  const depUsageCollec = nodePathCollection.find(j.Identifier, { name: variableName }).filter((depPath) => {
    if (depPath.name === 'property') {
      return depPath.parentPath.value.computed;
    }

    return !['key'].includes(depPath.name);
  });

  return depUsageCollec.length;
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

/**
 * { Transformer to fix eslint no-unused-var rule }
 *
 * @param      {String}   filePath                Path of the file to fix
 * @param      {Boolean}  [updateInplace=false]   Whether to update the file or not
 * @return     {String}   { Transformed string to write to the file }
 */
const transformNoUnusedVars = (filePath, updateInplace = false) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  // const ast = acorn.parse(source, {
  //   loc: true
  // });

  const root = j(source);

  console.log('\nFixing FilePath - %s\n', filePath);

  const functionExpressionCollec = root.find(j.FunctionExpression);

  functionExpressionCollec.forEach((nodePath) => {
    const lastUsedParamIndex = getLastUsedParamIndex(nodePath);

    if (lastUsedParamIndex !== -1) {
      nodePath.value.params = nodePath.value.params.slice(0, lastUsedParamIndex + 1);
    } else {
      nodePath.value.params = [];
    }

    const variableDeclarationCollec = j(nodePath).find(j.VariableDeclaration);

    variableDeclarationCollec.forEach((varDeclNodePath) => {
      varDeclNodePath.value.declarations = varDeclNodePath.value.declarations.filter((declarationNode) => {
        if (declarationNode.id && !isVarGettingUsed(j(nodePath), declarationNode.id.name)) {
          return false;
        }

        return true;
      });

      if (!varDeclNodePath.value.declarations.length) {
        // remove that var declaration
        varDeclNodePath.replace();
      }
    });
  });

  const functionDeclaratorCollec = root.find(j.FunctionDeclaration);

  functionDeclaratorCollec.forEach((nodePath) => {
    const lastUsedParamIndex = getLastUsedParamIndex(nodePath);

    if (lastUsedParamIndex !== -1) {
      nodePath.value.params = nodePath.value.params.slice(0, lastUsedParamIndex + 1);
    } else {
      nodePath.value.params = [];
    }

    const variableDeclarationCollec = j(nodePath).find(j.VariableDeclaration);

    variableDeclarationCollec.forEach((varDeclNodePath) => {
      varDeclNodePath.value.declarations = varDeclNodePath.value.declarations.filter((declarationNode) => {
        if (declarationNode.id && !isVarGettingUsed(j(nodePath), declarationNode.id.name)) {
          return false;
        }

        return true;
      });

      if (!varDeclNodePath.value.declarations.length) {
        // remove that var declaration
        varDeclNodePath.replace();
      }
    });
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};

module.exports = transformNoUnusedVars;
