// eslint-disable-next-line no-unused-vars
function someFunc() {}
var someUsedVar1 = 0;

/* eslint-disable no-unused-vars */
var someUnUsedVar = 2, someUnUsedVar1 = false;/* eslint-enable no-unused-vars */

window.someVar = (function(){
  someUsedVar1 = 1;
  return someUsedVar1 || someUsedVar3;
})();

var someUsedVar3 = 0;
