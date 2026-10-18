'use strict';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const { mondaysOfMonth, addDays } = require('../src/utils/dates');
const { newJoinCode, cleanJoinCode, JOIN_ALPHABET } = require('../src/utils/pinLogin');
const { readPhoton, validTile, near, LAGOS } = require('../src/utils/places');
const { readInteraction, readGenerate, jsonFrom } = require('../src/utils/llm');
const { parseEvents, weekDates } = require('../src/utils/aiIdeas');
const { cleanPlaces } = require('../src/utils/validate');

test('dates: Mondays of the month match the slides', () => {
  assert.deepEqual(mondaysOfMonth('2026-10-12'), ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
  assert.deepEqual(mondaysOfMonth('2026-06-01'), ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29']);
  assert.equal(addDays('2026-12-28', 7), '2027-01-04');
  assert.deepEqual(weekDates('2026-10-12').slice(0, 2), ['mon=2026-10-12', 'tue=2026-10-13']);
});

test('region join codes are 6 clear characters', () => {
  for (let i = 0; i < 50; i++) {
    const c = newJoinCode();
    assert.equal(c.length, 6);
    assert.ok([...c].every((ch) => JOIN_ALPHABET.includes(ch)));
  }
  assert.equal(cleanJoinCode(' ab-12 cd '), 'AB12CD');
});

test('place search results are tidy', () => {
  const places = readPhoton({
    features: [
      { geometry: { coordinates: [3.3515, 6.6142] }, properties: { name: 'Ikeja City Mall', district: 'Alausa', city: 'Ikeja', state: 'Lagos', osm_value: 'mall' } },
      { geometry: { coordinates: [3.3515, 6.6142] }, properties: { name: 'Ikeja City Mall', district: 'Alausa', city: 'Ikeja', state: 'Lagos' } },
      { geometry: { coordinates: ['x', 6] }, properties: { name: 'Bad' } },
      { geometry: { coordinates: [3.3, 6.5] }, properties: {} },
    ],
  });
  assert.equal(places.length, 1);
  assert.deepEqual(places[0], { name: 'Ikeja City Mall', area: 'Alausa, Ikeja', kind: 'mall', lat: 6.6142, lon: 3.3515 });
  assert.ok(validTile(12, 2085, 1983));
  assert.ok(!validTile(2, 4, 0));
  assert.ok(!validTile(30, 1, 1));
  assert.ok(!validTile(3.5, 1, 1));
  assert.deepEqual(near(NaN, 3), LAGOS);
});

test('week places are validated', () => {
  const out = cleanPlaces([
    { day: 'mon', name: 'Ikeja City Mall', lat: 6.6142, lon: 3.3515 },
    { day: 'mon', name: 'ikeja city mall', lat: 6.6, lon: 3.3 }, // duplicate
    { day: 'sun', name: 'X', lat: 1, lon: 1 },
    { day: 'tue', name: 'Far', lat: 200, lon: 1 },
    { day: 'wed', name: '', lat: 1, lon: 1 },
  ]);
  assert.deepEqual(out, [{ day: 'mon', name: 'Ikeja City Mall', lat: 6.6142, lon: 3.3515 }]);
  assert.deepEqual(cleanPlaces(undefined), []);
  assert.throws(() => cleanPlaces('nope'));
});

test('Gemini answers are read from both API styles', () => {
  const a = readInteraction({
    steps: [
      { type: 'google_search_call', arguments: { queries: ['events ikeja'] } },
      { type: 'google_search_result', result: [{ search_suggestions: '<div>chips</div>' }] },
      { type: 'model_output', content: [{ type: 'text', text: '{"events":[]}', annotations: [{ type: 'url_citation', url: 'https://a.ng/x', title: 'A' }, { type: 'url_citation', url: 'javascript:1' }] }] },
    ],
  });
  assert.equal(a.text, '{"events":[]}');
  assert.deepEqual(a.sources, [{ url: 'https://a.ng/x', title: 'A' }]);
  assert.equal(a.suggestionsHtml, '<div>chips</div>');
  const b = readGenerate({ candidates: [{ content: { parts: [{ text: 'hi' }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://b.ng', title: 'B' } }], searchEntryPoint: { renderedContent: '<b>s</b>' } } }] });
  assert.deepEqual(b, { text: 'hi', sources: [{ url: 'https://b.ng', title: 'B' }], suggestionsHtml: '<b>s</b>' });
  assert.deepEqual(jsonFrom('```json\n{"a":1}\n```'), { a: 1 });
});

test('events: invented links are not "verified"', () => {
  const ev = parseEvents(
    '{"events":[{"title":"Lagos Trade Fair","place":"TBS","area":"Lagos Island","dates":"Thu–Sun","days":["Thu","fri","xyz"],"why":"Crowds","url":"https://a.ng/x"},{"title":"Made up","url":"https://nowhere.ng"},{"title":"","url":"https://a.ng"},{"title":"Bad link","url":"javascript:alert(1)"}]}',
    [{ url: 'https://a.ng/x', title: 'A' }],
  );
  assert.equal(ev.length, 3);
  assert.deepEqual(ev[0].days, ['thu', 'fri']);
  assert.equal(ev[0].verified, true);
  assert.equal(ev[1].verified, false);
  assert.equal(ev[2].url, '');
  assert.equal(parseEvents('no json', []), null);
});
