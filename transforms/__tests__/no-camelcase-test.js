const { defineTest } = require('jscodeshift/dist/testUtils');

defineTest(__dirname, 'no-camelcase');

defineTest(__dirname, 'no-camelcase', {
	'fix-dependencies': true,
}, 'no-camelcase-fix-dependencies');

defineTest(__dirname, 'no-camelcase', {
  'fix-exposed-functions': true,
}, 'no-camelcase-fix-exposed-functions');

