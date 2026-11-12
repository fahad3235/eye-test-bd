# Eye Test BD — চোখের পরীক্ষা

Offline, bilingual (EN/বাংলা) vision-screening web app for Bangladesh. Check distance vision (Snellen), near vision and astigmatism at home, save results per eye, and keep a history — no account, no network, no data leaves the browser.

**Live site:** https://fahad3235.github.io/eye-test-bd/
**Status:** Published & verified (run #315, 2026-11-12).

## Problem

A proper eye examination needs a clinic visit, but many people in Bangladesh only discover reduced vision when it already affects school, work or driving. A free, offline screening tool that runs on any phone can flag reduced vision early and tell the user plainly when to see an eye doctor.

## Features

1. **Screen calibration** — drag a slider until an on-screen bar matches a real bank card (85.6 mm), so letter sizes are true to size. A default size is available if calibration is skipped (labelled less accurate).
2. **Distance vision (Snellen)** — 8 lines from 20/200 down to 20/20 at 2, 3 or 4 metres, per eye (left / right / both). One Sloan letter per line; tap the letter you see. Result as a Snellen fraction (e.g. 20/50) with a plain-language band (Excellent / Good / Fair / Reduced).
3. **Near vision** — four print sizes at normal reading distance (~40 cm); tap the smallest line you can read comfortably.
4. **Astigmatism check** — a 12-line radial dial; report whether all lines look equally sharp or some look darker, and in which direction.
5. **Results dashboard & history** — latest result per eye, full history table, per-record delete.
6. **Data tools** — JSON export / strict import (wrong app, bad version, bad records all rejected with data intact) and typed-DELETE erase-all.
7. **Bilingual** — full EN/বাংলা toggle, persisted, with Bengali digits; 390 px mobile layout with no horizontal overflow.

## How the sizes are computed

A 20/20 optotype subtends 5 arc-minutes at the test distance:

```
letterHeight = distance × tan(5′) × (denominator / 20)
```

At 3 m, a 20/20 letter is 4.36 mm tall; a 20/200 letter is 43.6 mm. Font size is derived from the calibrated pixels-per-mm (cap height ≈ 0.72 × font size). This is a **screening approximation** — see Limitations.

## Stack

- Pure static site: HTML + CSS + vanilla JavaScript (no framework, no build step, zero network requests at runtime).
- Persistence: `localStorage` only.
- Tests: Node unit tests (no dependencies) + headless-Chrome smoke tests via raw CDP.

## Prerequisites

Any modern browser. For tests: Node.js 18+ and a headless Chromium (`headless_shell` from the Playwright cache works).

## Install & run

```bash
# just open it — no build step
open index.html
# or serve it
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Dev commands

```bash
node tests/logic.test.js   # 93 unit checks (Snellen math, session flow, import validation, i18n)
node tests/smoke.js        # 55 headless-Chrome checks (calibration, full test flows, BN toggle, 390px)
```

## Environment

None. No API keys, no backend, no environment variables.

## Testing

See [TEST_RESULTS.md](TEST_RESULTS.md). Hand-verified values: 20/20 at 3 m = 4.363 mm, 20/200 at 3 m = 43.63 mm, 20/20 at 2 m = 2.909 mm; full 8-line pass yields 20/20; a wrong answer on line 2 stops at 20/200; 10 malformed imports rejected; BN toggle persists across reload; 390 px no-overflow on all 4 tabs; 0 console/page errors.

## Deployment

GitHub Pages (main branch, root). Static files only.

## Limitations (read before relying on it)

- **Screening only — not a medical diagnosis.** This app cannot diagnose refractive error, cataract, glaucoma or any eye disease.
- Letter sizes depend on your calibration, the exact test distance, screen quality and lighting. An uncalibrated run uses the CSS reference density (96 px/inch), which can be off by 10–30% on real screens.
- Each Snellen line uses **one letter** (a screening simplification); a clinical chart uses several letters per line and a majority-correct rule.
- Near-vision sizes are labelled print sizes at ~40 cm, not standardised Jaeger values.
- The astigmatism dial can only suggest astigmatism; only a refraction test confirms it.
- If you notice sudden vision loss, flashes, a shower of floaters, eye pain, or straight lines looking wavy, see an eye doctor urgently — do not wait for an app result.

## Licence

MIT — see the repository. Built by the Muse Project Factory (run #315).
