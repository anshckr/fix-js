// Example of how to use this package

var { fixJSsAtPath, transformLeakingGlobalsVars } = require('../index');
var dependenciesObj = require("./dependencies.json");

var directoryPath = "/Users/Anshul/railsApp/public/javascripts";
var ignoreFilesRegex = /$^/;
var ignoreFoldersRegex = /$^/;
var ignoreableExternalDeps = Object.keys(dependenciesObj).reduce((accumulator, key) => accumulator.concat(dependenciesObj[key]), []);

/**
 * { Example usage of fixJSsAtPath }
 */
// with minimal required params
fixJSsAtPath(directoryPath, transformLeakingGlobalsVars);
// with all params
fixJSsAtPath(directoryPath, transformLeakingGlobalsVars, ignoreFilesRegex, ignoreFoldersRegex, ignoreableExternalDeps);

// /**
//  * { Example usage of transformLeakingGlobalsVars }
//  */
var dependencies = ['jQuery'];

// with specific dependencies to fix
transformLeakingGlobalsVars("/Users/Anshul/railsApp/public/javascripts/admin.js", dependencies);
// will update the file instead of returning the modified contents
transformLeakingGlobalsVars("/Users/Anshul/railsApp/public/javascripts/admin.js", dependencies, true);
// without dependencies, will detect all the globals in the file and fix them
transformLeakingGlobalsVars("/Users/Anshul/railsApp/public/javascripts/admin.js");

// /**
//  * { Example usage of transformUnusedAssignedVars }
//  */

// with specific dependencies to fix
transformUnusedAssignedVars("/Users/Anshul/railsApp/public/javascripts/admin.js", dependencies);
// will update the file instead of returning the modified contents
transformUnusedAssignedVars("/Users/Anshul/railsApp/public/javascripts/admin.js", dependencies, true);
// without dependencies, will detect all the globals in the file and fix them
transformUnusedAssignedVars("/Users/Anshul/railsApp/public/javascripts/admin.js");
