'use strict';

/**
 * Rules for the accountants' workbook. Pure functions (no database), unit-tested.
 *
 * One payment = one row of the accountant's sheet. The columns are the 26 of
 * their Google Sheet (A–Z), plus the week 2–4 clearance columns that the
 * "New client" sheet has. `kind` says which of their three files the row
 * belongs to, `tab` which sheet tab, `month` which month's workbook.
 */
const { ValidationError } = require('./validate');

const KINDS = ['land', 'new', 'infra']; // Workflow (land & building), New client, Infrastructure & other fees

/** Every column, in sheet order. type: text | number | date. */
const FIELDS = [
  ['sn', 'number'],
  ['branch', 'text'],
  ['date', 'date'],
  ['alertName', 'text'],
  ['bank', 'text'],
  ['amount', 'number'],
  ['promo', 'text'],
  ['clientName', 'text'],
  ['marketer', 'text'],
  ['supervisor', 'text'],
  ['designation', 'text'],
  ['accountNumber', 'text'],
  ['spouseName', 'text'],
  ['spouseAccount', 'text'],
  ['cabalId', 'text'],
  ['land', 'number'],
  ['form', 'text'], // 10000, or text like "TRANSFER FEE"
  ['rate', 'number'],
  ['accountantComment', 'text'],
  ['postingStatus', 'text'],
  ['confirmAmount', 'number'],
  ['confirmation', 'text'],
  ['officer', 'text'],
  ['confirmationComment', 'text'],
  ['clearance', 'text'],
  ['comment', 'text'],
  ['w2Clearance', 'text'],
  ['w2Comment', 'text'],
  ['w3Clearance', 'text'],
  ['w3Comment', 'text'],
  ['w4Clearance', 'text'],
  ['w4Comment', 'text'],
].map(([key, type]) => ({ key, type }));

const MAX_TEXT = 400;
const MAX_ROWS_PER_SAVE = 1000;
const MAX_TABS = 30;

function text(raw, max = MAX_TEXT) {
  if (raw === null || raw === undefined) return '';
  return String(raw).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Numbers as the sheet holds them: naira can have kobo (15498953.25), rate is a percent. */
function num(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[₦,\s]/g, ''));
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) return null;
  return Math.round(n * 100) / 100;
}

function cleanDate(raw) {
  const s = text(raw, 10);
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError('Dates must look like 2026-10-09.');
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new ValidationError('That date doesn’t exist.');
  return s;
}

function cleanMonth(raw) {
  const s = String(raw ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) throw new ValidationError('Pick a month, e.g. 2026-10.');
  return s;
}

function cleanKind(raw) {
  if (!KINDS.includes(raw)) throw new ValidationError('Unknown sheet type.');
  return raw;
}

/** Tab names as typed, upper-cased like their sheets: "ogbafagba vidco" → "OGBAFAGBA VIDCO". */
function cleanTabName(raw) {
  const s = text(raw, 40).toUpperCase();
  if (!s) throw new ValidationError('Every tab needs a name.');
  return s;
}

function cleanTabs(raw) {
  if (!Array.isArray(raw)) throw new ValidationError('Tabs must be a list.');
  if (raw.length > MAX_TABS) throw new ValidationError(`At most ${MAX_TABS} tabs.`);
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    const name = cleanTabName(t && t.name);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, branch: text(t.branch, 40).toUpperCase() });
  }
  return out;
}

/** One row from the browser → the fields we store. Unknown keys are dropped. */
function cleanPayment(raw) {
  const r = raw || {};
  const out = { kind: cleanKind(r.kind), tab: cleanTabName(r.tab) };
  for (const f of FIELDS) {
    if (f.type === 'number') out[f.key] = num(r[f.key]);
    else if (f.type === 'date') out[f.key] = cleanDate(r[f.key]);
    else out[f.key] = text(r[f.key]);
  }
  if (out.amount !== null && out.amount < 0) throw new ValidationError('Amounts can’t be negative.');
  out.pos = Number.isFinite(Number(r.pos)) ? Number(r.pos) : 0;
  return out;
}

