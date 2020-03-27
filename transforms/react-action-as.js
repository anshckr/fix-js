const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');

const j = jscodeshift;

/**
 * { Transforms all named export actions use 'as' while importing.
 * Also converts the 'bindActionCreators' objectExpressionNode to use the as imported action }
 *
 * @param      {String}   filePath                Path of the file to fix
 * @param      {Boolean}  [updateInplace=false]   Whether to update the file or not
 * @return     {String}   { Transformed string to write to the file }
 */
const transformActionAs = (filePath, updateInplace = false) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  console.log('\nFixing FileName - %s\n', filePath);

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const root = j(source);

  const callExpCollection = root.find(j.CallExpression, (node) => {
    return node.callee.name === 'bindActionCreators';
  });

  if (callExpCollection.length) {
    // fix only if bindActionCreators is present in the file
    const importDeclCollection = root.find(j.ImportDeclaration, (node) => {
      return node.source.type === 'Literal' && node.source.value.indexOf('actions') !== -1;
    });

    importDeclCollection.forEach((nodePath) => {
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
    });

    callExpCollection.forEach((nodePath) => {
      const objectExpressNode = nodePath.value.arguments.find((node) => {
        return node.type === 'ObjectExpression';
      });

      objectExpressNode.properties = objectExpressNode.properties.map((property) => {
        if (property.key.name === property.value.name) {
          return j.property('init', j.identifier(property.key.name), j.identifier(`${property.key.name}Action`));
        }

        return property;
      });
    });
  }

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};

module.exports = transformActionAs;
