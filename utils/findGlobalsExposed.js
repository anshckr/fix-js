function findExposedGlobals(ast) {
  var out = {};

  function makeRecord(name) {
    if (!(name in out)) {
      out[name] = {
        name: name,
        type: null,
        ast: null,
        isFunction: null,
        count: 0
      };
    }
    return out[name];
  }

  function scanVariableDeclaration(stmt) {
    stmt.declarations.forEach(function(decl) {
      var record = makeRecord(decl.id.name);
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

    for (var i = 0; i < body.length; ++i) {
      var stmt = body[i];
      switch (stmt.type) {
        // var foo = ...
        case 'VariableDeclaration':
          scanVariableDeclaration(stmt);
          break;
          // function foo() { ... }
        case 'FunctionDeclaration':
          var record = makeRecord(stmt.id.name);
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
        case 'ForInStatement':
          scanBody(stmt.body, stmt.type);
          break;
        case 'ExpressionStatement':
          if (scopeType === 'Program' && stmt.expression.type === 'AssignmentExpression') {
            var record = makeRecord(stmt.expression.left.name);
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