/** Same person written the same way: "  Arthur  nyong etim " → "ARTHUR NYONG ETIM". */
const nameKey = (s) => text(s, MAX_TEXT).toUpperCase().replace(/[^A-Z0-9 &'-]/g, '').replace(/\s+/g, ' ').trim();

const cabalKey = (s) => {
  const v = nameKey(s);
  return /^NEW\s*&\s*FORM$|^NEW$|^-$|^NIL+$/.test(v) ? '' : v;
};

/**
 * Two rows are the same payment when the date, the name on the alert, the
 * amount, the client and the CABAL ID match. One client buying several plots
 * on a day (one transfer each) stays several rows: the CABAL IDs differ.
 */
function paymentKey(p) {
  return [p.kind, p.tab, p.date || '', nameKey(p.alertName), num(p.amount) ?? '', nameKey(p.clientName), cabalKey(p.cabalId)].join('|');
}

function cleanMarketer(raw) {
  const r = raw || {};
  const name = text(r.name, 120).toUpperCase();
  if (!name) throw new ValidationError('Every marketer needs a name.');
  return {
    name,
    key: nameKey(name),
    designation: text(r.designation, 40).toUpperCase(),
    supervisor: text(r.supervisor, 120).toUpperCase(),
    accountNumber: text(r.accountNumber, 30),
    spouseName: text(r.spouseName, 120).toUpperCase(),
    spouseAccount: text(r.spouseAccount, 30),
    branch: text(r.branch, 40).toUpperCase(),
    team: text(r.team, 80),
    lead: Boolean(r.lead),
    aliases: Array.isArray(r.aliases) ? [...new Set(r.aliases.map((a) => nameKey(a)).filter(Boolean))].slice(0, 12) : [],
    teamRef: /^[a-f0-9]{24}$/.test(String(r.teamRef || '')) ? String(r.teamRef) : null,
  };
}

function cleanHistory(raw) {
  if (!Array.isArray(raw)) throw new ValidationError('Earlier months must be a list.');
  const seen = new Set();
  const out = [];
  for (const h of raw.slice(0, 400)) {
    const branch = text(h && h.branch, 40).toUpperCase();
    if (!branch) continue;
    const month = cleanMonth(h.month);
    const k = `${branch}|${month}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const nc = num(h.nc);
    out.push({ branch, month, land: num(h.land), infra: num(h.infra), nc: nc === null ? null : Math.round(nc) });
  }
  return out;
}

const SLIDE_ID = /^[A-Za-z0-9:_ &.'-]{1,120}$/;
function cleanDeck(raw) {
  const r = raw || {};
  const ids = (list) => (Array.isArray(list) ? [...new Set(list.map(String).filter((x) => SLIDE_ID.test(x)))].slice(0, 300) : []);
  return {
    lookId: /^[a-z0-9_-]{2,40}$/.test(String(r.lookId || '')) ? r.lookId : 'classic_classic',
    off: ids(r.off),
    on: ids(r.on),
    order: ids(r.order),
    titles: Array.isArray(r.titles)
      ? r.titles
          .filter((t) => t && SLIDE_ID.test(String(t.id)) && text(t.title, 160))
          .slice(0, 300)
          .map((t) => ({ id: String(t.id), title: text(t.title, 160) }))
      : [],
    countAll: Boolean(r.countAll),
  };
}

function cleanEmail(raw) {
  const email = text(raw, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('Enter a valid email address.');
  return { email, key: email.toLowerCase() };
}

function cleanPassword(raw) {
  const p = String(raw ?? '');
  if (p.length < 8) throw new ValidationError('The password must be at least 8 characters.');
  if (p.length > 100) throw new ValidationError('That password is too long.');
  return p;
}

function cleanPersonName(raw, what = 'your name') {
  const s = text(raw, 80);
  if (s.length < 2) throw new ValidationError(`Enter ${what}.`);
  return s;
}

/* ------------------------------------------------------------------ summary */

const isConfirmed = (p) => /^CONFIRMED/i.test(String(p.confirmation || '').trim());
const branchOf = (p, tabBranch) => (text(p.branch, 40).toUpperCase() || tabBranch.get(p.tab) || p.tab || '').trim();

/**
 * Totals for the Jan–Dec slide: per month and branch, land & building (Workflow
 * + New client), infrastructure & other fees, and new clients (distinct client
 * names in the New client sheet). Each figure twice: every payment, and
 * confirmed payments only.
 */
function summarize(payments, tabs = []) {
  const tabBranch = new Map(tabs.map((t) => [t.name, t.branch]));
  const cells = new Map();
  for (const p of payments) {
    const branch = branchOf(p, tabBranch);
    const k = `${p.month}|${branch}`;
    if (!cells.has(k)) cells.set(k, { month: p.month, branch, land: 0, infra: 0, landOk: 0, infraOk: 0, nc: new Set(), ncOk: new Set() });
    const c = cells.get(k);
    const amt = num(p.amount) || 0;
    const ok = isConfirmed(p);
    if (p.kind === 'infra') {
      c.infra += amt;
      if (ok) c.infraOk += amt;
    } else {
      c.land += amt;
      if (ok) c.landOk += amt;
    }
    if (p.kind === 'new' && nameKey(p.clientName)) {
      c.nc.add(nameKey(p.clientName));
      if (ok) c.ncOk.add(nameKey(p.clientName));
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  return [...cells.values()]
    .map((c) => ({ month: c.month, branch: c.branch, all: { land: r2(c.land), infra: r2(c.infra), nc: c.nc.size }, confirmed: { land: r2(c.landOk), infra: r2(c.infraOk), nc: c.ncOk.size } }))
    .sort((a, b) => (a.month === b.month ? a.branch.localeCompare(b.branch) : a.month.localeCompare(b.month)));
}

module.exports = {
  KINDS,
  FIELDS,
  MAX_ROWS_PER_SAVE,
  cleanPayment,
  cleanMarketer,
  cleanMonth,
  cleanKind,
  cleanTabs,
  cleanTabName,
  cleanHistory,
  cleanDeck,
  cleanEmail,
  cleanPassword,
  cleanPersonName,
  paymentKey,
  nameKey,
  summarize,
  isConfirmed,
};
