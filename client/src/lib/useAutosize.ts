import { useLayoutEffect, type RefObject } from 'react';

/**
 * Grows a textarea to fit its text, so nothing is hidden inside a tiny box
 * and the box never scrolls back to its first line when the text changes.
 */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: unknown, minRows = 2) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const pad = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, line * minRows + pad) + border}px`;
  }, [ref, value, minRows]);
}
