'use strict';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(40);
const test = require('node:test');
const assert = require('node:assert');
const A = require('../src/utils/accounts');

const row = (over = {}) => ({ kind: 'land', tab: 'ogbafagba', branch: 'FAGBA', date: '2026-10-09', alertName: 'SHODE MARY EKINADESE', bank: 'GTB', amount: 100000, clientName: 'Shode  Mary Ekinadese', marketer: 'OLORUNSOGO OPEOLUWA SAMUEL', rate: 7, confirmation: 'CONFIRMED', ...over });

test('a payment row is cleaned the way the sheet holds it', () => {
  const p = A.cleanPayment({ ...row(), amount: '1,450,000', rate: '10', junk: 'dropped', accountNumber: 4213205557 });
  assert.equal(p.tab, 'OGBAFAGBA');
  assert.equal(p.amount, 1450000);
  assert.equal(p.rate, 10);
  assert.equal(p.accountNumber, '4213205557');
  assert.equal(p.junk, undefined);
  assert.equal(p.clientName, 'Shode Mary Ekinadese');
  assert.equal(A.cleanPayment({ ...row(), amount: 15498953.257 }).amount, 15498953.26);
  assert.equal(A.cleanPayment({ ...row(), rate: 'NILL' }).rate, null);
  assert.throws(() => A.cleanPayment({ ...row(), kind: 'other' }));
  assert.throws(() => A.cleanPayment({ ...row(), date: '09/10/2026' }));
  assert.throws(() => A.cleanPayment({ ...row(), date: '2026-02-30' }));
  assert.throws(() => A.cleanPayment({ ...row(), amount: -5 }));
});

test('the same payment is recognised however the names are spaced or cased', () => {
  const a = A.cleanPayment(row());
  const b = A.cleanPayment(row({ alertName: ' shode mary  ekinadese ', clientName: 'SHODE MARY EKINADESE' }));
  assert.equal(A.paymentKey(a), A.paymentKey(b));
  // Same client, same day, same amount, but a different alert reference: two payments.
  const c = A.cleanPayment(row({ alertName: 'UPF057261014155702002914638207/UP-IB' }));
  assert.notEqual(A.paymentKey(a), A.paymentKey(c));
  assert.notEqual(A.paymentKey(a), A.paymentKey(A.cleanPayment(row({ kind: 'infra' }))));
  // Several plots bought the same day with the same amount: different CABAL IDs, different payments.
  assert.notEqual(A.paymentKey(A.cleanPayment(row({ cabalId: '30000102362' }))), A.paymentKey(A.cleanPayment(row({ cabalId: '30000102390' }))));
  assert.equal(A.paymentKey(A.cleanPayment(row({ cabalId: 'NEW & FORM' }))), A.paymentKey(a));
});

test('summary: land includes new clients, infra apart, new clients counted once per client', () => {
  const ps = [
    { month: '2026-10', kind: 'land', tab: 'OGBAFAGBA', branch: 'FAGBA', amount: 100000, confirmation: 'CONFIRMED' },
    { month: '2026-10', kind: 'land', tab: 'OGBAFAGBA VIDCO', branch: '', amount: 90000, confirmation: 'PROVIDE EVIDENCE' },
    { month: '2026-10', kind: 'new', tab: 'OGBAFAGBA', branch: 'FAGBA', amount: 60000, clientName: 'AKINDUTIRE PELUMI', confirmation: 'CONFIRMED' },
    { month: '2026-10', kind: 'new', tab: 'OGBAFAGBA', branch: 'FAGBA', amount: 60000, clientName: 'akindutire  pelumi', confirmation: 'CONFIRMED' },
    { month: '2026-10', kind: 'infra', tab: 'ABULE EGBA', branch: 'ABULE EGBA', amount: 500000, confirmation: 'CONFIRMED' },
  ];
  const s = A.summarize(ps, [{ name: 'OGBAFAGBA VIDCO', branch: 'FAGBA' }]);
  const fagba = s.find((c) => c.branch === 'FAGBA');
  assert.deepEqual(fagba.all, { land: 310000, infra: 0, nc: 1 });
  assert.deepEqual(fagba.confirmed, { land: 220000, infra: 0, nc: 1 });
  assert.deepEqual(s.find((c) => c.branch === 'ABULE EGBA').all, { land: 0, infra: 500000, nc: 0 });
});

test('marketers, tabs, history and slide choices are tidied', () => {
  const m = A.cleanMarketer({ name: ' arthur  nyong etim ', designation: 'rro', aliases: ['Arthur Nyong Stim', 'ARTHUR NYONG STIM'], teamRef: 'nope' });
  assert.equal(m.name, 'ARTHUR NYONG ETIM');
  assert.equal(m.key, 'ARTHUR NYONG ETIM');
  assert.equal(m.designation, 'RRO');
  assert.deepEqual(m.aliases, ['ARTHUR NYONG STIM']);
  assert.equal(m.teamRef, null);
  assert.deepEqual(A.cleanTabs([{ name: 'ogbafagba', branch: 'fagba' }, { name: 'OGBAFAGBA' }]), [{ name: 'OGBAFAGBA', branch: 'FAGBA' }]);
  assert.deepEqual(A.cleanHistory([{ branch: 'fagba', month: '2026-01', land: '41,285,745.83', infra: 10060000, nc: 3 }]), [
    { branch: 'FAGBA', month: '2026-01', land: 41285745.83, infra: 10060000, nc: 3 },
  ]);
  assert.throws(() => A.cleanHistory([{ branch: 'FAGBA', month: '2026-13' }]));
  const d = A.cleanDeck({ lookId: 'bold_coral', off: ['team:FAGBA:Social', '<script>'], titles: [{ id: 'cover:FAGBA', title: 'Fagba Continent' }] });
  assert.deepEqual(d.off, ['team:FAGBA:Social']);
  assert.equal(d.titles[0].title, 'Fagba Continent');
  assert.equal(d.countAll, false);
});

test('accountant sign-up rules', () => {
  assert.deepEqual(A.cleanEmail(' Ade@Adron.com '), { email: 'Ade@Adron.com', key: 'ade@adron.com' });
  assert.throws(() => A.cleanEmail('ade@'));
  assert.throws(() => A.cleanPassword('short'));
  assert.equal(A.cleanMonth('2026-10'), '2026-10');
  assert.throws(() => A.cleanMonth('2026-1'));
});
