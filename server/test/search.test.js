'use strict';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const { readTavily, eventQueries, weekWords } = require('../src/utils/webSearch');

test('week words and queries', () => {
  assert.equal(weekWords('2026-10-19'), '19 – 25 October 2026');
  assert.equal(weekWords('2026-10-26'), '26 October – 1 November 2026');
  const q = eventQueries('Ikeja', '', '2026-10-19');
  assert.equal(q[0], 'events in Ikeja Lagos October 2026');
  assert.match(q[1], /Lagos Nigeria 19 – 25 October 2026$/);
  assert.match(eventQueries('Ikeja', 'church crusade', '2026-10-19')[0], /^church crusade in Ikeja/);
});

test('Tavily results are cleaned', () => {
  const r = readTavily({
    results: [
      { title: ' Lagos  Trade Fair ', url: 'https://a.ng/x', content: 'At TBS', score: 0.9, published_date: '2026-10-01T00:00:00Z' },
      { title: 'bad', url: 'javascript:alert(1)' },
      { url: 'https://no-title.ng' },
    ],
  });
  assert.deepEqual(r, [{ title: 'Lagos Trade Fair', url: 'https://a.ng/x', content: 'At TBS', date: '2026-10-01', score: 0.9 }]);
});
