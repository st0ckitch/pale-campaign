# Learning Hub — BGA × BIST

A dark, glassmorphic learning dashboard with a **working, AI-graded Math Exam
Simulator**. Built with React + Vite. The exam module is the live feature:
10 mixed questions → ask the AI for hints mid-exam (answer withheld) → submit →
get AI-graded results with equivalence-aware checking, a per-topic breakdown,
and full worked solutions.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
```

The app opens straight on the **Exams** tab. It works fully **without** an API
key — multiple-choice grades deterministically, written answers fall back to
local equivalence checking, and the tutor shows a friendly offline message.

### Enable AI grading + the tutor

The Anthropic API key is **never** in the client code. A small Vite middleware
(`/api/anthropic` in `vite.config.js`) injects it server-side and forwards the
request, which also avoids browser CORS. Provide the key via the environment:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run dev
```

The model is set in one place — `src/lib/config.js` (`MODEL = 'claude-opus-4-8'`).

```bash
npm run build && npm run preview   # production build, same proxy
```

## How grading works (the critical part)

| Layer | What it does | When |
|------|---------------|------|
| **MCQ** | Deterministic compare to `correctAnswer` | Always |
| **Layer 1 — local** | Normalizes input (trim, case, units, `x=3`↔`x = 3`) and checks numeric equivalence (`0.5` = `1/2` = `.5`, `3/4` = `0.75`) against `acceptedAnswers[]` | Always |
| **Layer 2 — AI** | Sends prompt + correct answer + student answer to Claude, which returns strict JSON (`correct`, `equivalent`, `score`, `feedback`, `errorStep`). Parsed defensively (strips fences/prose); falls back to Layer 1 on any failure | Written answers, when a key is set and Layer 1 is uncertain |

`src/lib/grading.js` is pure and unit-testable; `checkLocally()` and
`parseGraderJSON()` have no DOM/React dependencies.

## Exam integrity

The in-exam **Ask AI** panel is Socratic while the exam is in progress — it
gives hints and guides method but **never reveals the final answer or which MCQ
option is correct**. After submission, review mode relaxes this so it can fully
explain solutions. (See `systemFor()` in `src/exam/AskAIPanel.jsx`.)

## Project layout

```
index.html                fonts, KaTeX CDN, keyframes, reduced-motion
vite.config.js            React plugin + Anthropic key-injecting proxy
src/
  App.jsx                 dashboard shell: rail, topbar, brand switch, tabs
  theme.js                design tokens lifted from the reference
  lib/
    config.js             MODEL + endpoint
    anthropic.js          fetch wrapper + typewriter reveal
    grading.js            Layer 1 equivalence + Layer 2 AI grading
    useReducedMotion.js
  data/examQuestions.js   10 IGCSE/GCSE seed questions
  components/MathText.jsx  KaTeX with plain-text fallback
  exam/
    ExamModule.jsx        intro → active → grading shimmer → results
    AskAIPanel.jsx        question-scoped tutor (integrity-aware)
```

## Deploy to GitHub Pages

`.github/workflows/deploy-pages.yml` builds the app and deploys it on every push
to `main`. It auto-enables Pages (`actions/configure-pages` with
`enablement: true`) and serves from `/<repo-name>/` (the workflow sets
`VITE_BASE`). In the repo settings, **Settings → Pages → Build and deployment →
Source** should be **GitHub Actions** (the workflow sets this automatically).

> **Caveat:** GitHub Pages is static hosting, so the `/api/anthropic` proxy
> doesn't exist there. The exam still works end to end — MCQ + local
> equivalence grading — but **AI grading and the tutor run in offline-fallback
> mode** on Pages, because there's no server to inject the API key. For the live
> AI path, run it on a host that executes `vite.config.js` (e.g. `npm run dev`
> with `ANTHROPIC_API_KEY` set, or any Node host).

## Notes

- React state only — no `localStorage` / `sessionStorage`.
- All API calls are wrapped in `try/catch` and degrade gracefully.
- Respects `prefers-reduced-motion`.
- Math renders via KaTeX (CDN); if the CDN is unreachable it falls back to
  legible unicode/plain text automatically.
