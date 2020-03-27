// Example of how to use this package

const {
  fixJSsAtPath,
  transformLeakingGlobalsVars,
  transformUnusedAssignedVars,
  transformNoCamelCaseVars,
  transformDestructAssign,
  transformActionAs
} = require('../index');
const dependenciesObj = require('./dependencies.json');

const directoryPath = '/Users/Anshul/railsApp/app/assets/javascripts/';
// const directoryPath = '/Users/Anshul/railsApp/react/app/';
const ignoreFilesRegex = /^socket|polyfill|prettify|run_prettify|\.min\.js/;
const ignoreFoldersRegex = /\/libraries|google-code-prettify/;

const ignoreableExternalDeps = Object.keys(dependenciesObj).reduce(
  (accumulator, key) => accumulator.concat(dependenciesObj[key]),
  []
);

/**
 * { Example usage of fixJSsAtPath }
 */
// with minimal required params
// fixJSsAtPath(directoryPath, transformDestructAssign);
// with all params
// fixJSsAtPath(directoryPath, transformLeakingGlobalsVars, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);
// fixJSsAtPath(directoryPath, transformUnusedAssignedVars, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);
// fixJSsAtPath(directoryPath, transformNoCamelCaseVars, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);
// fixJSsAtPath(directoryPath, transformDestructAssign, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);
// fixJSsAtPath(directoryPath, transformActionAs, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);

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
//  * { Example usage of transformNoCamelCaseVars }
//  */

// // will update the file instead of returning the modified contents
// transformNoCamelCaseVars('/Users/Anshul/railsApp/app/assets/javascripts/admin.js', true);
// // will return the the modified contents file instead of directly fixing
// transformNoCamelCaseVars('/Users/Anshul/railsApp/app/assets/javascripts/admin.js');

// /**
//  * { Example usage of transformDestructAssign }
//  */

// // will update the file instead of returning the modified contents
// transformDestructAssign('/Users/Anshul/railsApp/react/app/screenshots/src/scripts/Status/containers/index.js', true);
// // will return the the modified contents file instead of directly fixing
// transformDestructAssign('/Users/Anshul/railsApp/react/app/app_live/src/DevTools/Inspector/components/Properties.js');

// /**
//  * { Example usage of transformActionAs }
//  */

// // will update the file instead of returning the modified contents
// transformActionAs('/Users/Anshul/railsApp/react/app/app_live/src/DevTools/Inspector/components/ScreenshotRect.js', true);
// // will return the the modified contents file instead of directly fixing
// transformActionAs('/Users/Anshul/railsApp/react/app/app_live/src/DevTools/Inspector/components/Properties.js');
