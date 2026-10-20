import { describe, expect, it } from 'vitest';
import { pageToSlide, type PdfTextPiece } from './pdfLayout';
import { analyzeSlides } from './importAnalyze';

const H = 540; // a 16:9 PDF page is 960 × 540
/** Text at (x, top) like it looks on screen; converted to PDF's bottom-up y. */
const t = (str: string, x: number, top: number, size = 14): PdfTextPiece => ({ str, x, y: H - top, w: str.length * size * 0.5, size });

const cover = [t('WEEKLY REPORT', 300, 200, 40), t('OLORUNSOGO SAMUEL (KSO)', 300, 280, 18), t('(TEAM LEAD)', 300, 305, 16)];

const team = [
  t('TEAM SOCIAL FAGBA REGION', 200, 60, 30),
  // names in two columns on the same lines
  t('❖ Olorunsogo Samuel (Team Lead)', 80, 150), t('❖ Adebayo Grace', 520, 150),
  t('❖ Okafor Chidi', 80, 180), t('❖ Bello Aisha', 520, 180),
  t('3', 900, 520, 10),
];

const weekly = [
  t('WEEKLY SALES', 380, 50, 30),
  ...['NAMES', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'NC', 'TOTAL'].map((h, i) => t(h, 60 + i * 110, 120, 12)),
  // empty TUE/WED/FRI/NC cells are just missing in a PDF
  t('OLORUNSOGO', 60, 150, 12), t('100,000', 170, 150, 12), t('500,000', 390, 150, 12), t('600,000', 830, 150, 12),
  t('ADEBAYO', 60, 180, 12), t('200,000', 280, 180, 12), t('2', 720, 180, 12), t('200,000', 830, 180, 12),
  // a name that wrapped onto two lines, figures centred between them
  t('OKAFOR', 60, 205, 12), t('50,000', 500, 212, 12), t('50,000', 830, 212, 12), t('CHIDI', 60, 220, 12),
  t('TOTAL', 60, 260, 12), t('850,000', 830, 260, 12),
];

const activities = [
  t('WPR. ACTIVITIES FOR THE WEEK', 250, 60, 28),
  t('Monday:', 80, 140, 16), t('Site inspection at Fagba estate with', 200, 140, 16),
  t('new clients from Ikeja', 80, 162, 16),
  t('Tuesday: Office follow-up calls', 80, 200, 16),
  t('Wednesday: Market storming at Agege', 80, 240, 16),
  t('Thursday: Training', 80, 280, 16),
  t('Friday: Weekly review meeting', 80, 320, 16),
];

describe('PDF import', () => {
  const slides = [cover, team, weekly, activities].map((p, i) => pageToSlide(p, H, i + 1, `page:${i + 1}`));

  it('rebuilds a table with empty cells in the right columns', () => {
    const table = slides[2].tables[0];
    expect(table[0]).toEqual(['NAMES', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'NC', 'TOTAL']);
    expect(table[1]).toEqual(['OLORUNSOGO', '100,000', '', '500,000', '', '', '', '600,000']);
    expect(table[2]).toEqual(['ADEBAYO', '', '200,000', '', '', '', '2', '200,000']);
    expect(table[3][0]).toBe('OKAFOR CHIDI');
    expect(table[3][4]).toBe('50,000');
  });

  it('reads the whole deck like a PowerPoint', () => {
    const r = analyzeSlides(slides);
    expect(r.deckTitle).toBe('Weekly Report');
    expect(r.managerName).toBe('Olorunsogo Samuel');
    expect(r.managerTag).toBe('KSO');
    expect(r.managerRole).toBe('Team Lead');
    expect(r.teamTitle).toBe('Team Social Fagba Region');
    expect(r.region).toBe('Fagba');
    expect(r.members.map((m) => m.name).sort()).toEqual(['Adebayo Grace', 'Bello Aisha', 'Okafor Chidi', 'Olorunsogo Samuel']);
    expect(r.members.find((m) => m.lead)?.name).toBe('Olorunsogo Samuel');
    expect(r.activities.mon).toBe('Site inspection at Fagba estate with new clients from Ikeja');
    expect(r.activities.wed).toBe('Market storming at Agege');
    expect(r.activities.fri).toBe('Weekly review meeting');
    const ola = r.figures!.find((f) => f.memberId === r.members.find((m) => m.name === 'Olorunsogo Samuel')!.id)!;
    expect([ola.mon, ola.tue, ola.wed, ola.nc]).toEqual([100000, null, 500000, null]);
    const okafor = r.figures!.find((f) => f.memberId === r.members.find((m) => m.name === 'Okafor Chidi')!.id)!;
    expect(okafor.thu).toBe(50000);
    expect(r.coverPicture).toBe('page:1');
  });

  it('works with no pictures and no table', () => {
    const r = analyzeSlides([pageToSlide(cover, H, 1), pageToSlide(activities, H, 2)]);
    expect(r.coverPicture).toBeUndefined();
    expect(r.managerName).toBe('Olorunsogo Samuel');
    expect(r.figures).toBeNull();
    expect(r.activities.thu).toBe('Training');
  });
});

