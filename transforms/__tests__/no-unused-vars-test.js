const { defineTest } = require('jscodeshift/dist/testUtils');

defineTest(__dirname, 'no-unused-vars');

defineTest(__dirname, 'no-unused-vars', {
  'skip-disable-comments': true,
}, 'no-unused-vars-skip-disable-comments');
