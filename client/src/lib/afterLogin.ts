/**
 * Where to land after logging in: "edit" (the week page) or "preview" (finished slides, ready
 * to present). The choice is remembered on this device for next time.
 */
export type OpenMode = 'edit' | 'preview';

const KEY = 'weekdeck:open-mode';
let pending: OpenMode | null = null;

export function getOpenMode(): OpenMode {
  try {
    return localStorage.getItem(KEY) === 'preview' ? 'preview' : 'edit';
  } catch {
    return 'edit';
  }
}

/** Called just before logging in. */
export function setOpenMode(mode: OpenMode) {
  pending = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode: still works for this login */
  }
}

/** The page to open right after a login. (Not cleared on read: React may render twice.) */
export function takeAfterLogin(): string {
  return pending === 'preview' ? '/preview' : '/';
}