describe('PDF tables found in real exported decks', () => {
  const row = (top: number, cells: [string, number][]) => cells.map(([s, x]) => t(s, x, top, 12));
  const cols = [60, 170, 280, 390, 500, 610, 720, 830];
  const head = row(100, ['NAME', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'NC', 'TOTAL'].map((h, i) => [h, cols[i]] as [string, number]));

  it('keeps reading after a member with no sales (a row with only a name)', () => {
    const page = [
      ...head,
      ...row(130, [['ADEYEMI', 60], ['100,000', 170], ['100,000', 830]]),
      ...row(160, [['BELLO', 60]]), // nothing sold
      ...row(190, [['NWOSU', 60], ['50,000', 280], ['50,000', 830]]),
      ...row(220, [['SANNI', 60], ['2,000,000', 500], ['2,000,000', 830]]),
      ...row(250, [['TOTAL', 60]]),
    ];
    const table = pageToSlide(page, H, 3).tables[0];
    expect(table.map((r) => r[0])).toEqual(['NAME', 'ADEYEMI', 'BELLO', 'NWOSU', 'SANNI', 'TOTAL']);
    expect(table[4][4]).toBe('2,000,000');
  });

  it('puts back words and numbers broken by a narrow column', () => {
    const page = [
      ...head,
      ...row(130, [['MARGARE', 60], ['1,300,0', 170], ['1,300,0', 830]]),
      ...row(146, [['T', 60], ['00', 170], ['00', 830]]),
      ...row(176, [['NNAMDI', 60], ['200,000', 280], ['200,000', 830]]),
      ...row(206, [['VICTOR', 60]]),
    ];
    const table = pageToSlide(page, H, 3).tables[0];
    expect(table[1].slice(0, 2)).toEqual(['MARGARET', '1,300,000']);
    expect(table.map((r) => r[0])).toEqual(['NAME', 'MARGARET', 'NNAMDI', 'VICTOR']);
  });

  it('reads a cover whose lines are all one size (no "title" to find)', () => {
    const r = analyzeSlides([
      pageToSlide([t('WEEKLY PERFORMANCE REPORT.', 150, 240, 20), t('LEAD BY BLESSING', 300, 270, 20)], H, 1),
      pageToSlide([t('TEAM MEMBERS', 300, 40, 28), t('', 10, 130, 28), t('ADEYEMI BLESSING', 60, 130, 28), t('', 10, 165, 28), t('OKORO JAMES', 60, 165, 28)], H, 2),
    ]);
    expect(r.deckTitle).toBe('Weekly Performance Report');
    expect(r.members.map((m) => m.name)).toEqual(['Adeyemi Blessing', 'Okoro James']);
    expect(r.managerName).toBe('Adeyemi Blessing');
  });
});
