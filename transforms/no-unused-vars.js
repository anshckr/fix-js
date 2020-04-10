module.exports = (file, api, options) => {
  const j = api.jscodeshift;

  const printOptions = options.printOptions || { quote: 'single' };
  const root = j(file.source);

  // console.log('\nFixing FilePath - %s\n', file.path);

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

  const fixFunctionalNodePath = (nodePath) => {
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

  return transformedFunctionExpression || transformedFunctionDeclaration ? root.toSource(printOptions) : null;
};
