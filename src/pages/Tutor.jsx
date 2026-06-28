import { useEffect, useRef, useState } from 'react'
import { sub, fill } from '../theme.js'
import { callAnthropic, streamReveal } from '../lib/anthropic.js'
import { MODEL } from '../lib/config.js'
import Markdown from '../components/Markdown.jsx'

const SYSTEM =
  'You are a friendly, encouraging tutor for IGCSE/GCSE and A-Level students ' +
  '(maths, sciences, English). Explain clearly and concisely, show worked steps ' +
  'when helpful, and check understanding with a short follow-up question. You may ' +
  'give full answers here — this is study mode, not an exam.'

const CHIPS = ['Explain step-by-step', 'Give me a hint', 'Quiz me on this']

export default function Tutor({ t, reduceMotion, aiOn, onConnect, toast }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi Nino — I'm your AI tutor. Ask me anything, paste a question, or tell me a topic and I'll build your understanding step by step." },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [messages])
  useEffect(() => () => abortRef.current?.abort(), [])

  async function send(textArg) {
    const text = (textArg ?? input).trim()
    if (!text || busy) return
    if (!aiOn) {
      setInput('')
      setMessages((m) => [...m, { role: 'user', text }, { role: 'assistant', text: "I'm not connected yet — tap “Connect AI” (top-right) and paste an Anthropic API key, then I can answer fully." }])
      return
    }
    setInput('')
    setBusy(true)
    const history = [...messages, { role: 'user', text }]
    setMessages([...history, { role: 'assistant', text: '', streaming: true }])
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const reply = await callAnthropic({
        system: SYSTEM,
        messages: history.map((m) => ({ role: m.role, content: m.text })),
        maxTokens: 1000,
        model: MODEL,
        signal: controller.signal,
      })
      await streamReveal(reply, (partial) => setMessages((prev) => {
        const next = prev.slice()
        next[next.length - 1] = { role: 'assistant', text: partial, streaming: partial.length < reply.length }
        return next
      }), { reduceMotion })
    } catch {
      setMessages((prev) => {
        const next = prev.slice()
        next[next.length - 1] = { role: 'assistant', text: "I couldn't reach the AI just now. Check the API key in “Connect AI”, or try again in a moment." }
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 20, animation: reduceMotion ? 'none' : `qgfade .4s ${t.EASE} both`, minHeight: 0 }}>
      <div style={{ ...t.GLASS, borderRadius: 24, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 150px)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${fill(0.07)}`, display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 11, background: `linear-gradient(135deg,${t.accent},${t.accent2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0B0D10', fontWeight: 700 }}>AI</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>AI Tutor</div>
            <div style={{ fontSize: 11.5, color: aiOn ? t.OK : sub(0.5), display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: aiOn ? t.OK : sub(0.4), boxShadow: aiOn ? `0 0 7px ${t.OK}` : 'none' }} />
              {aiOn ? 'Online · full explanations' : 'Offline · connect AI to chat'}
            </div>
          </div>
          {!aiOn && (
            <button onClick={onConnect} style={{ ...t.ghostBtn, marginLeft: 'auto', padding: '8px 14px' }}>Connect AI</button>
          )}
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {messages.map((m, i) => (
            <div key={i} style={m.role === 'user'
              ? { alignSelf: 'flex-end', maxWidth: '78%', padding: '13px 16px', borderRadius: '18px 18px 4px 18px', background: t.hexA(t.accent, 0.16), border: `1px solid ${t.hexA(t.accent, 0.32)}`, fontSize: 14.5, lineHeight: 1.55 }
              : { alignSelf: 'flex-start', maxWidth: '84%', padding: '13px 16px', borderRadius: '18px 18px 18px 4px', background: fill(0.06), border: `1px solid ${t.hexA(t.accent, 0.22)}`, fontSize: 14.5, lineHeight: 1.55 }}>
              {m.role === 'assistant' ? <Markdown text={m.text} /> : m.text}
              {m.streaming && <span style={{ display: 'inline-block', width: 7, height: 15, marginLeft: 2, verticalAlign: '-2px', background: t.accent, animation: reduceMotion ? 'none' : 'qgblink 1s steps(1) infinite' }} />}
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 18px 18px', borderTop: `1px solid ${fill(0.07)}` }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 11, flexWrap: 'wrap' }}>
            {CHIPS.map((c) => (
              <button key={c} disabled={busy} onClick={() => send(c === 'Explain step-by-step' ? 'Explain how to factorise a quadratic, step by step.' : c === 'Give me a hint' ? 'Give me a hint for solving simultaneous equations.' : 'Quiz me with one IGCSE algebra question.')}
                style={{ padding: '7px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: "'Manrope',sans-serif", background: fill(0.05), border: `1px solid ${fill(0.12)}`, color: sub(0.7), opacity: busy ? 0.5 : 1 }}>{c}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 8px 8px 16px', borderRadius: 16, background: 'var(--input-bg)', border: `1px solid ${fill(0.1)}` }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} placeholder="Ask anything…" style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--ink)', fontSize: 14, fontFamily: "'Manrope',sans-serif" }} />
            <button onClick={() => send()} disabled={busy} aria-label="Send" style={{ width: 38, height: 38, borderRadius: 11, border: 'none', cursor: busy ? 'default' : 'pointer', background: `linear-gradient(135deg,${t.accent},${t.accent2})`, color: '#0B0D10', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: busy ? 0.6 : 1 }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4) }}>Current focus</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 9 }}>Algebra · Quadratics</div>
          <div style={{ height: 7, borderRadius: 999, background: fill(0.08), marginTop: 14, overflow: 'hidden' }}><div style={{ width: '62%', height: '100%', borderRadius: 999, background: `linear-gradient(90deg,${t.accent},${t.accent2})` }} /></div>
          <div style={{ fontSize: 12, color: sub(0.5), marginTop: 8 }}>62% mastery · 4 of 9 sub-skills secure</div>
        </div>
        <div style={{ ...t.GLASS, borderRadius: 24, padding: '22px 24px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: sub(0.4), marginBottom: 13 }}>Detected weak spots</div>
          {['Factorising harder quadratics', 'Simultaneous equations', 'Rearranging formulae (improving)'].map((w, i) => (
            <div key={w} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, marginBottom: 10, color: i === 2 ? sub(0.6) : 'var(--ink)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: i === 2 ? sub(0.3) : t.CORAL, boxShadow: i === 2 ? 'none' : `0 0 7px ${t.CORAL}` }} />{w}
            </div>
          ))}
        </div>
        <button style={{ ...t.cta, justifyContent: 'center', width: '100%' }} onClick={() => toast('Turning this into a mock exam…')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
          Turn this into a quiz
        </button>
      </div>
    </div>
  )
}
