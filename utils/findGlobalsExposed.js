function findExposedGlobals(ast) {
  const out = {};

  function makeRecord(name) {
    if (!(name in out)) {
      out[name] = {
        name,
        type: null,
        ast: null,
        isFunction: null,
        count: 0
      };
    }
    return out[name];
  }

  function scanVariableDeclaration(stmt) {
    stmt.declarations.forEach((decl) => {
      const record = makeRecord(decl.id.name);
      record.type = 'var';
      record.ast = decl;
      record.isFunction = !!(decl.init && decl.init.type === 'FunctionExpression');
      record.count++;
    });
  }

  function scanBody(body, scopeType) {
    if (body.type === 'BlockStatement') {
      body = body.body;
    }

    for (let i = 0; i < body.length; ++i) {
      const stmt = body[i];
      let record;
      switch (stmt.type) {
        // var foo = ...
        case 'VariableDeclaration':
          scanVariableDeclaration(stmt);
          break;
        // function foo() { ... }
        case 'FunctionDeclaration':
          record = makeRecord(stmt.id.name);
          record.type = 'function';
          record.ast = stmt;
          record.isFunction = true;
          record.count++;
          break;
        case 'ForStatement':
          if (stmt.init.type === 'VariableDeclaration') {
            scanVariableDeclaration(stmt.init);
          }
          scanBody(stmt.body, stmt.type);
          break;
        case 'ForInStatement':
          if (stmt.left.type === 'VariableDeclaration') {
            scanVariableDeclaration(stmt.left);
          }
          scanBody(stmt.body, stmt.type);
          break;
        case 'WhileStatement':
        case 'DoWhileStatement':
        case 'ExpressionStatement':
          if (scopeType === 'Program' && stmt.expression.type === 'AssignmentExpression') {
            record = makeRecord(stmt.expression.left.name);
            record.type = 'var';
            record.ast = stmt.expression.right;
            record.isFunction = !!(stmt.expression.right && stmt.expression.right.type === 'FunctionExpression');
            record.count++;
          }
          break;
        default:
          break;
      }
    }
  }

  scanBody(ast.body, ast.type);

  return out;
}

module.exports = findExposedGlobals;
