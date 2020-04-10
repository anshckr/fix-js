module.exports = (file, api, options) => {
  const j = api.jscodeshift;

  const printOptions = options.printOptions || { quote: 'single' };
  const root = j(file.source);

  // console.log('\nFixing FilePath - %s\n', file.path);

  const didTransform = root
    .find(j.IfStatement)
    .filter((nodePath) => {
      const closestBlockStatementCollec = j(nodePath).closest(j.BlockStatement);

      if (closestBlockStatementCollec.length) {
        const blockStatementBody = closestBlockStatementCollec.nodes()[0].body;

        return (
          closestBlockStatementCollec.length &&
          blockStatementBody.length === 1 &&
          blockStatementBody[0].type === 'IfStatement'
        );
      }

      return false;
    })
    .forEach((nodePath) => {
      const closestBlockStatementCollec = j(nodePath).closest(j.BlockStatement);

      const closestBlockStatementStart = closestBlockStatementCollec.nodes()[0].start;

      const closestIfStatementCollec = j(nodePath).closest(j.IfStatement, (node) => {
        return node.alternate && node.alternate.start === closestBlockStatementStart;
      });

      closestIfStatementCollec.forEach((ifStatementNodePath) => {
        ifStatementNodePath.value.alternate = nodePath.value;
      });
    })
    .size();

  return didTransform ? root.toSource(printOptions) : null;
};
