const fs = require('fs');
const { resolve, extname } = require('path');
const acorn = require('acorn');
const findGlobals = require('acorn-globals');

// In newer Node.js versions where process is already global this isn't necessary.
const process = require('process');

// utils
const findGlobalsExposed = require('./utils/find-globals-exposed');

// global objects
const constants = require('./static/constants.json');

// transformers
const transformLeakingGlobalsVars = require('./transforms/leaking-global-vars');
const transformUnusedAssignedVars = require('./transforms/unused-assigned-vars');
const transformNoCamelCaseVars = require('./transforms/no-camelcase-vars');
const transformDestructAssign = require('./transforms/react-destruct-assign');
const transformActionAs = require('./transforms/react-action-as');
const transformBlockScopedVar = require('./transforms/block-scoped-vars');
const transformNoLonelyIf = require('./transforms/no-lonely-if');
const transformNoNestedTernary = require('./transforms/no-nested-ternary');

/* will be ignored in dependencies -- start */

const allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

let ignoreableExternalDeps = [];

let ignoreFilesRegex;
let ignoreFoldersRegex;

/* will be ignored in dependencies -- end */

let allGlobalDeps = [];

let allGlobalsExposed = [];

let fixOnlyDependencies = false;

function recursiveDirFilesIterator(dirPath, cb) {
  const files = fs.readdirSync(resolve(__dirname, dirPath), { withFileTypes: true });

  files.forEach((file) => {
    const filePath = resolve(dirPath, file.name);

    if (file.isFile()) {
      if (ignoreFilesRegex.test(file.name) || !['.js', '.jsx'].includes(extname(file.name))) {
        console.log("Skipping file: '%s'", filePath);
      } else {
        cb(filePath);
      }
    } else if (file.isDirectory()) {
      if (!ignoreFoldersRegex.test(filePath)) {
        recursiveDirFilesIterator(filePath, cb);
      } else {
        console.log("Skipping directory: '%s'", filePath);
      }
    }
  });
}

function fillAllGlobalsConstants(filePath) {
  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const ast = acorn.parse(source, {
    loc: true
  });

  const globalsExposed = Object.keys(findGlobalsExposed(ast));

  const dependencies = findGlobals(ast)
    .filter((dep) => allExternalDeps.indexOf(dep.name) === -1)
    .filter((dep) => ignoreableExternalDeps.indexOf(dep.name) === -1);

  const depNames = dependencies.map(({ name }) => name);

  // set allGlobalsExposed && allGlobalDeps in first iteration
  allGlobalsExposed = allGlobalsExposed.concat(globalsExposed);
  allGlobalDeps = allGlobalDeps.concat(depNames);
}

function executeTransformer(filePath) {
  let results;

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const skipGlobals = ['transformDestructAssign', 'transformActionAs'].includes(this.name);

  if (skipGlobals) {
    results = this(filePath);
  } else {
    const ast = acorn.parse(source, {
      loc: true
    });

    const globalsExposed = Object.keys(findGlobalsExposed(ast));

    let dependencies = findGlobals(ast)
      .filter((dep) => allExternalDeps.indexOf(dep.name) === -1)
      .filter((dep) => ignoreableExternalDeps.indexOf(dep.name) === -1);

    if (fixOnlyDependencies) {
      dependencies = [...new Set(dependencies.filter((e) => allGlobalsExposed.indexOf(e.name) === -1))];

      results = this(filePath, dependencies);
    } else {
      dependencies = [...new Set(dependencies)];

      results = this(filePath, false, {
        globalsExposed,
        dependencies
      });
    }
  }

  if (results) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }
}

function collectAllGlobals(dirPath) {
  return new Promise((res, rej) => {
    try {
      recursiveDirFilesIterator(dirPath, fillAllGlobalsConstants);

      allGlobalDeps = [...new Set(allGlobalDeps)];
      allGlobalsExposed = [...new Set(allGlobalsExposed)];

      res({
        allGlobalDeps: [...new Set(allGlobalDeps)],
        allGlobalsExposed: [...new Set(allGlobalsExposed)]
      });
    } catch (err) {
      rej(err);
    }
  });
}

/**
 * { fixJSsAtPath: Transforms all the JS files at the dirPath }
 *
 * @param      {<String>}  dirPath                           The directory where you want to run the transform at
 * @param      {<Function>}  transformer                     The transformer which will modify the JS files
 * @param      {<Regex>}  [paramsIgnoreFilesRegex=/$^/]      Regular expression to match filenames
 * to ignore during transform
 * @param      {<Regex>}  [paramsIgnoreFoldersRegex=/$^/]    Regular expression to match folder names
 * to ignore during transform
 * @param      {<Array>}  [paramsIgnoreableExternalDeps=[]]  Array of dependencies to ignore during transform
 */
function fixJSsAtPath(
  dirPath,
  transformer,
  paramsIgnoreFilesRegex = /$^/,
  paramsIgnoreFoldersRegex = /$^/,
  paramsIgnoreableExternalDeps = []
) {
  try {
    if (dirPath.constructor !== String) {
      throw new Error('dirPath should be a String');
    }

    if (transformer.constructor !== Function) {
      throw new Error('transformer should be a Function');
    }

    if (paramsIgnoreFilesRegex.constructor !== RegExp) {
      throw new Error('paramsIgnoreFilesRegex should be a RegExp');
    }

    if (paramsIgnoreFoldersRegex.constructor !== RegExp) {
      throw new Error('paramsIgnoreFoldersRegex should be a RegExp');
    }

    if (paramsIgnoreableExternalDeps.constructor !== Array) {
      throw new Error('paramsIgnoreableExternalDeps should be an Array');
    }

    ignoreFilesRegex = paramsIgnoreFilesRegex;
    ignoreFoldersRegex = paramsIgnoreFoldersRegex;
    ignoreableExternalDeps = ignoreableExternalDeps.concat(paramsIgnoreableExternalDeps);

    console.log("Executing Transformer: '%s'", transformer.name);

    fixOnlyDependencies = ['transformLeakingGlobalsVars', 'transformUnusedAssignedVars'].includes(transformer.name);

    if (fixOnlyDependencies) {
      collectAllGlobals(dirPath)
        .then(() => {
          recursiveDirFilesIterator(dirPath, executeTransformer.bind(transformer));
        })
        .catch((err) => {
          // An error occurred
          console.error('Some Error Occured: ', err);
          process.exit(1);
        });
    } else {
      recursiveDirFilesIterator(dirPath, executeTransformer.bind(transformer));
    }
  } catch (err) {
    console.log(err);
  }
}

module.exports = {
  fixJSsAtPath,
  transformLeakingGlobalsVars,
  transformUnusedAssignedVars,
  transformNoCamelCaseVars,
  transformDestructAssign,
  transformActionAs,
  transformBlockScopedVar,
  transformNoLonelyIf,
  transformNoNestedTernary
};
