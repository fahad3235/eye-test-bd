# TEST_RESULTS.md — eye-test-bd (factory run #315, 2026-11-12 15:00 +06)

## Unit tests — `node tests/logic.test.js`
**93/93 checks passed, 0 failures.**

Hand-verified Snellen math (5 arc-minutes: tan(5′) = 0.0014544):
- 20/20 letter height at 3 m = **4.363 mm**; 20/200 at 3 m = **43.63 mm**; 20/20 at 2 m = **2.909 mm**; 20/100 at 4 m = **29.09 mm**
- Height scales linearly with denominator (100/20 = 5×) and with distance (4 m / 2 m = 2×)
- Default density 96/25.4 = 3.7795 px/mm; card calibration 324 px / 85.6 mm = 3.785 px/mm
- Band map: 20 → excellent, 30 → good, 50 → fair, 100 / null → reduced

Session flow (deterministic injected rng):
- All-correct session: 8 trials, options always contain the shown letter + 3 distinct distractors, ends 20/20, band excellent, calibrated=false at default density
- Wrong answer on line 2: finishes, keeps 20/200, band reduced, calibrated=true at 5 px/mm; `nextTrial` after finish returns null
- "Can't see it" (null choice): finishes with no pass, label "below 20/200"
- Near levels 28/20/14/10 px; bad level → null; astigmatism uniform/darker/direction validation (bad direction → null)
- Records: 10 `validateRecord` rejections (bad id/date/eye/den/band/dist/kind/level/uniform); export round-trip accepted; 10 malformed imports rejected (null, number, wrong app, bad version, non-array records, bad den, duplicate id, bad lang)
- Dashboard: totals (5 records, 3 acuity, 1 reduced), latest-per-eye by date (left 20/20 over older 20/30; right 20/100), latest near/astig found
- Formatting: `toBn('20/200')` = ২০/২০০; i18n completeness — all 100 keys present in both EN and BN, BN differs from EN

## Smoke tests — `node tests/smoke.js` (raw CDP, headless_shell-1187, file://)
**55/55 checks passed, 0 console/page errors.**

- Load: title "Eye Test BD", 4 tabs, calibration bar 324 px wide, px/mm 3.78, 20/20 height 4.4 mm at 3 m, astigmatism fan 12 lines + circle, 4 near rows, guide 5 + 5 items
- Calibration: slider 400 → px/mm 4.67 + "Calibrated"; Use default → back to 3.78
- Acuity all-correct: Line 1 of 8, first letter font >150 px, 4 options, 8/8 correct → result 20/20, band Excellent, save → 1 record
- Acuity wrong on line 2: ends at 20/200, band Reduced, save → 2 records
- Near vision: XS level → result shown, save → 3 records
- Astigmatism: "same" → uniform result, save → 4 records; "darker" → direction row appears, vertical → astigmatism result text
- Results tab: 4 history rows; dashboard latest left = 20/200; delete → 3 rows
- Import validation in-page: own records accepted, wrong app rejected
- Erase guard: "WRONG" keeps 3 records; "DELETE" erases all → 0 records
- Language: BN toggle → Bengali title (চোখের পরীক্ষা বিডি), BN digits in calibration (৪.৪); persists after reload; back to EN
- Mobile 390 px: no horizontal overflow (scrollWidth ≤ 390) on all 4 tabs

## Repairs
0 app bugs. (One pre-test hygiene fix: replaced literal em-dash/en-dash/middle-dot characters in JS/HTML sources with \uXXXX escapes to keep all app sources pure ASCII; verified with `grep -P '[^\x00-\x7F]'` — clean.)

## Known limitations (also in README)
- Single-letter-per-line Snellen screening (clinical charts use several letters per line).
- Accuracy depends on card calibration + exact test distance + lighting; uncalibrated runs can be off by 10–30%.
- Near-vision sizes are labelled print sizes at ~40 cm, not standardised Jaeger values.
- Screening only — not a diagnosis; red-flag symptoms listed in the Guide tab.
