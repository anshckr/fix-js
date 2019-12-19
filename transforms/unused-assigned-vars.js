const jscodeshift = require('jscodeshift');
const _ = require('underscore');

const j = jscodeshift;

module.exports = (source, dependencies, fileName) => {
  const root = j(source);

  console.log('\nFixing FileName - %s\n', fileName);

  dependencies.forEach(({ name, nodes }) => {
    console.log('Fixing Dependency - %s\n', name);

    const nodesStart = _.pluck(nodes, 'start');

    let nodePathsCollection = root.find(j.Identifier, path => name === path.name && nodesStart.includes(path.start));

    if (!nodePathsCollection.length) {
      console.log('\nFixing FileName - %s\nNo matching nodes found for dependency - %s\n', fileName, name);
      return;
    }

    // fix only dependencies with AssignmentExpression, ex: a = 1;
    const identifiersWithinAssignExpCollection = nodePathsCollection
      .filter(path => path.parentPath.value.type === "AssignmentExpression");

    if (identifiersWithinAssignExpCollection.length === nodePathsCollection.length) {
      const standaloneExpressionStatement = identifiersWithinAssignExpCollection.closest(j.ExpressionStatement);

      // only one references to the variable and that too not at Program level then directly remove its expression
      if (standaloneExpressionStatement.length && standaloneExpressionStatement.closestScope().paths()[0].value.type !== 'Program') {
        standaloneExpressionStatement.paths()[0].replace();
      }
    }
  });

  return root.toSource();
}