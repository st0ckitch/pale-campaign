// ---------------------------------------------------------------------------
// Design tokens. The neutral palette (ink, fills, glass, canvas) is driven by
// CSS variables defined in index.html, so a single `data-mode` switch flips the
// whole UI between dark and light. The brand accent (BIST yellow / BGA blue) is
// independent of mode.
// ---------------------------------------------------------------------------

export const INK = 'var(--ink)'
export const OK = '#34C796' // success green (readable on light + dark)
export const CORAL = '#F2607B' // error / flagged

// muted text + subtle fill helpers, both mode-aware via CSS variables
export const sub = (a) => `rgba(var(--text-rgb), ${a})`
export const fill = (a) => `rgba(var(--fill-rgb), ${a})`

// hex + alpha -> rgba()
export function hexA(h, a) {
  const n = parseInt(h.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export const EASE = 'cubic-bezier(.22,1,.36,1)'

// The frosted glass surface used by every card.
export const GLASS = {
  background: 'var(--glass-bg)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid var(--glass-border)',
  boxShadow: 'var(--glass-shadow)',
}

export function getTheme(brand) {
  const accent = brand === 'BIST' ? '#FFC83D' : '#5B8CFF'
  const accent2 = brand === 'BIST' ? '#FFA63D' : '#8C7CFF'
  // Text color that stays readable ON the accent gradient.
  const ctaInk = brand === 'BIST' ? '#241D08' : '#FFFFFF'
  // Soft shadows — the UI sits on a light canvas, heavy glows read as noise.
  const glow = 0.45

  return {
    brand,
    accent,
    accent2,
    ctaInk,
    glow,
    INK,
    OK,
    CORAL,
    GLASS,
    EASE,
    hexA,
    sub,
    fill,

    // brand mark on the left rail
    brandMark: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 46,
      height: 46,
      borderRadius: 15,
      cursor: 'pointer',
      fontFamily: "'Space Grotesk',sans-serif",
      fontWeight: 700,
      fontSize: 15,
      color: ctaInk,
      background: `linear-gradient(135deg,${accent},${accent2})`,
      boxShadow: `0 6px 18px ${hexA(accent, 0.35 * glow)}, inset 0 1px 0 rgba(255,255,255,0.4)`,
    },

    // primary accent pill CTA
    cta: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '14px 24px',
      borderRadius: 999,
      border: `1px solid ${hexA(accent, 0.5)}`,
      background: `linear-gradient(135deg,${accent},${accent2})`,
      color: ctaInk,
      fontWeight: 700,
      fontSize: 14.5,
      fontFamily: "'Manrope',sans-serif",
      cursor: 'pointer',
      transition: `all .22s ${EASE}`,
      boxShadow: `0 10px 26px ${hexA(accent, 0.4 * glow)}, inset 0 1px 0 rgba(255,255,255,0.4)`,
    },

    // subtle accent-tinted "ghost" button
    ghostBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '11px 18px',
      borderRadius: 999,
      border: `1px solid ${hexA(accent, 0.45)}`,
      background: hexA(accent, 0.1),
      color: INK,
      fontWeight: 600,
      fontSize: 13,
      fontFamily: "'Manrope',sans-serif",
      cursor: 'pointer',
      transition: `all .2s ${EASE}`,
    },

    bloom: {
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      animation: 'qgbloom 22s ease-in-out infinite',
      background: `radial-gradient(50% 40% at 60% -6%, ${hexA(accent, 0.1)} 0%, transparent 60%)`,
    },
  }
}

// pill toggle (used for brand switch + selectable chips)
export function pill(t, on) {
  return {
    padding: '9px 16px',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: `all .2s ${t.EASE}`,
    fontFamily: "'Manrope',sans-serif",
    border: `1px solid ${on ? t.hexA(t.accent, 0.55) : fill(0.14)}`,
    background: on ? t.hexA(t.accent, 0.18) : '#FFFFFF',
    color: on ? INK : sub(0.6),
  }
}

// left-rail nav item: icon + label
export function navStyle(t, on) {
  return {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    width: 66,
    padding: '10px 4px',
    borderRadius: 14,
    cursor: 'pointer',
    transition: `all .25s ${t.EASE}`,
    border: `1px solid ${on ? t.hexA(t.accent, 0.45) : 'transparent'}`,
    background: on ? t.hexA(t.accent, 0.14) : 'transparent',
    color: on ? INK : sub(0.55),
  }
}
