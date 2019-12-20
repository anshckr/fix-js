// Example of how to use this package

var { fixJSsAtPath, transformLeakingGlobalsVars } = require('../index');
var dependenciesObj = require("./dependencies.json");

var directoryPath = "/Users/Anshul/railsApp/public/javascripts";
var ignoreFilesRegex = /^socket|polyfill|app-parser|prettify|run_prettify|jquery|\.min\.js/;
var ignoreFoldersRegex = /test|\/libraries|\/lib|static\/plugins/;
var ignoreableExternalDeps = Object.keys(dependenciesObj).reduce((accumulator, key) => accumulator.concat(dependenciesObj[key]), []);

fixJSsAtPath(directoryPath, ignoreFilesRegex, ignoreFoldersRegex, transformLeakingGlobalsVars, ignoreableExternalDeps);
