function someFunc(index) {}
var someUsedVar1 = 0, someUnUsedVar = 2, someUnUsedVar1 = false;
var someVar = (function(){
  var someInternalVar;

  function someInternalFunc() {};

  someUsedVar1 = 1;
  return someUsedVar1 || someUsedVar3;
})();

var someUsedVar3 = 0;
