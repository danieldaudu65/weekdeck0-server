/**
 * Turns the text and tables read from a team's old PowerPoint into WeekDeck
 * data. Pure (no browser APIs) so it can be unit-tested with the real
 * example deck's content.
 *
 * It looks for, in any order:
 *  - a cover: title + manager line ("OLORUNSOGO SAMUEL (KSO)") + role ("(TEAM LEAD)")
 *  - a team slide: a heading with "TEAM" and a list of names
 *  - a weekly table: header with MON…FRI (+ NC, TOTAL)
 *  - a monthly table: header with WK 1…WK 4 (used for names only)
 *  - an activities slide: lines starting with Monday…Friday
 * Anything it can't find is left empty for the manager to fill in.
 */
import { DAYS, emptyActivities, newMemberId, type Activities, type DayKey, type Member } from './types';

export interface SlideParagraph {
  text: string;
  /** Placeholder type from the slide layout: title, ctrTitle, subTitle, body… */
  ph?: string;
}

export interface SlideContent {
  index: number;
  paragraphs: SlideParagraph[];
  tables: string[][][]; // table → rows → cells
  /** Path of the first picture on the slide, if any (e.g. "ppt/media/image1.jpeg"). */
  picture?: string;
}

export interface ImportedFigures {
  memberId: string;
  mon: number | null;
  tue: number | null;
  wed: number | null;
  thu: number | null;
  fri: number | null;
  nc: number | null;
}

export interface ImportResult {
  deckTitle: string;
  managerName: string;
  managerTag: string;
  managerRole: string;
  teamTitle: string;
  region: string;
  activitiesTitle: string;
  members: Member[];
  activities: Activities;
  /** Last week's figures from the weekly table, matched to members (null when there was no table). */
  figures: ImportedFigures[] | null;
  coverPicture?: string;
  found: string[];
  warnings: string[];
}

const SMALL_WORDS = new Set(['of', 'and', 'the', 'a', 'an', 'in', 'on', 'at', 'for', 'to']);
const ACRONYM = /^(KSO|WPR|NC|MD|CEO|HR|ICT|II|III|IV)$/;

