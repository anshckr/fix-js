function someFunc() {}
var someUsedVar1 = 0;
var someUnUsedVar = 2, someUnUsedVar1 = false;

window.someVar = (function(){
  someUsedVar1 = 1;
  return someUsedVar1 || someUsedVar3;
})();

var someUsedVar3 = 0;
