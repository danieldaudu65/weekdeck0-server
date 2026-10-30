/**
 * The looks a deck can take: a STYLE (the layout: where things sit, shapes,
 * fonts) combined with a PALETTE (the colours). 12 styles × 20 palettes.
 * Hex colours are written without "#" (the PowerPoint builder needs it that way).
 */
export interface Theme {
  id: string;
  name: string;
  dark: boolean; // content slides have a dark background
  bg: string; // content slide background
  ink: string; // main text
  muted: string; // secondary text
  primary: string; // headers, day pills, bars
  primaryInk: string; // text on primary
  accent: string; // highlights, motif
  highlight: string; // big numbers and labels on content slides
  accentInk: string; // text on accent
  surface: string; // cards, stripes
  line: string; // table lines
  coverBg: string;
  coverInk: string;
  coverMuted: string;
}
export type Palette = Theme;

export const PALETTES: Theme[] = [
  { id: 'classic', name: 'Classic Blue', dark: false, bg: 'FFFFFF', ink: '1C2742', muted: '5B6782', primary: '2F5DA8', primaryInk: 'FFFFFF', accent: 'F5A524', accentInk: '1C2742', highlight: '2F5DA8', surface: 'EEF2FA', line: 'D3DCEE', coverBg: '2F5DA8', coverInk: 'FFFFFF', coverMuted: 'D6E1F5' },
  { id: 'midnight', name: 'Midnight Gold', dark: true, bg: '0E1A2B', ink: 'F1F5F9', muted: '9AA8BD', primary: 'FFB020', primaryInk: '0E1A2B', accent: '4F7CFF', accentInk: 'FFFFFF', highlight: 'FFB020', surface: '17273F', line: '26395A', coverBg: '0A1422', coverInk: 'FFFFFF', coverMuted: 'A9B6CA' },
  { id: 'emerald', name: 'Emerald', dark: false, bg: 'FFFFFF', ink: '10231A', muted: '52665B', primary: '0F5132', primaryInk: 'FFFFFF', accent: 'D4A72C', accentInk: '10231A', highlight: '0F5132', surface: 'E8F5EC', line: 'CFE3D6', coverBg: '0F5132', coverInk: 'FFFFFF', coverMuted: 'CBE6D6' },
  { id: 'coral', name: 'Coral Energy', dark: false, bg: 'FFFFFF', ink: '2A1A2E', muted: '6E5A70', primary: 'E2453C', primaryInk: 'FFFFFF', accent: '2F3C7E', accentInk: 'FFFFFF', highlight: 'E2453C', surface: 'FDEDEC', line: 'F4CFCC', coverBg: 'C8322A', coverInk: 'FFFFFF', coverMuted: 'FAD4D1' },
  { id: 'royal', name: 'Royal Purple', dark: false, bg: 'FFFFFF', ink: '241433', muted: '665A73', primary: '5B2A86', primaryInk: 'FFFFFF', accent: 'F2C14E', accentInk: '241433', highlight: '5B2A86', surface: 'F3ECF9', line: 'E0D3EE', coverBg: '3B1A5A', coverInk: 'FFFFFF', coverMuted: 'D9C8EA' },
  { id: 'ocean', name: 'Ocean Teal', dark: false, bg: 'FFFFFF', ink: '0B2A2E', muted: '4E6A6E', primary: '0E7C86', primaryInk: 'FFFFFF', accent: 'FF7A59', accentInk: '2B0E05', highlight: '0E7C86', surface: 'E6F4F5', line: 'C7E4E6', coverBg: '0B4F57', coverInk: 'FFFFFF', coverMuted: 'BFE1E4' },
  { id: 'sunset', name: 'Sunset Orange', dark: false, bg: 'FFFFFF', ink: '2B1608', muted: '73594A', primary: 'E8590C', primaryInk: 'FFFFFF', accent: 'FFC94D', accentInk: '3A1D00', highlight: 'D9480F', surface: 'FFF1E6', line: 'FAD9C2', coverBg: 'C2410C', coverInk: 'FFFFFF', coverMuted: 'FFE2CC' },
  { id: 'wine', name: 'Wine & Gold', dark: false, bg: 'FFFFFF', ink: '2A0F18', muted: '6E5560', primary: '7A1F3D', primaryInk: 'FFFFFF', accent: 'C9A227', accentInk: '2A0F18', highlight: '7A1F3D', surface: 'F7ECEF', line: 'EBD3DA', coverBg: '4A0E22', coverInk: 'FFFFFF', coverMuted: 'E8C9D3' },
  { id: 'charcoal', name: 'Charcoal Lime', dark: true, bg: '18181B', ink: 'F4F4F5', muted: 'A1A1AA', primary: 'A3E635', primaryInk: '18181B', accent: '22D3EE', accentInk: '0B1B1F', highlight: 'A3E635', surface: '27272A', line: '3F3F46', coverBg: '0C0C0E', coverInk: 'FFFFFF', coverMuted: 'B4B4BC' },
  { id: 'rose', name: 'Rose & Navy', dark: false, bg: 'FFFFFF', ink: '22233A', muted: '64657E', primary: 'D6336C', primaryInk: 'FFFFFF', accent: '2B2D42', accentInk: 'FFFFFF', highlight: 'C2255C', surface: 'FDECF2', line: 'F6D0DE', coverBg: 'B8285A', coverInk: 'FFFFFF', coverMuted: 'F7CFDD' },
  { id: 'mono', name: 'Black & Yellow', dark: false, bg: 'FFFFFF', ink: '111111', muted: '5C5C5C', primary: '111111', primaryInk: 'FFFFFF', accent: 'FFD400', accentInk: '111111', highlight: '111111', surface: 'F2F2F2', line: 'DDDDDD', coverBg: '111111', coverInk: 'FFFFFF', coverMuted: 'C8C8C8' },
  { id: 'sky', name: 'Fresh Sky', dark: false, bg: 'FFFFFF', ink: '0C2340', muted: '51667F', primary: '0284C7', primaryInk: 'FFFFFF', accent: '22C55E', accentInk: '052E16', highlight: '0369A1', surface: 'E0F2FE', line: 'C3E3F7', coverBg: '0369A1', coverInk: 'FFFFFF', coverMuted: 'CBE8FA' },
  // More colour: bolder pairs, and three dark sets for big screens.
  { id: 'estate', name: 'Estate Green', dark: false, bg: 'FFFFFF', ink: '0F2418', muted: '4F6457', primary: '15803D', primaryInk: 'FFFFFF', accent: 'FACC15', accentInk: '1F1A00', highlight: '15803D', surface: 'ECFDF3', line: 'C9EBD5', coverBg: '14532D', coverInk: 'FFFFFF', coverMuted: 'BBF7D0' },
  { id: 'lagoon', name: 'Lagoon Blue', dark: false, bg: 'FFFFFF', ink: '0A1F33', muted: '4C6278', primary: '0062A8', primaryInk: 'FFFFFF', accent: '00C2E0', accentInk: '002A33', highlight: '0062A8', surface: 'E6F4FB', line: 'C4E2F2', coverBg: '023E7D', coverInk: 'FFFFFF', coverMuted: 'BDE3FA' },
  { id: 'berry', name: 'Berry & Amber', dark: false, bg: 'FFFFFF', ink: '2A0E1C', muted: '6E5262', primary: '9D174D', primaryInk: 'FFFFFF', accent: 'F59E0B', accentInk: '2A1600', highlight: '9D174D', surface: 'FCEEF4', line: 'F3CFDF', coverBg: '831843', coverInk: 'FFFFFF', coverMuted: 'FBCFE8' },
  { id: 'violet', name: 'Electric Violet', dark: false, bg: 'FFFFFF', ink: '1E1238', muted: '5F5578', primary: '6D28D9', primaryInk: 'FFFFFF', accent: '22D3EE', accentInk: '062A30', highlight: '6D28D9', surface: 'F3EEFE', line: 'DED2FA', coverBg: '4C1D95', coverInk: 'FFFFFF', coverMuted: 'DDD6FE' },
  { id: 'terracotta', name: 'Terracotta & Teal', dark: false, bg: 'FFFFFF', ink: '2A160D', muted: '6D564A', primary: 'B4532A', primaryInk: 'FFFFFF', accent: '2A9D8F', accentInk: 'FFFFFF', highlight: '9A3F1C', surface: 'FBEFE8', line: 'F0D6C7', coverBg: '7C2D12', coverInk: 'FFFFFF', coverMuted: 'FED7C3' },
  { id: 'neon', name: 'Neon Night', dark: true, bg: '0B1020', ink: 'EEF2FF', muted: 'A3ACC9', primary: '8B5CF6', primaryInk: 'FFFFFF', accent: '22D3EE', accentInk: '04232A', highlight: '22D3EE', surface: '161D36', line: '27304F', coverBg: '070B18', coverInk: 'FFFFFF', coverMuted: 'B7BEDA' },
  { id: 'crimson', name: 'Crimson Night', dark: true, bg: '1A0B0E', ink: 'FDF2F2', muted: 'C9A9AE', primary: 'EF4444', primaryInk: '1A0B0E', accent: 'FBBF24', accentInk: '1A0B0E', highlight: 'FBBF24', surface: '2A1418', line: '45232A', coverBg: '12070A', coverInk: 'FFFFFF', coverMuted: 'E3C3C8' },
  { id: 'forest', name: 'Forest Gold', dark: true, bg: '0C1A12', ink: 'ECFDF3', muted: 'A3BFAE', primary: 'FACC15', primaryInk: '0C1A12', accent: '34D399', accentInk: '062016', highlight: 'FACC15', surface: '14281C', line: '22402D', coverBg: '07120C', coverInk: 'FFFFFF', coverMuted: 'B6D3C1' },
];

