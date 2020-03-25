const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');
const _ = require('lodash');
const acorn = require('acorn');
const findGlobalsExposed = require('../utils/find-globals-exposed');
// const findGlobals = require('acorn-globals');

const j = jscodeshift;

// global objects
const constants = require('../static/constants.json');

const allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

const isNotCamelCased = (value) => {
  return allExternalDeps.indexOf(value) === -1 && /^[a-z]/.test(value) && !/^[a-z][A-Za-z]*$/.test(value);
};

const isJqueryObjVar = (value) => {
  return allExternalDeps.indexOf(value) === -1 && /^\$[a-zA-Z_]+/.test(value);
};

const isSnakeCasedVar = (value) => {
  return (
    allExternalDeps.indexOf(value) === -1 &&
    /^[a-zA-Z_]+_[a-zA-Z]+/.test(value) &&
    value.toUpperCase() !== value &&
    value.indexOf('__') === -1
  );
};

const getNonJqueryName = (jqueryObjName) => {
  return jqueryObjName
    .split('$')
    .slice(-1)
    .join('$');
};

const getFixableIdentifiers = (nodePathCollection, paramName) => {
  return nodePathCollection.find(j.Identifier, { name: paramName }).filter((depPath) => {
    if (depPath.name === 'property') {
      return depPath.parentPath.value.computed;
    }

    return !['key'].includes(depPath.name);
  });
};

const fixFunctionParams = (nodePathCollection) => {
  nodePathCollection.forEach((nodePath) => {
    const nonCamelCasedParams = [];
    const node = nodePath.value;

    node.params.forEach((paramNode) => {
      const variableName = paramNode.name;

      if (isNotCamelCased(variableName) || isSnakeCasedVar(variableName)) {
        nonCamelCasedParams.push(variableName);
      }
    });

    nonCamelCasedParams.forEach((paramName) => {
      const depUsageCollec = getFixableIdentifiers(j(nodePath), paramName);

      depUsageCollec.forEach((depUsagePath) => {
        depUsagePath.value.name = _.camelCase(depUsagePath.value.name);
      });
    });
  });
};

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

  console.log('\nFixing FileName - %s\n', filePath);

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const ast = acorn.parse(source, {
    loc: true
  });

  const globalsExposed = Object.keys(findGlobalsExposed(ast));

  const root = j(source);

  const varibableDeclaratorCollec = root.find(j.VariableDeclarator, (node) => {
    let isEligibleNode = false;

    const variableName = node.id.name;

    if (isNotCamelCased(variableName) || isSnakeCasedVar(variableName)) {
      isEligibleNode = true;
    }

    if (isJqueryObjVar(variableName)) {
      const nonJqueryName = getNonJqueryName(variableName);

      if (isNotCamelCased(nonJqueryName)) {
        isEligibleNode = true;
      }
    }

    return isEligibleNode;
  });

  // Fix all variable declaration
  varibableDeclaratorCollec.forEach((path) => {
    const depName = path.value.id.name;

    const closestScopeCollec = j(path).closestScope();

    const depUsageCollec = getFixableIdentifiers(closestScopeCollec, depName);

    depUsageCollec.forEach((depUsagePath) => {
      const variableName = depUsagePath.value.name;

      if (isNotCamelCased(variableName) || isSnakeCasedVar(variableName)) {
        depUsagePath.value.name = _.camelCase(variableName);
      }

      if (isJqueryObjVar(variableName)) {
        const nonJqueryName = getNonJqueryName(variableName);

        depUsagePath.value.name = `$${_.camelCase(nonJqueryName)}`;
      }
    });
  });

  // Fix all functional declarations params
  const functionDeclaratorCollec = root.find(j.FunctionDeclaration);
  fixFunctionParams(functionDeclaratorCollec);

  functionDeclaratorCollec.forEach((nodePath) => {
    // fix function names
    const node = nodePath.value;

    if (!globalsExposed.includes(node.id.name) && (isNotCamelCased(node.id.name) || isSnakeCasedVar(node.id.name))) {
      // Function name is not camel cased
      const oldName = node.id.name;
      node.id.name = _.camelCase(node.id.name);

      // alter function invocations
      const callExpressionCollec = root.find(j.CallExpression, (callExpressionNode) => {
        return callExpressionNode.callee.name === oldName;
      });

      callExpressionCollec.forEach((callExpressionNodePath) => {
        callExpressionNodePath.value.callee.name = _.camelCase(callExpressionNodePath.value.callee.name);
      });

      // alter exposed property values
      const propertyCollec = root.find(j.Property, (propertyNode) => {
        return propertyNode.value.name === oldName;
      });

      propertyCollec.forEach((propertyNodePath) => {
        propertyNodePath.value.value.name = _.camelCase(propertyNodePath.value.value.name);
      });
    }
  });

  // Fix all functional expressions params
  const functionExpressionCollec = root.find(j.FunctionExpression);
  fixFunctionParams(functionExpressionCollec);

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};
