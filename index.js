'use strict';

var fs = require('fs');
var path = require('path');
var acorn = require('acorn');
var walk = require("acorn-walk");
var _ = require('underscore');
// In newer Node.js versions where process is already global this isn't necessary.
var process = require("process");

// utils
var findGlobalsExposed = require('./utils/findGlobalsExposed');
var findGlobalDeps = require('./utils/findGlobalDeps');

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

  var dependencies = findGlobalDeps(ast)
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

  var dependencies = findGlobalDeps(ast)
    .filter(dep => allExternalDeps.indexOf(dep.name) === -1)
    .filter(dep => ignoreableExternalDeps.indexOf(dep.name) === -1);

  dependencies = [...new Set(dependencies.filter(e => allGlobalsExposed.indexOf(e.name) === -1))];

  return this(filePath, dependencies);
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
 * @param      {<string>}    dirPath                                The directory where you want to run the transform at
 * @param      {<Regex>}     paramsIgnoreFilesRegex                 Regular expression to match file names to ignore during transform
 * @param      {<Regex>}     paramsIgnoreFoldersRegex               Regular expression to match folder names to ignore during transform
 * @param      {<Function>}  transformer                            The transformer which will modify the JS files
 * @param      {<Array>}     [paramsIgnoreableExternalDeps=[]]      Array of depencies to ignore during transform
 */
function fixJSsAtPath(dirPath, paramsIgnoreFilesRegex, paramsIgnoreFoldersRegex, transformer, paramsIgnoreableExternalDeps = []) {
  ignoreFilesRegex = paramsIgnoreFilesRegex;
  ignoreFoldersRegex = paramsIgnoreFoldersRegex;
  ignoreableExternalDeps = ignoreableExternalDeps.concat(paramsIgnoreableExternalDeps)

  findGlobalsAtPath(dirPath).then(function(allGlobalsObj) {
    recursiveDirFilesIterator(dirPath, executeTransformerWithDeps.bind(transformer));
  });
}

module.exports = {
 fixJSsAtPath: fixJSsAtPath,
 transformLeakingGlobalsVars: transformLeakingGlobalsVars,
 transformUnusedAssignedVars: transformUnusedAssignedVars 
};