export interface StyleInfo {
  id: string;
  name: string;
  blurb: string;
}

/** Layout families. The drawing for each lives in looks.ts. */
export const STYLES: StyleInfo[] = [
  { id: 'classic', name: 'Classic', blurb: 'Clean cards, the familiar look' },
  { id: 'corporate', name: 'Header Bar', blurb: 'Coloured title band, very formal' },
  { id: 'bold', name: 'Bold Block', blurb: 'Big colour panel, loud and proud' },
  { id: 'minimal', name: 'Minimal', blurb: 'Lots of white, thin lines' },
  { id: 'editorial', name: 'Magazine', blurb: 'Serif headlines, big numbers' },
  { id: 'glow', name: 'Night Glow', blurb: 'Dark with soft glowing lights' },
  { id: 'playful', name: 'Bubbles', blurb: 'Round, friendly and bright' },
  { id: 'dashboard', name: 'Dashboard', blurb: 'Everything in tidy panels' },
  { id: 'rail', name: 'Side Rail', blurb: 'A colour rail down the side' },
  { id: 'ribbon', name: 'Ribbon', blurb: 'Titles on a bold ribbon' },
  { id: 'framed', name: 'Framed', blurb: 'A border, centred titles' },
  { id: 'stripes', name: 'Stripes', blurb: 'Bands of colour, top and bottom' },
];

export interface Look {
  id: string; // "style_palette"
  style: StyleInfo;
  palette: Theme;
}

const OLD_IDS = new Set(['classic', 'midnight', 'emerald', 'coral']);

/** "bold_coral" → the look. Older saved ids ("coral") keep the classic layout. */
export function lookById(id: string | undefined): Look {
  const raw = String(id || '');
  let [styleId, paletteId] = raw.split('_');
  if (!paletteId && OLD_IDS.has(styleId)) [styleId, paletteId] = ['classic', styleId];
  const style = STYLES.find((s) => s.id === styleId) ?? STYLES[0];
  const palette = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];
  return { id: `${style.id}_${palette.id}`, style, palette };
}

export const lookId = (styleId: string, paletteId: string) => `${styleId}_${paletteId}`;

/* Kept for older imports: a palette by id. */
export const THEMES = PALETTES;
export const themeById = (id: string | undefined) => lookById(id).palette;
