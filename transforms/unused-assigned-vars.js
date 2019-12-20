var fs = require('fs');
var jscodeshift = require('jscodeshift');
var _ = require('underscore');

var j = jscodeshift;

/**
 * { Transformer to fix all the unused assigned variables from a JS file }
 *
 * @param      {<String>}  filePath      Path of the file to fix
 * @param      {<Array>}   dependencies  Array of Dependencies for the file at filePath 
 * @return     {<String>}  { Transformed string to write to the file }
 */
module.exports = (filePath, dependencies) => {
  var source = fs.readFileSync(filePath, { encoding: 'utf8' });

  var root = j(source);

  console.log('\nFixing FilePath - %s\n', filePath);

  dependencies.forEach(({ name, nodes }) => {
    console.log('Fixing Dependency - %s\n', name);

    var nodesStart = _.pluck(nodes, 'start');

    var nodePathsCollection = root.find(j.Identifier, path => name === path.name && nodesStart.includes(path.start));

    if (!nodePathsCollection.length) {
      console.log('\nFixing FilePath - %s\nNo matching nodes found for dependency - %s\n', filePath, name);
      return
    }

    // fix only dependencies with AssignmentExpression, ex: a = 1;
    var identifiersWithinAssignExpCollection = nodePathsCollection
      .filter(path => path.parentPath.value.type === "AssignmentExpression");

    if (identifiersWithinAssignExpCollection.length === nodePathsCollection.length) {
      var standaloneExpressionStatement = identifiersWithinAssignExpCollection.closest(j.ExpressionStatement);

      // only one references to the variable and that too not at Program level then directly remove its expression
      if (standaloneExpressionStatement.length && standaloneExpressionStatement.closestScope().paths()[0].value.type !== 'Program') {
        standaloneExpressionStatement.paths()[0].replace();
      }
    }
  });

  return root.toSource();
}