[![MIT License][license-image]][license-url]

## Installation

Using npm:

```shell
$ npm i -g npm
$ npm i @anshckr/fix-js
```

Note: add --save if you are using npm < 5.0.0

In Node.js:

```js

var {
  fixJSsAtPath,
  fixReactAtPath,
  transformLeakingGlobalsVars,
  transformUnusedAssignedVars,
  transformNoCamelCaseVars,
  transformDestructAssign,
  transformActionAs
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

### 2. `fixReactAtPath` (Transforms all the React JS/JSX files at the dirPath)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `dirPath`  | `String`  | **Required**. The directory path where you want to run the transform at  |
| `transformer` | `Function` | **Required**. The transformer which will modify the JS files |
| `paramsIgnoreFilesRegex` | `Regex` | **Optional**. Regular expression to match file names to ignore during transform. **Default:** /$^/ |
| `paramsIgnoreFoldersRegex` | `Regex` | **Optional**. Regular expression to match folder names to ignore during transform. **Default:** /$^/ |
| `paramsIgnoreableExternalDeps` | `Array` | **Optional**. Array of dependencies to ignore during transform. **Default:** [] |

### 3. `transformLeakingGlobalsVars` (Transformer to fix all the leaking globals from a JS file)

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

### 4. `transformUnusedAssignedVars` (Transformer to fix all the unused assigned variables from a JS file)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `filePath `  | `String`  | **Required**. The file path you want to fix  |
| `updateInplace ` | `Boolean` | **Optional**. Whether to update the file or not. **Default:** false |

**Returns**

| Type | Description |
| :--- | :--- |
| `String` | Transformed file content |

### 5. `transformNoCamelCaseVars` (Transformer to fix all the non camel cased variables from a JS file)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `filePath `  | `String`  | **Required**. The file path you want to fix  |
| `updateInplace ` | `Boolean` | **Optional**. Whether to update the file or not. **Default:** false |

**Returns**

| Type | Description |
| :--- | :--- |
| `String` | Transformed file content |

**Example**

```js
var _some_var, $some_var;
function some_func() {}
some_func();
```

The above will get converted to

```js
var someVar, $someVar;
function someFunc() {}
someFunc();
```


### 6. `transformDestructAssign` (Transformer to fix react/destructuring-assignment rule)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `filePath `  | `String`  | **Required**. The file path you want to fix  |
| `updateInplace ` | `Boolean` | **Optional**. Whether to update the file or not. **Default:** false |

**Returns**

| Type | Description |
| :--- | :--- |
| `String` | Transformed file content |

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

### 7. `transformActionAs` (Transforms all named export actions use 'as' while importing. Also converts the 'bindActionCreators' objectExpressionNode to use the as imported action)

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `filePath `  | `String`  | **Required**. The file path you want to fix  |
| `updateInplace ` | `Boolean` | **Optional**. Whether to update the file or not. **Default:** false |

**Returns**

| Type | Description |
| :--- | :--- |
| `String` | Transformed file content |

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

## Usage

Refer the [example folder](https://github.com/anshckr/fix-js/tree/master/example)

## 🤝 Contributing

Contributions, issues and feature requests are welcome!<br />Feel free to check [issues page](https://github.com/anshckr/fix-js/issues). You can also take a look at the [contributing guide](https://github.com/anshckr/fix-js/blob/master/CONTRIBUTING.md).

## Show your support

Give a ⭐️ if this project helped you!

## License

@anshckr/fix-js is freely distributable under the terms of the [MIT license](https://github.com/anshckr/fix-js/blob/master/LICENSE).
[license-image]: http://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE
