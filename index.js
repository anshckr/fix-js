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

/* will be ignored in dependencies -- start */

var allExternalDeps = Object.keys(constants).reduce((accumulator, key) => accumulator.concat(constants[key]), []);

var ignoreableExternalDeps = [];

var ignoreFilesRegex = [];

var ignoreFoldersRegex = [];

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

  const ast = acorn.parse(source, {
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
  var results = transformLeakingGlobalsVars(source, [...new Set(dependencies.filter(e => allGlobalsExposed.indexOf(e.name) === -1))], filePath);

  if (results) {
    fs.writeFileSync(filePath, results.replace(/;;/g, ';'));
  }
}

function fixGlobalsAtPath(dirPath, paramsIgnoreFilesRegex, paramsIgnoreFoldersRegex, paramsIgnoreableExternalDeps) {
  ignoreFilesRegex = ignoreFilesRegex.concat(paramsIgnoreFilesRegex);
  ignoreFoldersRegex = ignoreFoldersRegex.concat(paramsIgnoreFoldersRegex);
  ignoreableExternalDeps = paramsIgnoreableExternalDeps.concat(paramsIgnoreableExternalDeps);

  findGlobalsAtPath(dirPath).then(function(allGlobalsObj) {
    recursiveDirFilesIterator(dirPath, executeTransformer);
  });
}

// Example of how to use this package
// transformers
// var directoryPath = "/Users/Anshul/railsApp/public/javascripts";
// var ignoreFilesRegex = /^socket|polyfill|app-parser|prettify|run_prettify|jquery|\.min\.js/;
// var ignoreFoldersRegex = /test|\/libraries|static\/plugins/;
// var ignoreableExternalDeps = Object.keys(dependenciesObj).reduce((accumulator, key) => accumulator.concat(dependenciesObj[key]), []);
// 
// fixGlobalsAtPath(directoryPath, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);

module.exports = fixGlobalsAtPath;
