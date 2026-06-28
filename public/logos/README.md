# School logos

Drop the brand artwork here and it appears automatically in the top bar, the
left sidebar, and the exam intro / results — switching with the BGA / BIST
toggle. No code changes needed; the app picks the first file it finds.

## Filenames (exact)

| File | Used for | Notes |
| --- | --- | --- |
| `bist.svg` or `bist.png` | BIST wordmark | top bar + exam screens |
| `bga.svg`  or `bga.png`  | BGA wordmark  | top bar + exam screens |
| `bist-mark.svg` / `.png` | BIST sidebar mark | optional, square crest |
| `bga-mark.svg`  / `.png` | BGA sidebar mark  | optional, square mark |

- SVG preferred; transparent PNG is fine.
- The wordmark sits on a dark plaque, so a **white** logo (BGA) is visible in
  both light and dark mode — no separate light/dark versions needed.
- If a mark file is absent, the sidebar keeps the lettered BGA/BIST square.
- If a wordmark file is absent, the top bar simply omits the logo (no breakage).

## How to add them on GitHub (no local setup)

1. Open the repo → `public/logos/` → **Add file → Upload files**.
2. Upload `bist.png` and `bga.png` (and optionally the `-mark` versions).
3. Commit to the default branch (`claude/sleepy-gates-oa3w3f`).
4. The Pages deploy workflow rebuilds and the logos go live.
