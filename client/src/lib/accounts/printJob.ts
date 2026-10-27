/** The slides handed from the Export page to the print page (same tab; kept for a reload too). */
import type { DeckSlide } from '../deck';

export interface PrintJob {
  slides: DeckSlide[];
  lookId: string;
  title: string;
  teamName: string;
}

const KEY = 'weekdeck.accounts.print';
let current: PrintJob | null = null;

export function setPrintJob(job: PrintJob) {
  current = job;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(job));
  } catch {
    /* too big or blocked: the in-memory copy is used */
  }
}

export function getPrintJob(): PrintJob | null {
  if (current) return current;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PrintJob) : null;
  } catch {
    return null;
  }
}
