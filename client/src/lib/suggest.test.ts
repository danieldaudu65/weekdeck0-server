import { describe, expect, it } from 'vitest';
import { buildMemory, extractPlaces, planFromUsual, splitActivities, suggest } from './suggest';

const history = [
  { weekStart: '2026-10-05', activities: { mon: 'Market storm at Ikeja, Ogba and Allen Avenue', tue: 'Site inspection at Ibeju-Lekki', wed: 'Church outreach at RCCG Fagba', thu: 'Telemarketing and follow-up calls', fri: 'Weekly review meeting' } },
  { weekStart: '2026-09-28', activities: { mon: 'Market storm at Ikeja computer village', tue: 'Site inspection at Ibeju-Lekki', wed: 'Church outreach at RCCG Fagba\nFlyer distribution at Agege', thu: 'Telemarketing and follow-up calls', fri: 'Weekly review meeting' } },
  { weekStart: '2026-09-21', activities: { mon: 'Market storm at Ogba', tue: '', wed: '', thu: 'Telemarketing and follow-up calls', fri: 'Weekly review meeting' } },
];
const mem = buildMemory(history);
const now = '2026-10-12';
const texts = (day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri', text: string) => suggest(mem, { day, text, weekStart: now }).map((s) => s.apply);

describe('activity memory', () => {
  it('splits and finds places', () => {
    expect(splitActivities('1. Market storm. Church outreach at X; flyers\n- calls')).toEqual(['Market storm', 'Church outreach at X', 'flyers', 'calls']);
    expect(extractPlaces('Market storm at Ikeja, Ogba and Allen Avenue then calls')).toEqual(['Ikeja', 'Ogba', 'Allen Avenue']);
  });

  it('knows what a day usually holds', () => {
    expect(texts('mon', '')[0]).toBe('Market storm at ');
    expect(suggest(mem, { day: 'thu', text: 'tele', weekStart: now })[0]).toMatchObject({ kind: 'usual', apply: 'Telemarketing and follow-up calls' });
  });

  it('completes places after "at", preferring places used for that activity', () => {
    const list = texts('mon', 'Market storm at ');
    expect(list.slice(0, 2)).toEqual(['Market storm at Ikeja', 'Market storm at Ogba']);
    expect(texts('mon', 'Market storm at Og')).toEqual(['Market storm at Ogba']);
  });

  it('only completes the line being typed', () => {
    expect(texts('wed', 'Church outreach at RCCG Fagba\nfly')[0]).toBe('Church outreach at RCCG Fagba\nFlyer distribution at Agege');
  });

  it('gives starter ideas to new teams', () => {
    const fresh = buildMemory([]);
    expect(suggest(fresh, { day: 'mon', text: '', weekStart: now }).every((s) => s.kind === 'idea')).toBe(true);
    expect(suggest(fresh, { day: 'mon', text: 'chu', weekStart: now })[0].apply).toBe('Church outreach at ');
  });

  it('fills only empty days from the usual week', () => {
    const plan = planFromUsual(mem, { mon: '', tue: 'Busy', wed: '', thu: '', fri: '' }, now);
    expect(plan.tue).toBeUndefined();
    expect(plan.thu).toBe('Telemarketing and follow-up calls');
    expect(plan.fri).toBe('Weekly review meeting');
  });
});
