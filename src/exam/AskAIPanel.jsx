import { useEffect, useRef, useState } from 'react'
import { callAnthropic, streamReveal } from '../lib/anthropic.js'
import { MODEL } from '../lib/config.js'

// System prompts differ by phase to protect exam integrity.
function systemFor(mode, question) {
  const base =
    `The question the student is working on is:\n"${question.prompt}"\n` +
    (question.type === 'mcq'
      ? `The options are: ${question.options.join(' | ')}.\n`
      : '')

  if (mode === 'review') {
    return (
      'You are a supportive math tutor. The exam is over and the student is ' +
      'reviewing their answers, so you may fully explain the complete solution, ' +
      'including the final answer and every step. Be clear and concise.\n\n' +
      base +
      `The correct answer is: ${question.correctAnswer}.`
    )
  }
  // exam in progress
  return (
    'You are a Socratic math tutor. The student is mid-exam. Help them ' +
    'understand the method and give hints, but do NOT give the final answer. ' +
    'Ask guiding questions. Never state the numeric/final result, and never ' +
    'reveal which multiple-choice option is correct. Keep replies to 2–4 ' +
    'sentences.\n\n' +
    base
  )
}

const QUICK_CHIPS = ['Give me a hint', 'Explain the concept', 'Check my approach']

export default function AskAIPanel({ question, mode, theme: t, onClose, reduceMotion, studentAnswer }) {
  const [messages, setMessages] = useState(() => [
    {
      role: 'assistant',
      text:
        mode === 'review'
          ? "The exam's done — ask me to walk through the full solution, or anything you're unsure about."
          : "I'm here to help you think it through. I'll give hints and nudge your method, but I won't hand you the answer. Where are you stuck?",
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  async function send(textArg) {
    const text = (textArg ?? input).trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    const history = [...messages, { role: 'user', text }]
    setMessages([...history, { role: 'assistant', text: '', streaming: true }])

    const controller = new AbortController()
    abortRef.current = controller

    // Include the student's current attempt as context (helps "check my approach").
    const contextNote = studentAnswer
      ? `\n\n(The student's current working/answer so far is: "${studentAnswer}")`
      : ''

    try {
      const reply = await callAnthropic({
        system: systemFor(mode, question) + contextNote,
        messages: history.map((m) => ({ role: m.role, content: m.text })),
        maxTokens: 1000,
        model: MODEL,
        signal: controller.signal,
      })
      await streamReveal(
        reply,
        (partial) =>
          setMessages((prev) => {
            const next = prev.slice()
            next[next.length - 1] = { role: 'assistant', text: partial, streaming: partial.length < reply.length }
            return next
          }),
        { reduceMotion },
      )
    } catch {
      setMessages((prev) => {
        const next = prev.slice()
        next[next.length - 1] = {
          role: 'assistant',
          text:
            "I couldn't reach the AI right now — but you've got this. Try identifying exactly what the question asks, then the rule that applies, and work one step at a time.",
        }
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 70,
          background: 'rgba(5,6,8,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          animation: reduceMotion ? 'none' : 'qgfade .2s ease both',
        }}
      />
      {/* panel */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 71,
          width: 'min(440px, 94vw)',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(16,19,23,0.92)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderLeft: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '-30px 0 90px rgba(0,0,0,0.6)',
          animation: reduceMotion ? 'none' : `qgslide .32s ${t.EASE} both`,
        }}
      >
        {/* header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 11,
              background: `linear-gradient(135deg,${t.accent},${t.accent2})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0B0D10',
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            AI
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>Ask AI about this question</div>
            <div style={{ fontSize: 11.5, color: t.OK, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: t.OK, boxShadow: `0 0 7px ${t.OK}` }} />
              {mode === 'review' ? 'Full explanations on' : 'Hints only · answer hidden'}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.05)',
              color: t.INK,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* question context chip */}
        <div style={{ padding: '14px 20px 0' }}>
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 13.5,
              lineHeight: 1.5,
            }}
          >
            <span style={{ fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(244,246,248,0.4)' }}>
              {question.topic}
            </span>
            <div style={{ marginTop: 6 }}>{question.prompt}</div>
          </div>
        </div>

        {/* messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={
                m.role === 'user'
                  ? {
                      alignSelf: 'flex-end',
                      maxWidth: '82%',
                      padding: '11px 14px',
                      borderRadius: '16px 16px 4px 16px',
                      background: t.hexA(t.accent, 0.16),
                      border: `1px solid ${t.hexA(t.accent, 0.32)}`,
                      fontSize: 14,
                      lineHeight: 1.55,
                    }
                  : {
                      alignSelf: 'flex-start',
                      maxWidth: '88%',
                      padding: '11px 14px',
                      borderRadius: '16px 16px 16px 4px',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${t.hexA(t.accent, 0.22)}`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
                      fontSize: 14,
                      lineHeight: 1.55,
                    }
              }
            >
              {m.text}
              {m.streaming && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 7,
                    height: 15,
                    marginLeft: 2,
                    verticalAlign: '-2px',
                    background: t.accent,
                    animation: reduceMotion ? 'none' : 'qgblink 1s steps(1) infinite',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* composer */}
        <div style={{ padding: '12px 16px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap' }}>
            {QUICK_CHIPS.map((c) => (
              <button
                key={c}
                disabled={busy}
                onClick={() => send(c)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer',
                  fontFamily: "'Manrope',sans-serif",
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(244,246,248,0.7)',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              padding: '7px 7px 7px 15px',
              borderRadius: 15,
              background: 'rgba(12,14,17,0.6)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={mode === 'review' ? 'Ask for the full solution…' : "I don't get how to start…"}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: t.INK,
                fontSize: 14,
                fontFamily: "'Manrope',sans-serif",
              }}
            />
            <button
              onClick={() => send()}
              disabled={busy}
              aria-label="Send"
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                border: 'none',
                cursor: busy ? 'default' : 'pointer',
                background: `linear-gradient(135deg,${t.accent},${t.accent2})`,
                color: '#0B0D10',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                opacity: busy ? 0.6 : 1,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
