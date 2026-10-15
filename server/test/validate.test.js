'use strict';

const test = require('node:test');
const assert = require('node:assert');
const v = require('../src/utils/validate');

test('team names are trimmed and compared case-insensitively', () => {
  assert.deepStrictEqual(v.cleanTeamName('  Lifter   Marine '), { display: 'Lifter Marine', key: 'lifter marine' });
  assert.throws(() => v.cleanTeamName(' '), /team name/);
  assert.throws(() => v.cleanTeamName('x'.repeat(61)), /60/);
});

test('PIN is 4 to 6 digits', () => {
  assert.strictEqual(v.cleanPin('4821'), '4821');
  assert.strictEqual(v.cleanPin(' 123456 '), '123456');
  for (const bad of ['123', '1234567', '12a4', '', null]) assert.throws(() => v.cleanPin(bad));
});

test('weeks start on a real Monday', () => {
  assert.strictEqual(v.cleanWeekStart('2026-10-12'), '2026-10-12');
  assert.throws(() => v.cleanWeekStart('2026-10-13'), /Monday/);
  assert.throws(() => v.cleanWeekStart('2026-02-30'));
  assert.throws(() => v.cleanWeekStart('12-10-2026'));
});

test('amounts and new-client counts', () => {
  assert.strictEqual(v.amount('500000'), 500000);
  assert.strictEqual(v.amount(''), null);
  assert.strictEqual(v.amount(1.6), 2);
  assert.throws(() => v.amount(-1));
  assert.throws(() => v.amount('abc'));
  assert.strictEqual(v.count('2'), 2);
  assert.throws(() => v.count('1.5'));
});

test('members need unique ids and names', () => {
  const m = v.cleanMembers([
    { id: 'm_abcd1', name: '  Olorunsogo  Samuel ', lead: true },
    { id: 'm_abcd2', name: 'Ajibogun Vincent' },
  ]);
  assert.deepStrictEqual(m[0], { id: 'm_abcd1', name: 'Olorunsogo Samuel', lead: true });
  assert.strictEqual(m[1].lead, false);
  assert.throws(() => v.cleanMembers([{ id: 'm_abcd1', name: 'A' }, { id: 'm_abcd1', name: 'B' }]), /Duplicate/);
  assert.throws(() => v.cleanMembers([{ id: 'm_abcd1', name: ' ' }]), /name/);
  assert.throws(() => v.cleanMembers([{ id: '<script>', name: 'A' }]));
});

test('a week keeps only current members and cleans every figure', () => {
  const w = v.cleanWeek(
    {
      rows: [
        { memberId: 'm_abcd1', mon: '100000', thu: 500000, nc: '2' },
        { memberId: 'm_gone1', mon: 999 }, // removed from the team: dropped
        { memberId: 'm_abcd1', mon: 1 }, // duplicate: dropped
      ],
      activities: { mon: '  NECA house, Alausa  ', fri: 'x'.repeat(700) },
    },
    ['m_abcd1', 'm_abcd2'],
  );
  assert.strictEqual(w.rows.length, 1);
  assert.deepStrictEqual(w.rows[0], { memberId: 'm_abcd1', nc: 2, mon: 100000, tue: null, wed: null, thu: 500000, fri: null });
  assert.strictEqual(w.activities.mon, 'NECA house, Alausa');
  assert.strictEqual(w.activities.fri.length, 600);
  assert.strictEqual(w.activities.tue, '');
});

test('team profile falls back to safe defaults', () => {
  const p = v.cleanTeamProfile({ deckTitle: '', templateId: '../../etc', members: [] });
  assert.strictEqual(p.deckTitle, 'Weekly Strategic Session');
  assert.strictEqual(p.templateId, 'classic');
});

test('cover photo must be a small image data URL', () => {
  assert.strictEqual(v.cleanCoverImage(''), '');
  assert.strictEqual(v.cleanCoverImage('data:image/jpeg;base64,AAAA'), 'data:image/jpeg;base64,AAAA');
  assert.throws(() => v.cleanCoverImage('data:text/html;base64,AAAA'));
  assert.throws(() => v.cleanCoverImage('javascript:alert(1)'));
  assert.throws(() => v.cleanCoverImage('data:image/png;base64,' + 'A'.repeat(600_000)), /too large/);
});
