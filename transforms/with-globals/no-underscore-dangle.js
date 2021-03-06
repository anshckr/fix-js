const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');
// const _ = require('lodash');

const j = jscodeshift;

// global objects
const constants = require('../../static/constants.json');

const allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

const hasDanglingUnderscore = (value, isFunctionalParam = false) => {
  let leadingRegex = /^__[a-zA-Z]+/;

  if (isFunctionalParam) {
    leadingRegex = /^_[a-zA-Z_]+/;
  }

  return (
    allExternalDeps.indexOf(value) === -1 &&
    (leadingRegex.test(value) || /^[a-zA-Z]+_$/.test(value)) &&
    value.toUpperCase() !== value
  );
};

const replaceDanglingUnderscore = (value, isFunctionalParam = false) => {
  if (/^__/.test(value) && !isFunctionalParam) {
    return value.replace(/__/g, '_');
  }

  return value.replace(/_/g, '');
};

const isFixableVariable = (variableName, isFunctionalParam = false) => {
  let isEligibleVariable = false;

  if (hasDanglingUnderscore(variableName, isFunctionalParam)) {
    isEligibleVariable = true;
  }

  return isEligibleVariable;
};

const getAndFixIdentifiers = (nodePathCollection, variableName, isFunctionalParam = false) => {
  const depUsageCollec = nodePathCollection.find(j.Identifier, { name: variableName }).filter((depPath) => {
    if (depPath.name === 'property') {
      return depPath.parentPath.value.computed;
    }

    return !['key'].includes(depPath.name);
  });

  depUsageCollec.forEach((depUsagePath) => {
    const depName = depUsagePath.value.name;

    if (hasDanglingUnderscore(depName, isFunctionalParam)) {
      depUsagePath.value.name = replaceDanglingUnderscore(depName, isFunctionalParam);
    }
  });
};

const fixFunctionParams = (nodePath) => {
  nodePath.value.params.forEach((paramNode) => {
    const variableName = paramNode.name;

    if (isFixableVariable(variableName, true)) {
      getAndFixIdentifiers(j(nodePath), variableName, true);
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
const transformNoUnderscoreDangle = (filePath, updateInplace = false, collectedGlobals = {}) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  // console.log('\nFixing FileName - %s\n', filePath);

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
      nodePath.value.id.name = replaceDanglingUnderscore(variableName);

      // alter function invocations
      root
        .find(j.CallExpression, (callExpressionNode) => {
          return callExpressionNode.callee.name === variableName;
        })
        .forEach((callExpressionNodePath) => {
          callExpressionNodePath.value.callee.name = replaceDanglingUnderscore(
            callExpressionNodePath.value.callee.name
          );
        });

      // alter exposed property values
      root
        .find(j.Property, (propertyNode) => {
          return propertyNode.value.name === variableName;
        })
        .forEach((propertyNodePath) => {
          propertyNodePath.value.value.name = replaceDanglingUnderscore(propertyNodePath.value.value.name);
        });

      // alter call expression arguments
      root
        .find(j.Identifier, (identifierNode) => {
          return identifierNode.name === variableName;
        })
        .filter((identifierNodePath) => {
          return identifierNodePath.parent.value.type === 'CallExpression';
        })
        .forEach((identifierNodePath) => {
          identifierNodePath.value.name = replaceDanglingUnderscore(identifierNodePath.value.name);
        });

      // alter member expression with call, bind, apply
      root
        .find(j.MemberExpression, (memberExpNode) => {
          return (
            memberExpNode.object.name === variableName &&
            ['call', 'bind', 'apply'].includes(memberExpNode.property.name)
          );
        })
        .forEach((memberExpNodePath) => {
          memberExpNodePath.value.object.name = replaceDanglingUnderscore(memberExpNodePath.value.object.name);
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

module.exports = transformNoUnderscoreDangle;
