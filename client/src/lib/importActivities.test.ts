import { describe, expect, it } from 'vitest';
import { dayOfWord, findActivities, readDayLine } from './importActivities';
import { analyzeSlides, type SlideContent } from './importAnalyze';

const slide = (index: number, lines: (string | { text: string; ph: string })[], tables: string[][][] = []): SlideContent => ({
  index,
  paragraphs: lines.map((l) => (typeof l === 'string' ? { text: l } : l)),
  tables,
});
const title = (text: string) => ({ text, ph: 'title' });

describe('day words', () => {
  it('knows short forms, capitals and common misspellings', () => {
    expect(['Mon', 'MONDAY', 'Tues', 'TUE', 'Weds', 'Wed', 'Thur', 'Thurs', 'THU', 'Fri', 'friday'].map(dayOfWord)).toEqual([
      'mon', 'mon', 'tue', 'tue', 'wed', 'wed', 'thu', 'thu', 'thu', 'fri', 'fri',
    ]);
    expect(['Wenesday', 'Wednessday', 'Thurday', 'Tusday', 'Fridy'].map(dayOfWord)).toEqual(['wed', 'wed', 'thu', 'tue', null]);
    expect(['Money', 'Month', 'Thank', 'Frame', 'Sunday', 'Saturday'].map(dayOfWord)).toEqual([null, null, null, null, null, null]);
  });

  it('reads the day label in all its forms', () => {
    expect(readDayLine('❖ MONDAY – Site visit')).toEqual({ days: ['mon'], rest: 'Site visit' });
    expect(readDayLine('Mon. 20th Oct: Site visit')).toEqual({ days: ['mon'], rest: 'Site visit' });
    expect(readDayLine('Monday (20/10/2026) - Site visit')).toEqual({ days: ['mon'], rest: 'Site visit' });
    expect(readDayLine('Monday & Tuesday: Office')).toEqual({ days: ['mon', 'tue'], rest: 'Office' });
    expect(readDayLine('Monday – Friday: Storming')).toEqual({ days: ['mon', 'tue', 'wed', 'thu', 'fri'], rest: 'Storming' });
    expect(readDayLine('Wed to Fri: Field work')!.days).toEqual(['wed', 'thu', 'fri']);
    expect(readDayLine(' Thursday: Training')).toEqual({ days: ['thu'], rest: 'Training' }); // PDF bullet glyph
    expect(readDayLine('MONDAY')).toEqual({ days: ['mon'], rest: '' });
    expect(readDayLine('Monday’s meeting was good')).toBeNull();
    expect(readDayLine('Market storming')).toBeNull();
  });
});

