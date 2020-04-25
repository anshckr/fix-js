[![Build Status](https://travis-ci.org/anshckr/fix-js.svg?branch=master)](https://travis-ci.org/anshckr/fix-js) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier) [![GitHub license](https://img.shields.io/github/license/anshckr/fix-js)](https://github.com/anshckr/fix-js/blob/master/LICENSE) [![GitHub stars](https://img.shields.io/github/stars/anshckr/fix-js)](https://github.com/anshckr/fix-js/stargazers)

This repository contains a collection of codemod scripts for use with
[JSCodeshift](https://github.com/facebook/jscodeshift) + it can also be added as a package to use the other transformers it exposes

## Setup & Run When Using 'jscodeshift'

```sh
npm install -g jscodeshift
git clone https://github.com/anshckr/fix-js.git
jscodeshift -t <codemod-script> <file>
```

Use the `-d` option for a dry-run and use `-p` to print the output for
comparison.

### Recast Options

[Options to recast's printer](https://github.com/benjamn/recast/blob/master/lib/options.ts) can be provided through the `printOptions` command line argument

```sh
jscodeshift -t transform.js <file> --printOptions='{"quote":"double"}'
```

### Included Scripts

#### `no-lonely-if`

Fixes eslint no-lonely-if rule

```sh
jscodeshift -t ./transforms/no-lonely-if.js <file>
```

```js
else {
  if (someCondition) {
    ...
  } else {
    ...
  }
}
```

The above will get converted to

```js
else if (someCondition) {
  ...
} else {
  ...
}
```

#### `no-nested-ternary`

Fixes eslint no-nested-ternary rule by converting the nested ConditionalExpressions into an IIFE block with If/Else Statements

```sh
jscodeshift -t ./transforms/no-nested-ternary.js <file>
```

```js
a ? 'a' : b ? 'b' : 'c'
```

The above will get converted to

```js
(function() {
  if (a) {
    return 'a';
  }

  if (b) {
    return 'b';
  }

  return 'c';
})()
```

#### `no-unused-vars`

Fixes eslint no-unused-vars rule. Adds disable comment/block wherever the function/variable getting fixed is globally exposed

```sh
jscodeshift -t ./transforms/no-unused-vars.js <file>
```

```js
function someFunc(index) {}
var someUsedVar = 0, someUnUsedVar = false;
var someVar = (function(){
  var someInternalVar;

  function someInternalFunc() {};

  someUsedVar = 1;
  return someUsedVar;
})();
```

The above will get converted to

```js
// eslint-disable-next-line no-unused-vars
function someFunc() {}
var someUsedVar = 0;
window.someUnUsedVar = false;

window.someVar = (function(){
  someUsedVar = 1;
  return someUsedVar;
})();
```

##### Options:

`--fix-exposed-functions=true`: Fixes non camel-cased functions that are exposed from the file

`--fix-dependencies=true`: Finds all the dependencies needed by the file and fixes them if they are not camel-cased

#### `react-action-as`

Transforms all named export actions use 'as' while importing. Also converts the 'bindActionCreators' objectExpressionNode to use the as imported action

```sh
jscodeshift -t ./transforms/react-action-as.js <file>
```

```jsx
import { someAction } from '../actions';

const mapDispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      someAction
    },
    dispatch
  );
```

The above will get converted to

```jsx
import { someAction as someActionAction } from '../actions';

const mapDispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      someAction: someActionAction
    },
    dispatch
  );
```

#### `react-destruct-assign`

Transformer to fix react/destructuring-assignment rule

```sh
jscodeshift -t ./transforms/react-destruct-assign.js <file>
```

```jsx
render() {
    if (this.props.someProp) {
        return this.state.someState;
    }
}
```

The above will get converted to

```jsx
render() {
    const { someProp } = this.props;
    const { someState } = this.state;
    if (someProp) {
        return someState;
    }
}
```

#### `block-scoped-var`

Transformer that moves all the variable declarators to their scope level

```sh
jscodeshift -t ./transforms/block-scoped-var.js <file>
```

```js
function someFunc() {
  if (someCondition) {
    var i = 1;
  } else {
    var i = 2;
  }

  for (var j = 0; j < i; j++) {
    ...
  }

  for (var k in someObj) {
    ...
  }
}
```

The above will get converted to

```js
function someFunc() {
  var i, j, k;
  if (someCondition) {
    i = 1;
  } else {
    i = 2;
  }

  for (j = 0; j < i; j++) {
    ...
  }

  for (k in someObj) {
    ...
  }
}
```

#### `no-camelcase`

Transformer to fix all the non camel cased variables and function names in a JS file

```sh
jscodeshift -t ./transforms/no-camelcase.js <file>
```

##### Options:

`--fix-exposed-functions=true`: Fixes non camel-cased functions that are exposed from the file

`--fix-dependencies=true`: Finds all the dependencies needed by the file and fixes them if they are not camel-cased

```js
var _some_var, $some_var;
function some_func() {}
some_func();
```

The above will get converted to (with no options passed)

```js
var someVar, $someVar;
function some_func() {}
some_func();
```

## Setup & Run When Using As A Package

```sh
$ npm i @anshckr/fix-js
```
In Node.js:

```js

var {
  fixJSsAtPath,
  transformLeakingGlobalsVars,
  transformUnusedAssignedVars,
  transformNoUnderscoreDangle
} = require('@anshckr/fix-js');

```

## API

### 1. `fixJSsAtPath` (Transforms all the JS files at the dirPath)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `dirPath`  | `String`  | **Required**. The directory path where you want to run the transform at  |
| `transformer` | `Function` | **Required**. The transformer which will modify the JS files |
| `paramsIgnoreFilesRegex` | `Regex` | **Optional**. Regular expression to match file names to ignore during transform. **Default:** /$^/ |
| `paramsIgnoreFoldersRegex` | `Regex` | **Optional**. Regular expression to match folder names to ignore during transform. **Default:** /$^/ |
| `paramsIgnoreableExternalDeps` | `Array` | **Optional**. Array of dependencies to ignore during transform. **Default:** [] |


### 2. `transformLeakingGlobalsVars` (Transformer to fix all the leaking globals from a JS file)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `filePath `  | `String`  | **Required**. The file path you want to fix  |
| `dependencies ` | `Function` | **Optional**. Array of dependencies you want to fix for the file at filePath. **Default:** All the global dependencies for the file |
| `updateInplace ` | `Boolean` | **Optional**. Whether to update the file or not. **Default:** false |

**Returns**

| Type | Description |
| :--- | :--- |
| `String` | Transformed file content |

**Example**

```js
for (i = 0; i < 10; i++) {....}
```

In the above code if we don't declare `i` in the upper scope like `var i` then `i` becomes a global leak

The utility will declare these types leaking variables


### 3. `transformUnusedAssignedVars` (Transformer to fix all the unused assigned variables from a JS file)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `filePath `  | `String`  | **Required**. The file path you want to fix  |
| `updateInplace ` | `Boolean` | **Optional**. Whether to update the file or not. **Default:** false |

**Returns**

| Type | Description |
| :--- | :--- |
| `String` | Transformed file content |

### 4. `transformNoUnderscoreDangle` (Transformer to fix leading '__' in function names to "\_", removes "\_" from function params)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `filePath `  | `String`  | **Required**. The file path you want to fix  |
| `updateInplace ` | `Boolean` | **Optional**. Whether to update the file or not. **Default:** false |
| `collectedGlobals ` | `Object` | **Optional**. Contains two keys globalsExposed, dependencies for the file. **Default:** {} |

**Returns**

| Type | Description |
| :--- | :--- |
| `String` | Transformed file content |

**Example**

```js
function __someFunc(_someParam) {
  ..._someParam
}
__someFunc();
```

The above will get converted to

```js
function _someFunc(someParam) {
  ...someParam
}
_someFunc();
```

## Usage

Refer the [example folder](https://github.com/anshckr/fix-js/tree/master/example)

## 🤝 Contributing

Contributions, issues and feature requests are welcome!<br />Feel free to check [issues page](https://github.com/anshckr/fix-js/issues). You can also take a look at the [contributing guide](https://github.com/anshckr/fix-js/blob/master/CONTRIBUTING.md).

## Show your support

Give a ⭐️ if this project helped you!

## License

@anshckr/fix-js is freely distributable under the terms of the [MIT license](https://github.com/anshckr/fix-js/blob/master/LICENSE)
