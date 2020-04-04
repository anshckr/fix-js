const fs = require('fs');
const { resolve } = require('path');
const jscodeshift = require('jscodeshift');

const j = jscodeshift;

/**
 * { Fixes eslint no-lonely-if rule }
 *
 * @param      {String}   filePath                Path of the file to fix
 * @param      {Boolean}  [updateInplace=false]   Whether to update the file or not
 * @return     {String}   { Transformed string to write to the file }
 */
const transformNoLonelyIf = (filePath, updateInplace = false) => {
  if (filePath.constructor !== String) {
    throw new Error('filePath should be a String');
  }

  const source = fs.readFileSync(resolve(__dirname, filePath), { encoding: 'utf8' });

  const root = j(source);

  console.log('\nFixing FilePath - %s\n', filePath);

  const validIfNodesCollec = root.find(j.IfStatement).filter((nodePath) => {
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
  });

  validIfNodesCollec.forEach((nodePath) => {
    const closestBlockStatementCollec = j(nodePath).closest(j.BlockStatement);

    const closestBlockStatementStart = closestBlockStatementCollec.nodes()[0].start;

    const closestIfStatementCollec = j(nodePath).closest(j.IfStatement, (node) => {
      return node.alternate && node.alternate.start === closestBlockStatementStart;
    });

    closestIfStatementCollec.forEach((ifStatementNodePath) => {
      ifStatementNodePath.value.alternate = nodePath.value;
    });
  });

  const results = root.toSource();

  if (updateInplace) {
    fs.writeFileSync(resolve(__dirname, filePath), results.replace(/;;/g, ';'));
  }

  return results;
};

module.exports = transformNoLonelyIf;