describe('finding the plan', () => {
  it('reads the classic "Monday: …" list', () => {
    const r = findActivities([slide(5, [title('WPR ACTIVITIES'), 'Monday: Site visit', 'Tuesday: Office', 'Wednesday: Storming', 'Thursday: Training', 'Friday: Review'])]);
    expect(r.activities).toEqual({ mon: 'Site visit', tue: 'Office', wed: 'Storming', thu: 'Training', fri: 'Review' });
  });

  it('reads a day label with the plan on the next lines', () => {
    const r = findActivities([slide(5, ['MONDAY', 'Site inspection at Fagba', 'Meet new clients', 'TUESDAY', 'Office follow-up', 'FRIDAY', 'Weekly review', 'Thank you'])]);
    expect(r.activities.mon).toBe('Site inspection at Fagba; Meet new clients');
    expect(r.activities.tue).toBe('Office follow-up');
    expect(r.activities.fri).toBe('Weekly review; Thank you'); // a label on its own takes the next lines
  });

  it('keeps a closing note out of Friday', () => {
    const r = findActivities([slide(5, ['Monday: Visit', 'Friday: Review meeting', 'Let us all put in our best this week'])]);
    expect(r.activities.fri).toBe('Review meeting');
  });

  it('reads ranges and pairs of days', () => {
    const r = findActivities([slide(5, ['Monday & Tuesday: Office calls', 'Wednesday – Friday: Market storming'])]);
    expect(r.activities).toEqual({ mon: 'Office calls', tue: 'Office calls', wed: 'Market storming', thu: 'Market storming', fri: 'Market storming' });
  });

  it('reads a Day | Activity table', () => {
    const r = findActivities([slide(5, [title('ACTIVITIES')], [[['DAY', 'ACTIVITY'], ['Monday', 'Site visit'], ['Tuesday', 'Office'], ['Friday', 'Review']]])]);
    expect(r.activities).toMatchObject({ mon: 'Site visit', tue: 'Office', fri: 'Review' });
  });

  it('reads a table with the days across the top, but not the sales table', () => {
    const plan = [['MON', 'TUE', 'WED', 'THU', 'FRI'], ['Site visit', 'Office', 'Storming', 'Training', 'Review']];
    const sales = [['NAME', 'MON', 'TUE', 'WED', 'THU', 'FRI'], ['OLA', '100,000', '', '50k', '', '']];
    const r = findActivities([slide(3, [], [sales]), slide(5, [], [plan])]);
    expect(r.activities).toEqual({ mon: 'Site visit', tue: 'Office', wed: 'Storming', thu: 'Training', fri: 'Review' });
    expect(r.slide!.index).toBe(5);
  });

  it('joins a plan split over two slides', () => {
    const r = findActivities([
      slide(5, ['Monday: Site visit', 'Tuesday: Office', 'Wednesday: Storming']),
      slide(6, ['Thursday: Training', 'Friday: Review']),
    ]);
    expect(r.activities).toEqual({ mon: 'Site visit', tue: 'Office', wed: 'Storming', thu: 'Training', fri: 'Review' });
  });

  it('ignores a lone day mentioned somewhere else', () => {
    const r = findActivities([slide(2, ['Friday: we closed 3 sales']), slide(5, ['Monday: Site visit', 'Tuesday: Office'])]);
    expect(r.activities.fri).toBe('');
  });

  it('reads two days typed in one paragraph with line breaks', () => {
    const r = findActivities([slide(5, ['Monday: Site visit\nTuesday: Office\nWednesday: Storming'])]);
    expect(r.activities).toMatchObject({ mon: 'Site visit', tue: 'Office', wed: 'Storming' });
  });
});

describe('a deck laid out like the DRRO weekly report', () => {
  it('reads the manager from "LEAD BY" and the plan from a DAY | PLANS table', () => {
    const r = analyzeSlides([
      slide(1, [{ text: 'WEEKLY PERFORMANCE REPORT.', ph: 'ctrTitle' }, { text: 'LEAD BY BLESSING', ph: 'ctrTitle' }]),
      slide(2, ['TEAM MEMBERS', 'ADEYEMI BLESSING', 'OKORO JAMES', 'BELLO KEMI']),
      slide(5, ['STRATEGY FOR THE WEEK'], [[
        ['DAY', ' PLANS AND STRATEGIES'],
        ['Monday', 'We want to target GRA IKEJA.'],
        ['Tuesday', 'Marketing at Ishaga market.'],
        ['Wednesday', 'Early morning storming at Abule Egba'],
        ['Thursday', ' Front office Activation '],
        ['Friday', 'Marketing at Jendol Superstore.'],
      ]]),
    ]);
    expect(r.deckTitle).toBe('Weekly Performance Report');
    expect(r.managerName).toBe('Adeyemi Blessing');
    expect(r.members.find((m) => m.lead)?.name).toBe('Adeyemi Blessing');
    expect(r.activitiesTitle).toBe('Strategy for the Week');
    expect(r.activities).toEqual({
      mon: 'We want to target GRA IKEJA',
      tue: 'Marketing at Ishaga market',
      wed: 'Early morning storming at Abule Egba',
      thu: 'Front office Activation',
      fri: 'Marketing at Jendol Superstore',
    });
  });
});
