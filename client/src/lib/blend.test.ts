import { describe, expect, it } from 'vitest';
import { alreadyHas, quickBlend } from './blend';

describe('blending a new activity into a day', () => {
  it('uses the new text when the day is empty', () => {
    expect(quickBlend('', 'Distribute flyers at Ketu market.')).toBe('Distribute flyers at Ketu market');
  });
  it('joins into one line', () => {
    expect(quickBlend('Market storm at Ikeja.', 'Distribute flyers at Ketu market')).toBe('Market storm at Ikeja, then distribute flyers at Ketu market');
    expect(quickBlend('Market storm at Ikeja, then calls', 'Flyers at Ketu')).toBe('Market storm at Ikeja, then calls and flyers at Ketu');
  });
  it('keeps earlier lines and skips repeats', () => {
    expect(quickBlend('Office meeting\nMarket storm at Ogba', 'Flyers at Ketu')).toBe('Office meeting\nMarket storm at Ogba, then flyers at Ketu');
    expect(quickBlend('Market storm at Ikeja', 'market storm at ikeja')).toBe('Market storm at Ikeja');
    expect(alreadyHas('Church outreach at RCCG Fagba', 'church outreach at RCCG Fagba.')).toBe(true);
  });
  it('keeps proper names capitalised', () => {
    expect(quickBlend('Calls', 'RCCG Fagba outreach')).toBe('Calls, then RCCG Fagba outreach');
  });
});
