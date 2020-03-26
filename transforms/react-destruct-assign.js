const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');
const _ = require('lodash');

const j = jscodeshift;

/**
 * { Transformer to fix react/destructuring-assignment rule }
 *
 * @param      {String}   filePath                Path of the file to fix
 * @param      {Boolean}  [updateInplace=false]   Whether to update the file or not
 * @return     {String}   { Transformed string to write to the file }
 */
module.exports = (filePath, updateInplace = false) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  console.log('\nFixing FileName - %s\n', filePath);

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const root = j(source);

  ['props', 'state'].forEach((type) => {
    const nodePathsCollection = root
      .find(j.MemberExpression, (node) => {
        return node.object.type === 'ThisExpression' && node.property.name === type;
      })
      .filter((nodePath) => {
        return nodePath.parentPath.value.type === 'MemberExpression';
      });

    // group nodes with common scope together
    const groupedByScopeNodePathsObj = _.chain(nodePathsCollection.paths())
      .groupBy(
        (path) =>
          j(path)
            .closestScope()
            .get(0).scope.path.value.start
      )
      .value();

    const scopesStart = Object.keys(groupedByScopeNodePathsObj);

    scopesStart.forEach((start) => {
      const nodePaths = groupedByScopeNodePathsObj[start];

      const groupedCollection = j(nodePaths);

      let closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start, 10) });

      let dependencies = [];

      groupedCollection.forEach((nodePath) => {
        dependencies.push(nodePath.parentPath.value.property.name);

        j(nodePath)
          .closest(j.MemberExpression)
          .paths()[0]
          .replace(nodePath.parentPath.value.property);
      });

      let blockStatementCollec = closestScopeCollec.find(j.BlockStatement);

      if (!blockStatementCollec.length) {
        closestScopeCollec = closestScopeCollec.closest(j.FunctionExpression);

        blockStatementCollec = closestScopeCollec.find(j.BlockStatement);
      }

      const blockStatementNode = blockStatementCollec
        .paths()
        .find((path) => path.parent === closestScopeCollec.paths()[0]).node;

      const thisPropsCollec = closestScopeCollec.find(j.VariableDeclarator, (node) => {
        return (
          node.init &&
          node.init.type === 'MemberExpression' &&
          node.init.object.type === 'ThisExpression' &&
          node.init.property.type === 'Identifier' &&
          node.init.property.name === type
        );
      });

      if (thisPropsCollec.length) {
        // there is already const declaration inside BlockStatement
        const objectExpressionProperties = thisPropsCollec.get('id').value.properties;

        const alreadyDeclaredProps = objectExpressionProperties.map((property) => {
          return property.value.name;
        });

        dependencies = _.uniq(dependencies).filter((dep) => {
          return !alreadyDeclaredProps.includes(dep);
        });

        const newProperties = dependencies.map((dep) => {
          return j.property('init', j.identifier(dep), j.identifier(dep));
        });

        thisPropsCollec.get('id').value.properties = objectExpressionProperties.concat(newProperties);
      } else {
        const newProperties = _.uniq(dependencies).map((dep) => {
          return j.property('init', j.identifier(dep), j.identifier(dep));
        });
        // declare at each scope level
        blockStatementNode.body.unshift(
          j.variableDeclaration('const', [
            j.variableDeclarator(
              j.objectPattern(newProperties),
              j.memberExpression(j.thisExpression(), j.identifier(type))
            )
          ])
        );
      }
    });
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};
