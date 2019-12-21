[![MIT License][license-image]][license-url]

This package was build for the need to fix all the global leaks happening in the JS files of a codebase

For Example - Consider the below code in a JS file

```js
for (i = 0; i < 10; i++) {....}
```

In the above code if we don't declare `i` in the upper scope like `var i` then `i` becomes a global leak

The utility will declare these types leaking variables

## Installation

Using npm:
```shell
$ npm i -g npm
$ npm i @anshckr/fix-js
```
Note: add --save if you are using npm < 5.0.0

In Node.js:
```js
// cherry-pick methods for smaller browserify/rollup/webpack bundles
var {
  fixJSsAtPath,
  transformLeakingGlobalsVars,
  transformUnusedAssignedVars
} = require('@anshckr/fix-js');

```

## API

```
This package exposes the following utilities ->

1) fixJSsAtPath
/**
 * { Transforms all the JS files at the dirPath }
 *
 * @param      {<String>}    dirPath                                The directory where you want to run the transform at
 * @param      {<Regex>}     paramsIgnoreFilesRegex                 Regular expression to match file names to ignore during transform
 * @param      {<Regex>}     paramsIgnoreFoldersRegex               Regular expression to match folder names to ignore during transform
 * @param      {<Function>}  transformer                            The transformer which will modify the JS files
 * @param      {<Array>}     [paramsIgnoreableExternalDeps=[]]      Array of dependencies to ignore during transform
 */

2) transformLeakingGlobalsVars
/**
 * { transformLeakingGlobalsVars: Transformer to fix all the leaking globals from a JS file }
 *
 * @param      {<String>}  filePath      Path of the file to fix
 * @param      {<Array>}   dependencies  Array of dependencies for the file at filePath
 * @return     {<String>}  { Transformed string to write to the file }
 */

3) transformUnusedAssignedVars
/**
 * { transformUnusedAssignedVars: Transformer to fix all the unused assigned variables from a JS file }
 *
 * @param      {<String>}  filePath      Path of the file to fix
 * @param      {<Array>}   dependencies  Array of Dependencies for the file at filePath
 * @return     {<String>}  { Transformed string to write to the file }
 */
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
