import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CANVAS_H, CANVAS_W, type Font, type Shape } from '../lib/deck';

const hex = (c: string | null) => (c ? `#${c}` : 'transparent');
const FONTS: Record<Font, string> = {
  sans: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: '"Arial Black", "Arial Bold", Gadget, Arial, sans-serif',
};
const stroke = (s: { stroke?: string; strokeW?: number }): CSSProperties => (s.stroke ? { border: `${s.strokeW ?? 2}px solid #${s.stroke}`, boxSizing: 'border-box' } : {});

/** Present mode: a number like "₦2,175,000" counts up from zero. */
function CountUp({ text, delay }: { text: string; delay: number }) {
  const m = /^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(text);
  const [shown, setShown] = useState(m ? `${m[1]}0${m[3]}` : text);
  useEffect(() => {
    if (!m) return;
    const target = Number(m[2].replace(/,/g, ''));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(target)) return setShown(text);
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 1200));
      const eased = 1 - (1 - p) ** 3;
      setShown(`${m[1]}${Math.round(target * eased).toLocaleString('en-US')}${m[3]}`);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, delay]);
  return <>{shown}</>;
}

/** Present mode entrances: shapes fade up one after another; bars grow; numbers count. */
function entrance(s: Shape, i: number): CSSProperties {
  const delay = Math.min(1400, i * 32);
  if (s.type === 'rect' && s.anim === 'grow') return { animation: `wd-grow 900ms cubic-bezier(.2,.8,.2,1) ${delay + 250}ms both`, transformOrigin: 'left center' };
  return { animation: `wd-in 520ms cubic-bezier(.2,.8,.2,1) ${delay}ms both` };
}

function ShapeView({ s, animate = false, index = 0 }: { s: Shape; animate?: boolean; index?: number }) {
  const box: CSSProperties = { position: 'absolute', left: s.x, top: s.y, ...(animate ? entrance(s, index) : {}) };
  switch (s.type) {
    case 'rect':
      return <div style={{ ...box, width: s.w, height: s.h, background: hex(s.fill), borderRadius: s.radius ?? 0, ...stroke(s) }} />;
    case 'ellipse':
      return <div style={{ ...box, width: s.w, height: s.h, background: hex(s.fill), borderRadius: '50%', ...stroke(s) }} />;
    case 'image':
      return <img src={s.src} alt="" style={{ ...box, width: s.w, height: s.h, objectFit: 'cover' }} />;
    case 'text':
      return (
        <div
          style={{
            ...box,
            width: s.w,
            height: s.h,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: s.valign === 'middle' ? 'center' : s.valign === 'bottom' ? 'flex-end' : 'flex-start',
            textAlign: s.align ?? 'left',
            color: hex(s.color),
            fontSize: s.size,
            fontWeight: s.font === 'display' ? 900 : s.bold ? 700 : 400,
            fontFamily: FONTS[s.font ?? 'sans'],
            fontStyle: s.italic ? 'italic' : 'normal',
            letterSpacing: s.spacing ?? 0,
            lineHeight: 1.18,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {animate && s.anim === 'count' ? <CountUp text={s.text} delay={Math.min(1400, index * 32) + 200} /> : s.text}
        </div>
      );
    case 'table': {
      const cell = (extra: CSSProperties = {}): CSSProperties => ({
        height: s.rowH,
        padding: '0 10px',
        border: `1px solid #${s.line}`,
        fontSize: s.size,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...extra,
      });
      return (
        <table style={{ ...box, borderCollapse: 'collapse', tableLayout: 'fixed', width: s.colW.reduce((a, b) => a + b, 0), color: hex(s.ink), fontFamily: FONTS[s.font ?? 'sans'] }}>
          <colgroup>
            {s.colW.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {s.head.map((h, i) => (
                <th key={i} style={cell({ background: hex(s.headFill), color: hex(s.headInk), textAlign: i === 0 ? 'left' : 'center', fontWeight: 700 })}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} style={cell({ background: hex(ri % 2 ? s.stripe : s.bg), textAlign: ci === 0 ? 'left' : 'center', fontWeight: s.boldEdges !== false && (ci === 0 || ci === r.length - 1) ? 700 : 400 })}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              {s.total.map((c, ci) => (
                <td key={ci} style={cell({ background: hex(s.totalFill), color: hex(s.totalInk), textAlign: ci === 0 ? 'left' : 'center', fontWeight: 700 })}>
                  {c}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      );
    }
  }
}

/** One slide drawn at 1280×720 and scaled to fit its container (or full size for printing). */
export function SlideCanvas({ bg, shapes, fixed = false, label, animate = false }: { bg: string; shapes: Shape[]; fixed?: boolean; label?: string; animate?: boolean }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(fixed ? 1 : 0.25);
  useEffect(() => {
    if (fixed || !wrap.current) return;
    const el = wrap.current;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / CANVAS_W));
    ro.observe(el);
    setScale(el.clientWidth / CANVAS_W);
    return () => ro.disconnect();
  }, [fixed]);

  const canvas = (
    <div
      role="img"
      aria-label={label}
      style={{
        width: CANVAS_W,
        height: CANVAS_H,
        // In a preview the full-size slide floats inside its box, so its 1280px never widens the page.
        position: fixed ? 'relative' : 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden',
        background: hex(bg),
        fontFamily: 'Arial, Helvetica, sans-serif',
        transform: fixed ? undefined : `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {shapes.map((s, i) => (
        <ShapeView key={i} s={s} animate={animate} index={i} />
      ))}
    </div>
  );
  if (fixed) return canvas;
  return (
    <div ref={wrap} style={{ width: '100%', minWidth: 0, aspectRatio: '16 / 9', overflow: 'hidden', position: 'relative', contain: 'layout paint' }}>
      {canvas}
    </div>
  );
}
