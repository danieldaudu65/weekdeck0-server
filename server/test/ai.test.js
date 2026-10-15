'use strict';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const { parseIdeas } = require('../src/utils/aiIdeas');

test('AI reply: keeps valid ideas, drops junk', () => {
  const out = parseIdeas('Sure! {"ideas":[{"day":"mon","text":"Market storm at Ikeja"},{"day":"sun","text":"x"},{"day":"tue","text":""},{"day":"wed"}],"tip":"Follow up Friday."} thanks');
  assert.deepEqual(out.ideas, [{ day: 'mon', text: 'Market storm at Ikeja' }]);
  assert.equal(out.tip, 'Follow up Friday.');
});

test('AI reply: not JSON → null', () => {
  assert.equal(parseIdeas('no json here'), null);
  assert.equal(parseIdeas('{bad json}'), null);
});
