// Example of how to use it as a package

const {
  fixJSsAtPath,
  transformLeakingGlobalsVars,
  transformUnusedAssignedVars,
  transformNoUnderscoreDangle
} = require('../index');
const dependenciesObj = require('./dependencies.json');

// const directoryPath = '/Users/Anshul/railsApp/public/javascripts/';
const directoryPath = '/Users/Anshul/railsApp/app/assets/javascripts/';
// const directoryPath = '/Users/Anshul/railsApp/react/app/';
const ignoreFilesRegex = /^socket|\.min\.js/;
const ignoreFoldersRegex = /\/libraries|google-code-prettify|polyfill|prettify|run_prettify/;

const ignoreableExternalDeps = Object.keys(dependenciesObj).reduce(
  (accumulator, key) => accumulator.concat(dependenciesObj[key]),
  []
);

/**
 * { Example usage of fixJSsAtPath }
 */
// with minimal required params
// fixJSsAtPath(directoryPath, transformLeakingGlobalsVars);
// with all params
// fixJSsAtPath(directoryPath, transformLeakingGlobalsVars, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);
// fixJSsAtPath(directoryPath, transformUnusedAssignedVars, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);
// fixJSsAtPath(directoryPath, transformNoUnderscoreDangle, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);

// /**
//  * { Example usage of transformLeakingGlobalsVars }
//  */
// const dependencies = ['jQuery'];

// // with specific dependencies to fix
// transformLeakingGlobalsVars('/Users/Anshul/railsApp/app/assets/javascripts/admin.js', dependencies);
// // will update the file instead of returning the modified contents
// transformLeakingGlobalsVars('/Users/Anshul/railsApp/app/assets/javascripts/admin.js', dependencies, true);
// // without dependencies, will detect all the globals in the file and fix them
// transformLeakingGlobalsVars('/Users/Anshul/railsApp/app/assets/javascripts/admin.js');

// /**
//  * { Example usage of transformUnusedAssignedVars }
//  */

// with specific dependencies to fix
// // will update the file instead of returning the modified contents
// transformUnusedAssignedVars('/Users/Anshul/railsApp/app/assets/javascripts/admin.js', true);
// // will return the the modified contents file instead of directly fixing
// transformUnusedAssignedVars('/Users/Anshul/railsApp/app/assets/javascripts/admin.js');

// /**
//  * { Example usage of transformNoUnderscoreDangle }
//  */

// // will update the file instead of returning the modified contents
// transformNoUnderscoreDangle('/Users/Anshul/railsApp/app/assets/javascripts/static/report_bug/slack.js', true);
// // will return the the modified contents file instead of directly fixing
// transformNoUnderscoreDangle('/Users/Anshul/railsApp/app/assets/javascripts/admin.js');
