'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { cleanRestyle } = require('../src/utils/restyle');

const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(400);

test('a restyled deck is tidied: kinds, text, pictures, ids', () => {
  const d = cleanRestyle({
    title: '  Green  Valley ',
    lookId: 'ribbon_estate',
    transition: 'flip',
    slides: [
      { id: 'a', slide: { kind: 'cover', title: 'Hello', week: 'Q3', image: jpeg, junk: 1 } },
      { id: 'a', hidden: 1, slide: { kind: 'bullets', title: 'Points', points: [{ text: ' one ', level: 0 }, { text: 'two', level: 3 }, { text: '' }] } },
      { slide: { kind: 'table', title: 'T', table: { head: ['A', 'B'], rows: [['1', '2']], total: [] } } },
      { slide: { kind: 'weird', title: 'x' } },
      { slide: { kind: 'picture', image: jpeg, ratio: 99 }, original: jpeg, originalRatio: 1.5 },
    ],
  });
  assert.equal(d.title, 'Green Valley');
  assert.equal(d.lookId, 'ribbon_estate');
  assert.equal(d.transition, 'flip');
  assert.equal(d.slides[0].slide.junk, undefined);
  assert.equal(d.slides[0].slide.image, jpeg);
  assert.notEqual(d.slides[1].id, 'a');
  assert.equal(d.slides[1].hidden, true);
  assert.deepEqual(d.slides[1].slide.points, [{ text: 'one', level: 0 }, { text: 'two', level: 1 }]);
  assert.equal(d.slides[3].slide.kind, 'bullets');
  assert.equal(d.slides[4].slide.ratio, 0);
  assert.equal(d.slides[4].original, jpeg);
  const kept = cleanRestyle({ slides: [{ slide: { kind: 'bullets', title: 'x', points: [] }, filePicture: jpeg, filePictureRatio: 1.5 }] });
  assert.equal(kept.slides[0].filePicture, jpeg);
  assert.equal(kept.slides[0].filePictureRatio, 1.5);
  assert.throws(() => cleanRestyle({ slides: [{ slide: { kind: 'bullets' }, filePicture: 'nope' }] }));
  assert.equal(cleanRestyle({ lookId: '<x>', transition: 'spin' }).lookId, 'classic_classic');
  assert.equal(cleanRestyle({}).logo, 'adron');
  assert.equal(cleanRestyle({ logo: 'none' }).logo, 'none');
  assert.equal(cleanRestyle({ logo: '<script>' }).logo, 'adron');
  assert.equal(cleanRestyle({ transition: 'spin' }).transition, 'cube');
});

test('pictures must be pictures, and a deck has limits', () => {
  assert.throws(() => cleanRestyle({ slides: [{ slide: { kind: 'picture', image: 'javascript:alert(1)' } }] }));
  assert.throws(() => cleanRestyle({ slides: [{ slide: { kind: 'picture', image: 'data:image/jpeg;base64,' + 'A'.repeat(2_300_000) } }] }));
  assert.throws(() => cleanRestyle({ slides: Array.from({ length: 8 }, () => ({ slide: { kind: 'picture', image: 'data:image/jpeg;base64,' + 'A'.repeat(2_000_000) } })) }));
  assert.throws(() => cleanRestyle({ slides: Array(81).fill({}) }));
  assert.throws(() => cleanRestyle({ thumb: 'data:image/jpeg;base64,' + 'A'.repeat(300_000) }));
});