/** "OLORUNSOGO  SAMUEL" → "Olorunsogo Samuel"; keeps short codes like KSO and WPR in capitals. */
export function titleCase(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      if (ACRONYM.test(w.toUpperCase().replace(/[^A-Z]/g, ''))) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.replace(/(^|[-'’(])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(' ');
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const stripEndDot = (s: string) => s.replace(/[\s.]+$/, '');
const BULLET = /^[\s❖•▪▫◦●○■□►▶➢➤✓✔\-–—*·v]+(?=\S)/u;
const ROLE_IN_PARENS = /\(([^)]*)\)/g;
const LEAD_WORDS = /\b(team\s*lead|leader|manager|team\s*head|head)\b/i;

/** Parse "100,000", "₦500,000", "500000" → number; anything else → null. */
export function parseNumberCell(raw: string): number | null {
  const s = raw.replace(/[₦,\s]|ngn/gi, '');
  if (!s) return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s));
}

function cleanName(raw: string): { name: string; lead: boolean } | null {
  let s = raw.replace(BULLET, '');
  s = s.replace(/^\s*\d+[.)]\s*/, ''); // "1. Name"
  let lead = false;
  s = s.replace(ROLE_IN_PARENS, (_m, inner: string) => {
    if (LEAD_WORDS.test(inner)) lead = true;
    return ' ';
  });
  s = clean(s);
  if (!s || s.length > 60 || /\d{3,}/.test(s)) return null;
  // Names are 1–5 words of letters.
  const words = s.split(' ');
  if (words.length > 5 || !words.every((w) => /^[\p{L}'’.-]+$/u.test(w))) return null;
  return { name: titleCase(s), lead };
}

const DAY_RE = /^\s*(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?)\b[\s:,.\-–—]*(.*)$/i;

function dayKeyOf(word: string): DayKey | null {
  const w = word.toLowerCase();
  if (w.startsWith('mon')) return 'mon';
  if (w.startsWith('tue')) return 'tue';
  if (w.startsWith('wed')) return 'wed';
  if (w.startsWith('thu')) return 'thu';
  if (w.startsWith('fri')) return 'fri';
  return null;
}

function tidySentence(s: string): string {
  const t = clean(s).replace(/\s+([.,;:])/g, '$1');
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

function headerIndex(header: string[], test: (h: string) => boolean): number {
  return header.findIndex((h) => test(h.trim().toUpperCase()));
}

function isWeeklyHeader(row: string[]) {
  const up = row.map((c) => c.trim().toUpperCase());
  return ['MON', 'TUE', 'WED', 'THU', 'FRI'].filter((d) => up.some((c) => c.startsWith(d))).length >= 4;
}

function isMonthlyHeader(row: string[]) {
  return row.filter((c) => /^\s*(WK|WEEK)\s*\d/i.test(c)).length >= 2;
}

/** Does a table's short name ("OLORUNSOGO") belong to a member ("Olorunsogo Samuel")? */
function nameMatches(short: string, full: string) {
  const a = short.toLowerCase().replace(/[^\p{L} ]/gu, '').trim();
  const b = full.toLowerCase();
  if (!a) return false;
  if (a === b) return true;
  const words = b.split(' ');
  return a.split(' ').every((w) => words.includes(w)) || b.startsWith(a);
}

export function analyzeSlides(slides: SlideContent[]): ImportResult {
  const found: string[] = [];
  const warnings: string[] = [];
  const result: ImportResult = {
    deckTitle: '',
    managerName: '',
    managerTag: '',
    managerRole: '',
    teamTitle: '',
    region: '',
    activitiesTitle: '',
    members: [],
    activities: emptyActivities(),
    figures: null,
    found,
    warnings,
  };

  // ---- Cover: the first slide with a title placeholder (usually slide 1).
  const cover = slides.find((s) => s.paragraphs.some((p) => p.ph === 'ctrTitle' || p.ph === 'title')) ?? slides[0];
  if (cover) {
    const titleParas = cover.paragraphs.filter((p) => p.ph === 'ctrTitle' || p.ph === 'title');
    const rest = cover.paragraphs.filter((p) => !(p.ph === 'ctrTitle' || p.ph === 'title') && clean(p.text) && p.ph !== 'sldNum');
    const title = clean((titleParas.length ? titleParas : cover.paragraphs.slice(0, 1)).map((p) => p.text).join(' '));
    if (title) result.deckTitle = stripEndDot(titleCase(title));
    // Manager line = the first line that looks like a name; a line that's only "(…)" is the role.
    for (const p of rest) {
      const t = clean(p.text);
      const onlyParens = /^\(([^)]*)\)$/.exec(t);
      if (onlyParens) {
        if (!result.managerRole) result.managerRole = titleCase(onlyParens[1]);
        continue;
      }
      if (!result.managerName) {
        const tags: string[] = [];
        const nameOnly = clean(t.replace(ROLE_IN_PARENS, (_m, inner: string) => (tags.push(inner.trim()), ' ')));
        const n = cleanName(nameOnly);
        if (n) {
          result.managerName = n.name;
          for (const tag of tags) {
            if (LEAD_WORDS.test(tag)) result.managerRole = result.managerRole || titleCase(tag);
            else if (!result.managerTag) result.managerTag = tag.toUpperCase();
          }
        }
      }
    }
    if (cover.picture) result.coverPicture = cover.picture;
    if (result.deckTitle) found.push('title');
    if (result.managerName) found.push('manager');
  }

  // ---- Tables
  let weekly: string[][] | null = null;
  let monthly: string[][] | null = null;
  for (const s of slides) {
    for (const t of s.tables) {
      const hi = t.findIndex((row) => isWeeklyHeader(row));
      if (hi >= 0 && !weekly) weekly = t.slice(hi);
      const mi = t.findIndex((row) => isMonthlyHeader(row));
      if (mi >= 0 && !monthly) monthly = t.slice(mi);
    }
  }

  // ---- Team slide: heading with TEAM + a list of names
  for (const s of slides) {
    if (s === cover) continue;
    const heading = s.paragraphs.find((p) => /\bteam\b/i.test(p.text) && !DAY_RE.test(p.text) && (p.ph === 'title' || p.text.length < 80));
    if (!heading) continue;
    const names = s.paragraphs
      .filter((p) => p !== heading && p.ph !== 'sldNum' && p.ph !== 'title')
      .map((p) => cleanName(p.text))
      .filter((x): x is { name: string; lead: boolean } => Boolean(x));
    if (names.length >= 2) {
      result.teamTitle = stripEndDot(titleCase(heading.text));
      result.members = names.map((n) => ({ id: newMemberId(), name: n.name, lead: n.lead }));
      found.push('team');
      break;
    }
  }

  // No team slide: take names from the tables instead.
  const rowNames = (table: string[][] | null) =>
    (table ?? [])
      .slice(1)
      .map((r) => clean(r[0] ?? ''))
      .filter((n) => n && !/^total/i.test(n));
  if (!result.members.length) {
    const names = rowNames(weekly).length ? rowNames(weekly) : rowNames(monthly);
    result.members = names
      .map((n) => cleanName(n))
      .filter((x): x is { name: string; lead: boolean } => Boolean(x))
      .map((n) => ({ id: newMemberId(), name: n.name, lead: false }));
    if (result.members.length) found.push('team');
  }
  // Mark the manager as lead if no one is.
  if (result.managerName && result.members.length && !result.members.some((m) => m.lead)) {
    const m = result.members.find((x) => nameMatches(result.managerName.split(' ')[0], x.name));
    if (m) m.lead = true;
  }
  if (!result.managerName) {
    const lead = result.members.find((m) => m.lead);
    if (lead) result.managerName = lead.name;
  }
  if (!result.managerRole && result.managerName) result.managerRole = 'Team Lead';

  const regionMatch = /([\p{L}]+)\s+region\b/iu.exec(result.teamTitle) ?? /\bregion[:\s]+([\p{L}]+)/iu.exec(result.teamTitle);
  if (regionMatch) result.region = titleCase(regionMatch[1]);

  // ---- Weekly figures → matched to members
  if (weekly && weekly.length > 1) {
    const header = weekly[0];
    const col: Record<DayKey | 'nc', number> = {
      mon: headerIndex(header, (h) => h.startsWith('MON')),
      tue: headerIndex(header, (h) => h.startsWith('TUE')),
      wed: headerIndex(header, (h) => h.startsWith('WED')),
      thu: headerIndex(header, (h) => h.startsWith('THU')),
      fri: headerIndex(header, (h) => h.startsWith('FRI')),
      nc: headerIndex(header, (h) => h === 'NC' || h.startsWith('NEW CLIENT') || h === 'N/C'),
    };
    const figures: ImportedFigures[] = [];
    const unmatched: string[] = [];
    for (const row of weekly.slice(1)) {
      const name = clean(row[0] ?? '');
      if (!name || /^total/i.test(name)) continue;
      const member = result.members.find((m) => nameMatches(name, m.name));
      if (!member) {
        unmatched.push(titleCase(name));
        continue;
      }
      const cell = (i: number) => (i >= 0 ? parseNumberCell(row[i] ?? '') : null);
      figures.push({ memberId: member.id, mon: cell(col.mon), tue: cell(col.tue), wed: cell(col.wed), thu: cell(col.thu), fri: cell(col.fri), nc: cell(col.nc) });
    }
    if (figures.length) {
      result.figures = figures;
      found.push('weekly figures');
    }
    if (unmatched.length) warnings.push(`These names in the weekly table aren't in the team list: ${unmatched.join(', ')}. Add them to the team if they're members.`);
  }
  if (monthly) found.push('monthly table');

  // ---- Activities: the slide with the most lines starting with a weekday
  let best: SlideContent | null = null;
  let bestCount = 0;
  for (const s of slides) {
    const n = s.paragraphs.filter((p) => DAY_RE.test(p.text)).length;
    if (n > bestCount) {
      best = s;
      bestCount = n;
    }
  }
  if (best && bestCount >= 2) {
    for (const p of best.paragraphs) {
      const m = DAY_RE.exec(p.text);
      if (!m) continue;
      const key = dayKeyOf(m[1]);
      if (key && !result.activities[key]) result.activities[key] = tidySentence(m[2]);
    }
    const titleP =
      best.paragraphs.find((p) => /activit|wpr|plan/i.test(p.text) && !DAY_RE.test(p.text)) ??
      best.paragraphs.find((p) => p.ph === 'title');
    if (titleP) result.activitiesTitle = stripEndDot(titleCase(titleP.text.replace(/\.\s*/g, ' ')));
    found.push('activities');
  }

  if (!result.members.length) warnings.push("I couldn't find the team members. Add them below.");
  if (!DAYS.some((d) => result.activities[d])) warnings.push("I couldn't find the daily activities. You can type them in.");
  return result;
}
