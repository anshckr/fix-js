const { defineTest } = require('jscodeshift/dist/testUtils');

defineTest(__dirname, 'no-unused-vars');
