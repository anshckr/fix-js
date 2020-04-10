const fs = require('fs');

const chai = require('chai');
const sinon = require('sinon');

const { expect } = chai;
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

const transformLeakingGlobalsVars = require('../../transforms/with-globals/leaking-global-vars');

describe('leaking-global-vars transformer', () => {
  beforeEach(() => {
    this.sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    this.sandbox.restore();
  });

  it('initializes uninitialized variables', () => {
    const filePath = 'sample.js'; // can be anything as we are stubbing fs.readFileSync

    this.sandbox.stub(fs, 'readFileSync').callsFake(() => {
      return 'function test() { i = 0; }';
    });

    const result = transformLeakingGlobalsVars(filePath);

    expect(result).to.eql('function test() {\n  var i;\n  i = 0;\n}');
  });
});
