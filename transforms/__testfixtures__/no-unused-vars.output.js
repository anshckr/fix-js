// eslint-disable-next-line no-unused-vars
function someFunc() {}
var someUsedVar = 0;
window.someUnUsedVar = false;

window.someVar = (function(){
  someUsedVar = 1;
  return someUsedVar;
})();
