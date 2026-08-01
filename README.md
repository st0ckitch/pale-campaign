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

## Hosting on Vercel + Supabase (recommended)

The repo is set up for a zero-server-management deployment:

- **Vercel** builds and serves the app on every push to `main` (auto-detected
  Vite project — no config needed).
- **Supabase** runs the backend: the Edge Function in
  `supabase/functions/api/index.ts` (same API as the Node server below) with
  the project's Postgres as storage and the Anthropic key in Supabase secrets.

One-time Supabase setup:

1. **Settings → Integrations → GitHub**: connect the repo, working directory
   `.`, production branch **`main`**, "Deploy to production" on. Pushes to
   main then apply `supabase/migrations/` (the tables) automatically.
   *(No integration? Paste `supabase/migrations/20260801000000_init.sql` into
   SQL Editor → Run instead.)*
2. **Edge Functions → Secrets** → add `ANTHROPIC_API_KEY` and `TEACHER_KEY`
   (optionally `TEACHER_KEY_BGA` / `TEACHER_KEY_BIST` for separate keys).
3. Deploy the function if the integration hasn't already: **Edge Functions →
   Deploy a new function** → name it exactly `api`, paste the contents of
   `supabase/functions/api/index.ts`, deploy — then in the function's settings
   turn **Verify JWT off** (the app has its own auth: teacher tokens + class
   codes).
   *(CLI alternative: `npx supabase link && npx supabase functions deploy api`.)*
4. Copy the base URL `https://<project-ref>.supabase.co/functions/v1` and set
   it as the `VITE_API_BASE` environment variable in Vercel
   (Project → Settings → Environment Variables), then redeploy.
   For GitHub Pages, set the same value as a repository **variable** named
   `VITE_API_BASE` (Settings → Secrets and variables → Actions → Variables).

Quick check: `https://<project-ref>.supabase.co/functions/v1/api/health`
should return `{"ok":true,...,"ai":true}`.

## School server (self-hosted Node alternative)

Static hosting keeps everything in one browser. The optional backend in
`server/index.mjs` (zero dependencies, Node 18+) turns the app into a real
multi-device school deployment:

- **AI for everyone** — the Anthropic key lives on the server (`/api/anthropic`
  proxy, rate-limited); students never paste keys.
- **Teacher sign-in** — the Teacher tab is gated behind a per-school access key.
- **Class join codes** — a teacher creates a class, students join once with the
  6-character code + their name.
- **Synced content** — published exams and announcements reach every student
  device; submitted attempts flow back into the teacher's moderation queue and
  class insights, no matter where the student sat the exam.

```bash
npm run build
ANTHROPIC_API_KEY=sk-ant-... TEACHER_KEY=choose-a-secret node server/index.mjs
# → serves the app + API on http://localhost:8787
```

Deploy the same thing to any Node host (Railway, Render, Fly, a school
machine). Env vars: `PORT`, `ANTHROPIC_API_KEY`, `TEACHER_KEY` (or per-school
`TEACHER_KEY_BGA` / `TEACHER_KEY_BIST`), `DATA_FILE` (persistence path — put it
on a persistent volume), `ALLOWED_ORIGIN` (for split hosting).

**Split hosting:** keep the UI on GitHub Pages and point it at the backend by
building with `VITE_API_BASE=https://your-backend.example.com`. Without a
reachable backend the app automatically runs in the original local mode, so
the Pages deployment keeps working either way.

For full-stack local development: `npm run server` in one terminal, and
`BACKEND_URL=http://localhost:8787 npm run dev` in another.

> Storage is a single JSON file and teacher auth is a shared access key —
> deliberately simple pilot infrastructure for a two-school deployment, not
> yet a hardened multi-tenant service. Attempts are capped at 400 per school.

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
