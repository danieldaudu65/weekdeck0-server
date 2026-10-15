import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { CANVAS_H, CANVAS_W, type Font, type Shape } from '../lib/deck';

const hex = (c: string | null) => (c ? `#${c}` : 'transparent');
const FONTS: Record<Font, string> = {
  sans: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  display: '"Arial Black", "Arial Bold", Gadget, Arial, sans-serif',
};
const stroke = (s: { stroke?: string; strokeW?: number }): CSSProperties => (s.stroke ? { border: `${s.strokeW ?? 2}px solid #${s.stroke}`, boxSizing: 'border-box' } : {});

function ShapeView({ s }: { s: Shape }) {
  const box: CSSProperties = { position: 'absolute', left: s.x, top: s.y };
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
          {s.text}
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
export function SlideCanvas({ bg, shapes, fixed = false, label }: { bg: string; shapes: Shape[]; fixed?: boolean; label?: string }) {
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
        <ShapeView key={i} s={s} />
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
