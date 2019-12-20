[![MIT License][license-image]][license-url]

This package was build for the need to fix all the global leaks happening in the JS files of a codebase

For Example - Consider the below code in a JS file

```js
for (i = 0; i < 10; i++) {....}
```

In the above code if we don't declare `i` in the upper scope like `var i` then `i` becomes a global leak

## Installation

Using npm:
```shell
$ npm i -g npm
$ npm i fix-js
```
Note: add --save if you are using npm < 5.0.0

In Node.js:
```js
// cherry-pick methods for smaller browserify/rollup/webpack bundles
var { fixJSsAtPath, transformLeakingGlobalsVars, transformUnusedAssignedVars } = require('fix-js');
```

## API [TBD]

## Usage [refer the sample.js]

## License

fix-js is freely distributable under the terms of the [MIT license](https://github.com/moment/moment/blob/develop/LICENSE).

[license-image]: http://img.shields.io/badge/license-MIT-blue.svg?style=flat
[license-url]: LICENSE
