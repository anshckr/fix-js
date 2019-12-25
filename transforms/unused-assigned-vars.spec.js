const fs = require('fs');

const sinon = require('sinon');
const chai = require('chai');

const { expect } = chai;
const sinonChai = require('sinon-chai');

chai.use(sinonChai);

const transformUnusedAssignedVars = require('./unused-assigned-vars');

describe('unused-assigned-vars transformer', () => {
  it('remove unused initialized variables', () => {
    const filePath = 'sample.js'; // can be anything as we are stubbing fs.readFileSync
    sinon.stub(fs, 'readFileSync').callsFake(() => {
      return 'function test() { i = 0; }';
    });

    const result = transformUnusedAssignedVars(filePath, false);

    expect(result).to.eql('function test() {}');
  });
});
