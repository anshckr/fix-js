'use strict';

var fs = require('fs');
var path = require('path');
var acorn = require('acorn');
var findGlobals = require('acorn-globals');

// In newer Node.js versions where process is already global this isn't necessary.
var process = require("process");

// utils
var findGlobalsExposed = require('./utils/findGlobalsExposed');

// global objects
var constants = require("./static/constants.json");

// transformers
var transformLeakingGlobalsVars = require('./transforms/leaking-global-vars');
var transformUnusedAssignedVars = require('./transforms/unused-assigned-vars');

/* will be ignored in dependencies -- start */

var allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

var ignoreableExternalDeps = [];

var ignoreFilesRegex, ignoreFoldersRegex;

/* will be ignored in dependencies -- end */

var allGlobalDeps = [];

var allGlobalsExposed = [];

function recursiveDirFilesIterator(dirPath, cb) {
  var files = fs.readdirSync(dirPath, { withFileTypes: true });

  files.forEach(function(file, index) {
    var filePath = path.resolve(dirPath, file.name);

    if (file.isFile()) {
      if (ignoreFilesRegex.test(file.name) || path.extname(file.name) !== '.js') {
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

// Loop through all the files in the temp directory
function fillAllGlobalsConstants(filePath) {
  // console.log("Reading: '%s'", filePath);
  var source = fs.readFileSync(filePath, { encoding: 'utf8' });

  var ast = acorn.parse(source, {
    loc: true
  });

  var globalsExposed = Object.keys(findGlobalsExposed(ast));

  var dependencies = findGlobals(ast)
    .filter(dep => allExternalDeps.indexOf(dep.name) === -1)
    .filter(dep => ignoreableExternalDeps.indexOf(dep.name) === -1);

  var depNames = dependencies.map(({ name }) => name);

  // set allGlobalsExposed && allGlobalDeps in first iteration
  allGlobalsExposed = allGlobalsExposed.concat(globalsExposed);
  allGlobalDeps = allGlobalDeps.concat(depNames);
}

// Loop through all the files in the temp directory
function executeTransformerWithDeps(filePath) {
  // console.log("Reading: '%s'", filePath);
  var source = fs.readFileSync(filePath, { encoding: 'utf8' });

  var ast = acorn.parse(source, {
    loc: true
  });

  var dependencies = findGlobals(ast)
    .filter(dep => allExternalDeps.indexOf(dep.name) === -1)
    .filter(dep => ignoreableExternalDeps.indexOf(dep.name) === -1);

  dependencies = [...new Set(dependencies.filter(e => allGlobalsExposed.indexOf(e.name) === -1))];

  var results = this(filePath, dependencies);

  if (results) {
    fs.writeFileSync(filePath, results.replace(/;;/g, ';'));
  }
}

function findGlobalsAtPath(dirPath) {
  try {
    recursiveDirFilesIterator(dirPath, fillAllGlobalsConstants);

    return new Promise(function(resolve, reject) {
      allGlobalDeps = [...new Set(allGlobalDeps)];
      allGlobalsExposed = [...new Set(allGlobalsExposed)];

      resolve({
        allGlobalDeps: [...new Set(allGlobalDeps)],
        allGlobalsExposed: [...new Set(allGlobalsExposed)]
      });
    });
  } catch (err) {
    // An error occurred
    console.error("Some Error Occured: ", err);
    process.exit(1);
  }
}

function executeTransformer(filePath) {
  var results = this(filePath);

  if (results) {
    fs.writeFileSync(filePath, results.replace(/;;/g, ';'));
  }
}

/**
 * { fixJSsAtPath: Transforms all the JS files at the dirPath }
 *
 * @param      {<String>}  dirPath                            The directory where you want to run the transform at
 * @param      {<Function>}  transformer                        The transformer which will modify the JS files
 * @param      {<Regex>}  [paramsIgnoreFilesRegex=/$^/]      Regular expression to match file names to ignore during transform
 * @param      {<Regex>}  [paramsIgnoreFoldersRegex=/$^/]    Regular expression to match folder names to ignore during transform
 * @param      {<Array>}  [paramsIgnoreableExternalDeps=[]]  Array of dependencies to ignore during transform
 */
function fixJSsAtPath(dirPath, transformer, paramsIgnoreFilesRegex = /$^/, paramsIgnoreFoldersRegex = /$^/, paramsIgnoreableExternalDeps = []) {
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
    ignoreableExternalDeps = ignoreableExternalDeps.concat(paramsIgnoreableExternalDeps)

    findGlobalsAtPath(dirPath).then(function(allGlobalsObj) {
      recursiveDirFilesIterator(dirPath, executeTransformerWithDeps.bind(transformer));
    });
  } catch(err) {
    console.log(err);
  }
}

module.exports = {
 fixJSsAtPath: fixJSsAtPath,
 transformLeakingGlobalsVars: transformLeakingGlobalsVars,
 transformUnusedAssignedVars: transformUnusedAssignedVars 
};
