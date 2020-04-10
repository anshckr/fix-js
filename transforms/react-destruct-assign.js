const _ = require('lodash');

module.exports = (file, api, options) => {
  const j = api.jscodeshift;

  const printOptions = options.printOptions || { quote: 'single' };
  const root = j(file.source);

  // console.log('\nFixing FilePath - %s\n', file.path);

  const transformedClassDeclaration = root.find(j.ClassDeclaration).forEach((classDeclarationNodePath) => {
    // exports a class component
    ['props', 'state'].forEach((type) => {
      const nodePathsCollection = j(classDeclarationNodePath)
        .find(j.MemberExpression, (node) => {
          return node.object.type === 'ThisExpression' && node.property.name === type;
        })
        .filter((nodePath) => {
          return nodePath.parentPath.value.type === 'MemberExpression';
        });

      // group nodes with common scope together
      const groupedByScopeNodePathsObj = _.chain(nodePathsCollection.paths())
        .groupBy((path) => j(path).closestScope().get(0).scope.path.value.start)
        .value();

      const scopesStart = Object.keys(groupedByScopeNodePathsObj);

      scopesStart.forEach((start) => {
        const nodePaths = groupedByScopeNodePathsObj[start];

        const groupedCollection = j(nodePaths);

        let closestScopeCollec = groupedCollection.closestScope(j.Node, { start: parseInt(start, 10) });

        const classProp = ['MethodDefinition', 'ClassProperty'].find((typeProp) => {
          return closestScopeCollec.closest(j[typeProp]).length;
        });

        closestScopeCollec = j(closestScopeCollec.closest(j[classProp]).get('value'));

        const blockStatementCollec = closestScopeCollec.find(j.BlockStatement);

        const blockStatementNode = blockStatementCollec
          .paths()
          .find((path) => path.parent === closestScopeCollec.paths()[0]).node;

        let dependencies = [];

        groupedCollection.forEach((nodePath) => {
          dependencies.push(nodePath.parentPath.value.property.name);

          j(nodePath).closest(j.MemberExpression).paths()[0].replace(nodePath.parentPath.value.property);
        });

        dependencies = _.uniq(dependencies);

        const constDeclarationCollec = closestScopeCollec.find(j.VariableDeclaration, (node) => {
          return node.kind === 'const';
        });

        const thisDotTypeDeclaratorCollec = constDeclarationCollec.find(j.VariableDeclarator, (node) => {
          return (
            node.init.type === 'MemberExpression' &&
            node.init.object.type === 'ThisExpression' &&
            node.init.property.type === 'Identifier' &&
            node.init.property.name === type
          );
        });

        if (thisDotTypeDeclaratorCollec.length) {
          const thisDotTypeDeclarationCollec = thisDotTypeDeclaratorCollec.closest(j.VariableDeclaration);
          // there is already const declaration inside BlockStatement
          const objectExpressionProperties = thisDotTypeDeclaratorCollec.get('id').value.properties;

          const alreadyDeclaredProps = objectExpressionProperties.map((property) => {
            return property.value.name;
          });

          dependencies = dependencies.filter((dep) => {
            return !alreadyDeclaredProps.includes(dep);
          });

          if (!dependencies.length) {
            return;
          }

          const newProperties = dependencies.map((dep) => {
            return j.property('init', j.identifier(dep), j.identifier(dep));
          });

          thisDotTypeDeclaratorCollec.get('id').value.properties = objectExpressionProperties.concat(newProperties);

          // move this const decl to the top of the scope
          const thisDotTypeDeclarationNode = thisDotTypeDeclarationCollec.nodes()[0];

          if (!thisDotTypeDeclarationNode.start) {
            // still hasn't got start
            return;
          }

          blockStatementNode.body = _.filter(blockStatementNode.body, (node) => {
            return node.start !== thisDotTypeDeclarationNode.start;
          });

          blockStatementNode.body.unshift(thisDotTypeDeclarationNode);
        } else {
          if (!dependencies.length) {
            return;
          }

          const newProperties = dependencies.map((dep) => {
            return j.property('init', j.identifier(dep), j.identifier(dep));
          });
          // declare at each scope level
          blockStatementNode.body.unshift(
            j.variableDeclaration('const', [
              j.variableDeclarator(
                j.objectPattern(newProperties),
                j.memberExpression(j.thisExpression(), j.identifier(type))
              )
            ])
          );
        }
      });
    });
  });

  // exports a functional component
  const type = 'props';

  const transformedArrowFunctionExpression = root
    .find(j.ArrowFunctionExpression, (node) => {
      return node.params.find((param) => {
        return param.name === type;
      });
    })
    .forEach((arrowFunctionNodePath) => {
      const nodePathsCollection = j(arrowFunctionNodePath).find(j.MemberExpression, (node) => {
        return node.object.name === type;
      });

      let dependencies = [];

      const propAliasMap = {};

      nodePathsCollection.forEach((nodePath) => {
        const propName = nodePath.value.property.name;
        dependencies.push(propName);

        const parentNode = nodePath.parentPath.value;

        if (parentNode.type === 'VariableDeclarator') {
          propAliasMap[propName] = parentNode.id.name;

          j(nodePath).closest(j.VariableDeclaration).paths()[0].replace();
        }

        j(nodePath).paths()[0].replace(nodePath.value.property);
      });

      dependencies = _.uniq(dependencies);

      if (dependencies.length) {
        const properties = dependencies.map((dep) => {
          if (propAliasMap[dep]) {
            return j.property('init', j.identifier(dep), j.identifier(propAliasMap[dep]));
          }

          return j.property('init', j.identifier(dep), j.identifier(dep));
        });

        arrowFunctionNodePath.value.params = arrowFunctionNodePath.value.params.map((node) => {
          if (node.name === type) {
            return j.objectPattern(properties);
          }

          return node;
        });
      }
    });

  return transformedClassDeclaration || transformedArrowFunctionExpression ? root.toSource(printOptions) : null;
};
