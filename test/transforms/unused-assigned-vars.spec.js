const fs = require('fs');

const chai = require('chai');
const sinon = require('sinon');

const { expect } = chai;
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

const transformUnusedAssignedVars = require('../../transforms/unused-assigned-vars');

describe('unused-assigned-vars transformer', () => {
  beforeEach(() => {
    this.sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    this.sandbox.restore();
  });

  it('remove unused initialized variables', () => {
    const filePath = 'sample.js'; // can be anything as we are stubbing fs.readFileSync

    this.sandbox.stub(fs, 'readFileSync').callsFake(() => {
      return 'function test() { i = 0; }';
    });

    const result = transformUnusedAssignedVars(filePath);

    expect(result).to.eql('function test() {}');
  });
});
