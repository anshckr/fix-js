const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');
const _ = require('lodash');
const acorn = require('acorn');
const jsx = require('acorn-jsx');
// const findGlobals = require('acorn-globals');

const j = jscodeshift;

// global objects
const constants = require('../static/constants.json');

const allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

/**
 * { Transformer to fix all the unused assigned variables from a JS file }
 *
 * @param      {String}   filePath                Path of the file to fix
 * @param      {Boolean}  [updateInplace=false]   Whether to update the file or not
 * @return     {String}   { Transformed string to write to the file }
 */
module.exports = (filePath, updateInplace = false) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  // if (/accounts\/common\.js/.test(filePath)) {
  //   debugger;
  // }

  console.log('\nFixing FileName - %s\n', filePath);

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const ast = acorn.Parser.extend(jsx()).parse(source, {
    loc: true,
    sourceType: 'module'
  });

  const root = j(source);

  debugger;

  const nodePathsCollection = root.find(j.MemberExpression, (node) => {
    return (
      node.object.type === 'ThisExpression' &&
      node.property.name === 'props'
    );
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

    const closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start, 10) });

    const dependencies = [];

    groupedCollection.forEach((node) => {
      dependencies.push(node.parentPath.value.property.name);
    });

    // const constDeclarationCollec = blockStatementNode.body.find((node) => {
    //   return node.type === 'VariableDeclaration' && node.type === 'const';
    // });

    // let constDeclaration;

    // constDeclarationCollec.forEach((nodePath) => {});

    const objectPropertiesArr = dependencies.map((dep) => {
      return j.Property('init', j.identifier(dep), j.identifier(dep));
    });

    if (false) {
      // there is already const declaration inside BlockStatement
      // j(constDeclaration)
      //   .get('declarations')
      //   .push(j.variableDeclarator(j.identifier(depName), null));
    } else {
      // declare at each scope level
      const blockStatementNode = closestScopeCollec
        .find(j.BlockStatement)
        .paths()
        .find((path) => path.parent === closestScopeCollec.paths()[0]).node;

      blockStatementNode.body.unshift(
        j.variableDeclaration('const', [
          j.variableDeclarator(
            j.objectPattern(objectPropertiesArr),
            j.memberExpression(j.thisExpression, j.identifier('props'))
          )
        ])
      );
    }
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};
