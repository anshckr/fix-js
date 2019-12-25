const fs = require('fs');
const jscodeshift = require('jscodeshift');
const _ = require('lodash');
const acorn = require('acorn');
const findGlobals = require('acorn-globals');

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

  const source = fs.readFileSync(filePath, { encoding: 'utf8' });

  const ast = acorn.parse(source, {
    loc: true
  });

  const dependencies = findGlobals(ast).filter((dep) => allExternalDeps.indexOf(dep.name) === -1);

  const root = j(source);

  console.log('\nFixing FilePath - %s\n', filePath);

  dependencies.forEach(({ name, nodes }) => {
    console.log('Fixing Dependency - %s\n', name);

    const nodesStart = _.map(nodes, 'start');

    const nodePathsCollection = root.find(
      j.Identifier,
      (path) => name === path.name && nodesStart.includes(path.start)
    );

    if (!nodePathsCollection.length) {
      console.log('\nFixing FilePath - %s\nNo matching nodes found for dependency - %s\n', filePath, name);
      return;
    }

    // fix only dependencies with AssignmentExpression, ex: a = 1;
    const identifiersWithinAssignExpCollection = nodePathsCollection.filter(
      (path) => path.parentPath.value.type === 'AssignmentExpression'
    );

    if (identifiersWithinAssignExpCollection.length === nodePathsCollection.length) {
      const standaloneExpressionStatement = identifiersWithinAssignExpCollection.closest(j.ExpressionStatement);

      // only one references to the variable and that too not at Program level then directly remove its expression
      if (
        standaloneExpressionStatement.length &&
        standaloneExpressionStatement.closestScope().paths()[0].value.type !== 'Program'
      ) {
        standaloneExpressionStatement.paths()[0].replace();
      }
    }
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(filePath, results.replace(/;;/g, ';'));
  }

  return results;
};
