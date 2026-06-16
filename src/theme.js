// ---------------------------------------------------------------------------
// Design tokens — lifted directly from the "Quiet Glass" reference so the exam
// module matches the rest of the dashboard exactly.
// ---------------------------------------------------------------------------

export const INK = '#F4F6F8'
export const OK = '#7DE3B0' // success green
export const CORAL = '#FF8A8A' // error / flagged

// hex + alpha -> rgba()
export function hexA(h, a) {
  const n = parseInt(h.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export const EASE = 'cubic-bezier(.22,1,.36,1)'

// The frosted glass surface used by every card in the reference.
export const GLASS = {
  background: 'rgba(255,255,255,0.055)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  border: '1px solid rgba(255,255,255,0.10)',
  boxShadow: '0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.16)',
}

export function getTheme(brand) {
  const accent = brand === 'BIST' ? '#FFC83D' : '#5B8CFF'
  const accent2 = brand === 'BIST' ? '#FFA63D' : '#8C7CFF'
  const glow = 1

  return {
    brand,
    accent,
    accent2,
    glow,
    INK,
    OK,
    CORAL,
    GLASS,
    EASE,
    hexA,

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
      color: '#0B0D10',
      background: `linear-gradient(135deg,${accent},${accent2})`,
      boxShadow: `0 8px 26px ${hexA(accent, 0.4 * glow)}, inset 0 1px 0 rgba(255,255,255,0.4)`,
    },

    // primary accent pill CTA
    cta: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      padding: '15px 26px',
      borderRadius: 999,
      border: `1px solid ${hexA(accent, 0.5)}`,
      background: `linear-gradient(135deg,${accent},${accent2})`,
      color: '#0B0D10',
      fontWeight: 700,
      fontSize: 15,
      fontFamily: "'Manrope',sans-serif",
      cursor: 'pointer',
      transition: `all .22s ${EASE}`,
      boxShadow: `0 14px 38px ${hexA(accent, 0.4 * glow)}, inset 0 1px 0 rgba(255,255,255,0.4)`,
    },

    // subtle accent-tinted "ghost" button
    ghostBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '11px 18px',
      borderRadius: 999,
      border: `1px solid ${hexA(accent, 0.45)}`,
      background: hexA(accent, 0.12),
      color: INK,
      fontWeight: 600,
      fontSize: 13,
      fontFamily: "'Manrope',sans-serif",
      cursor: 'pointer',
      transition: `all .2s ${EASE}`,
    },

    bloom: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      animation: 'qgbloom 22s ease-in-out infinite',
      background: `radial-gradient(46% 38% at 50% -4%, rgba(255,255,255,${0.13 * glow}) 0%, transparent 62%), radial-gradient(40% 34% at 72% 2%, ${hexA(accent, 0.09 * glow)} 0%, transparent 58%)`,
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
    border: `1px solid ${on ? t.hexA(t.accent, 0.5) : 'rgba(255,255,255,0.12)'}`,
    background: on ? t.hexA(t.accent, 0.16) : 'rgba(255,255,255,0.04)',
    color: on ? INK : 'rgba(244,246,248,0.62)',
    boxShadow: on ? `0 0 18px ${t.hexA(t.accent, 0.22 * t.glow)}` : 'none',
  }
}

// left-rail nav button
export function navStyle(t, on) {
  return {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: 14,
    cursor: 'pointer',
    transition: `all .25s ${t.EASE}`,
    border: `1px solid ${on ? t.hexA(t.accent, 0.4) : 'transparent'}`,
    background: on ? t.hexA(t.accent, 0.13) : 'transparent',
    color: on ? t.accent : 'rgba(244,246,248,0.45)',
    boxShadow: on ? `0 0 22px ${t.hexA(t.accent, 0.26 * t.glow)}` : 'none',
  }
}
