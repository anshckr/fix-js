function someFunc(index) {}
var someUsedVar = 0, someUnUsedVar = false;
var someVar = (function(){
  var someInternalVar;

  function someInternalFunc() {};

  someUsedVar = 1;
  return someUsedVar;
})();
