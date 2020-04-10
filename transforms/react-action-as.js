module.exports = (file, api, options) => {
  const j = api.jscodeshift;

  const printOptions = options.printOptions || { quote: 'single' };
  const root = j(file.source);

  // console.log('\nFixing FilePath - %s\n', file.path);

  const didTransformObjExpression = root
    .find(j.CallExpression, (node) => {
      return node.callee.name === 'bindActionCreators';
    })
    .forEach((nodePath) => {
      const objectExpressNode = nodePath.value.arguments.find((node) => {
        return node.type === 'ObjectExpression';
      });

      objectExpressNode.properties = objectExpressNode.properties.map((property) => {
        if (property.key.name === property.value.name) {
          return j.property('init', j.identifier(property.key.name), j.identifier(`${property.key.name}Action`));
        }

        return property;
      });
    })
    .size();

  const didTransformImports = root
    .find(j.ImportDeclaration, (node) => {
      return node.source.type === 'Literal' && node.source.value.indexOf('actions') !== -1;
    })
    .forEach((nodePath) => {
      nodePath.value.specifiers = nodePath.value.specifiers.map((specifier) => {
        if (specifier.type !== 'ImportSpecifier') {
          return specifier;
        }

        if (specifier.imported.name === specifier.local.name) {
          return j.importSpecifier(
            j.identifier(specifier.imported.name),
            j.identifier(`${specifier.imported.name}Action`)
          );
        }

        return specifier;
      });
    })
    .size();

  return didTransformImports || didTransformObjExpression ? root.toSource(printOptions) : null;
};
