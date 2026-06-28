import React from 'react'

// Minimal, safe Markdown -> React renderer for AI chat replies. Handles bold,
// italic, inline code, headings, bullet/numbered lists and paragraphs with soft
// line breaks. Builds React nodes (no dangerouslySetInnerHTML).

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`)/g

function inline(text) {
  const out = []
  let last = 0
  let m
  let k = 0
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('**') || tok.startsWith('__')) {
      out.push(<strong key={k++}>{tok.slice(2, -2)}</strong>)
    } else if (tok.startsWith('`')) {
      out.push(
        <code key={k++} style={{ fontFamily: "'Space Grotesk', ui-monospace, monospace", background: 'rgba(var(--fill-rgb),0.12)', padding: '1px 5px', borderRadius: 5, fontSize: '0.92em' }}>
          {tok.slice(1, -1)}
        </code>,
      )
    } else {
      out.push(<em key={k++}>{tok.slice(1, -1)}</em>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const isList = (l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)

export default function Markdown({ text }) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n')
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const h = line.match(/^(#{1,3})\s+(.*)/)
    if (h) { blocks.push({ type: 'h', level: h[1].length, text: h[2] }); i++; continue }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, '')); i++ }
      blocks.push({ type: 'ul', items }); continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++ }
      blocks.push({ type: 'ol', items }); continue
    }

    const para = [line]; i++
    while (i < lines.length && lines[i].trim() && !isList(lines[i]) && !/^#{1,3}\s/.test(lines[i])) { para.push(lines[i]); i++ }
    blocks.push({ type: 'p', text: para.join('\n') })
  }

  return (
    <>
      {blocks.map((b, bi) => {
        const top = bi === 0 ? 0 : 8
        if (b.type === 'h') {
          return <div key={bi} style={{ margin: `${top}px 0 4px`, fontSize: b.level === 1 ? 16 : 15, fontWeight: 700 }}>{inline(b.text)}</div>
        }
        if (b.type === 'ul' || b.type === 'ol') {
          const Tag = b.type === 'ul' ? 'ul' : 'ol'
          return (
            <Tag key={bi} style={{ margin: `${top}px 0 0`, paddingLeft: 20 }}>
              {b.items.map((it, ii) => <li key={ii} style={{ margin: '2px 0' }}>{inline(it)}</li>)}
            </Tag>
          )
        }
        const parts = b.text.split('\n')
        return (
          <p key={bi} style={{ margin: `${top}px 0 0` }}>
            {parts.map((p, pi) => <React.Fragment key={pi}>{pi > 0 && <br />}{inline(p)}</React.Fragment>)}
          </p>
        )
      })}
    </>
  )
}
