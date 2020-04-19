const _ = require('lodash');
const acorn = require('acorn');
const findGlobals = require('acorn-globals');

// global objects
const constants = require('../static/constants.json');

const allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

module.exports = (file, api, options) => {
  const j = api.jscodeshift;

  const printOptions = options.printOptions || { quote: 'single' };
  const root = j(file.source);

  // console.log('\nFixing FilePath - %s\n', filePath);

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
    return jqueryObjName.split('$').slice(-1).join('$');
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

  const transformExposedFuncs = options['fix-exposed-functions'] || false;
  const transformDependencies = options['fix-dependencies'] || false;

  // Fix all variable declarators
  const transformsedVarDeclarators = root
    .find(j.VariableDeclarator, (node) => {
      const variableName = node.id.name;

      return isFixableVariable(variableName);
    })
    .forEach((path) => {
      const variableName = path.value.id.name;

      const closestScopeCollec = j(path).closestScope();

      getAndFixIdentifiers(closestScopeCollec, variableName);
    })
    .size();

  // fix dependencies
  if (transformDependencies) {
    // get dependencies and fix them
    const ast = acorn.parse(file.source, {
      loc: true
    });

    let dependencies = findGlobals(ast).filter((dep) => allExternalDeps.indexOf(dep.name) === -1);

    dependencies = [...new Set(dependencies)];

    dependencies.forEach(({ name: variableName }) => {
      if (isFixableVariable(variableName)) {
        getAndFixIdentifiers(root, variableName);
      }
    });
  }

  // Fix all functional declarations
  const transformsedFuncDeclarations = root
    .find(j.FunctionDeclaration)
    .filter((nodePath) => {
      return transformExposedFuncs || !nodePath.scope.parent.isGlobal;
    })
    .filter((nodePath) => {
      return (
        isFixableVariable(nodePath.value.id.name) ||
        nodePath.value.params.find((paramNode) => {
          const variableName = paramNode.name;

          return isFixableVariable(variableName);
        })
      );
    })
    .forEach((nodePath) => {
      // Fix all functional params
      fixFunctionParams(nodePath);

      // fix function names
      const variableName = nodePath.value.id.name;

      if (isFixableVariable(variableName)) {
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

        // alter call expression arguments
        root
          .find(j.Identifier, (identifierNode) => {
            return identifierNode.name === variableName;
          })
          .filter((identifierNodePath) => {
            return identifierNodePath.parent.value.type === 'CallExpression';
          })
          .forEach((identifierNodePath) => {
            identifierNodePath.value.name = _.camelCase(identifierNodePath.value.name);
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
            memberExpNodePath.value.object.name = _.camelCase(memberExpNodePath.value.object.name);
          });
      }
    })
    .size();

  // Fix all functional expressions
  const transformsedFuncExpressions = root
    .find(j.FunctionExpression)
    .filter((nodePath) => {
      return transformExposedFuncs || !nodePath.scope.parent.isGlobal;
    })
    .filter((nodePath) => {
      return (
        (nodePath.value.id && isFixableVariable(nodePath.value.id.name)) ||
        nodePath.value.params.find((paramNode) => {
          const variableName = paramNode.name;

          return isFixableVariable(variableName);
        })
      );
    })
    .forEach((nodePath) => {
      // Fix all functional params
      fixFunctionParams(nodePath);

      // fix function names
      if (nodePath.value.id) {
        const variableName = nodePath.value.id.name;

        if (isFixableVariable(variableName)) {
          // Function name is not camel cased
          nodePath.value.id.name = _.camelCase(variableName);
        }
      }
    })
    .size();

  return transformsedVarDeclarators || transformsedFuncDeclarations || transformsedFuncExpressions
    ? root.toSource(printOptions)
    : null;
};
