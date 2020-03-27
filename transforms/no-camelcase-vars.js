const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');
const _ = require('lodash');

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

const isFixableVariable = (variableName) => {
  let isEligibleVariable = false;

  if (isNotCamelCased(variableName) || isSnakeCasedVar(variableName)) {
    isEligibleVariable = true;
  }

  if (isJqueryObjVar(variableName)) {
    const nonJqueryName = getNonJqueryName(variableName);

    if (isNotCamelCased(nonJqueryName)) {
      isEligibleVariable = true;
    }
  }

  return isEligibleVariable;
};

const getAndFixIdentifiers = (nodePathCollection, variableName) => {
  const depUsageCollec = nodePathCollection.find(j.Identifier, { name: variableName }).filter((depPath) => {
    if (depPath.name === 'property') {
      return depPath.parentPath.value.computed;
    }

    return !['key'].includes(depPath.name);
  });

  depUsageCollec.forEach((depUsagePath) => {
    const depName = depUsagePath.value.name;

    if (isNotCamelCased(depName) || isSnakeCasedVar(depName)) {
      depUsagePath.value.name = _.camelCase(depName);
    }

    if (isJqueryObjVar(depName)) {
      const nonJqueryName = getNonJqueryName(depName);

      depUsagePath.value.name = `$${_.camelCase(nonJqueryName)}`;
    }
  });
};

const fixFunctionParams = (nodePath) => {
  nodePath.value.params.forEach((paramNode) => {
    const variableName = paramNode.name;

    if (isFixableVariable(variableName)) {
      getAndFixIdentifiers(j(nodePath), variableName);
    }
  });
};

/**
 * { Transformer to fix all the non camel cased variables from a JS file }
 *
 * @param      {String}   filePath                Path of the file to fix
 * @param      {Boolean}  [updateInplace=false]   Whether to update the file or not
 * @param      {Object}   [collectedGlobals={}]   Contains two keys globalsExposed, dependencies for the file
 * @return     {String}   { Transformed string to write to the file }
 */
const transformNoCamelCaseVars = (filePath, updateInplace = false, collectedGlobals = {}) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  console.log('\nFixing FileName - %s\n', filePath);

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const root = j(source);

  // Fix all variable declaration
  root
    .find(j.VariableDeclarator, (node) => {
      const variableName = node.id.name;

      return isFixableVariable(variableName);
    })
    .forEach((path) => {
      const variableName = path.value.id.name;

      const closestScopeCollec = j(path).closestScope();

      getAndFixIdentifiers(closestScopeCollec, variableName);
    });

  // fix dependencies
  if (collectedGlobals.dependencies) {
    collectedGlobals.dependencies.forEach(({ name: variableName }) => {
      if (isFixableVariable(variableName)) {
        getAndFixIdentifiers(root, variableName);
      }
    });
  }

  // Fix all functional declarations
  const functionDeclaratorCollec = root.find(j.FunctionDeclaration);

  functionDeclaratorCollec.forEach((nodePath) => {
    // Fix all functional params
    fixFunctionParams(nodePath);

    // fix function names
    const variableName = nodePath.value.id.name;

    if (
      !(collectedGlobals.globalsExposed && collectedGlobals.globalsExposed.includes(variableName)) &&
      isFixableVariable(variableName)
    ) {
      // Function name is not camel cased
      nodePath.value.id.name = _.camelCase(variableName);

      // alter function invocations
      root
        .find(j.CallExpression, (callExpressionNode) => {
          return callExpressionNode.callee.name === variableName;
        })
        .forEach((callExpressionNodePath) => {
          callExpressionNodePath.value.callee.name = _.camelCase(callExpressionNodePath.value.callee.name);
        });

      // alter exposed property values
      root
        .find(j.Property, (propertyNode) => {
          return propertyNode.value.name === variableName;
        })
        .forEach((propertyNodePath) => {
          propertyNodePath.value.value.name = _.camelCase(propertyNodePath.value.value.name);
        });
    }
  });

  // Fix all functional expressions params
  const functionExpressionCollec = root.find(j.FunctionExpression);

  functionExpressionCollec.forEach((nodePath) => {
    // Fix all functional params
    fixFunctionParams(nodePath);
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};

module.exports = transformNoCamelCaseVars;
