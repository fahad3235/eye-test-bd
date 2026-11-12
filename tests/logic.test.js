// eye-test-bd -- node unit tests for js/logic.js + js/i18n.js (no DOM).
// Usage: node tests/logic.test.js   (exit 0 = all green)
const L = require('../js/logic.js');
const I18n = require('../js/i18n.js');
let count = 0, failures = 0;
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
function close(a, b, eps) { return Math.abs(a - b) <= eps; }
// Deterministic rng: cycles 0.05, 0.15, ... 0.95
function makeRng() {
  let i = 0;
  return function () { const v = 0.05 + (i % 10) * 0.1; i++; return v; };
}

// ---- Snellen math (hand-verified) ----
// tan(5 arc-min) = 0.0014544; 20/20 at 3 m = 3000 * 0.0014544 = 4.363 mm
check('tan(5 arc-min) ~ 0.0014544', close(L.TAN_5MIN, 0.0014544, 0.0000005), String(L.TAN_5MIN));
check('20/20 letter height at 3m = 4.363mm', close(L.letterHeightMm(20, 3), 4.363, 0.005), String(L.letterHeightMm(20, 3)));
check('20/200 letter height at 3m = 43.63mm', close(L.letterHeightMm(200, 3), 43.63, 0.05), String(L.letterHeightMm(200, 3)));
check('20/20 letter height at 2m = 2.909mm', close(L.letterHeightMm(20, 2), 2.909, 0.005), String(L.letterHeightMm(20, 2)));
check('20/100 at 4m = 29.09mm', close(L.letterHeightMm(100, 4), 29.09, 0.05), String(L.letterHeightMm(100, 4)));
check('height scales linearly with denominator', close(L.letterHeightMm(100, 3) / L.letterHeightMm(20, 3), 5, 0.001));
check('height scales linearly with distance', close(L.letterHeightMm(20, 4) / L.letterHeightMm(20, 2), 2, 0.001));
check('letterHeightPx uses px/mm', close(L.letterHeightPx(20, 3, 4), L.letterHeightMm(20, 3) * 4, 0.001));
check('fontSizePx = heightPx / 0.72', close(L.fontSizePx(20, 3, 4), L.letterHeightPx(20, 3, 4) / 0.72, 0.001));
check('default px/mm = 96/25.4', close(L.DEFAULT_PX_PER_MM, 96 / 25.4, 0.0001));
check('card 324px -> 3.785 px/mm', close(L.pxPerMmFromCard(324), 324 / 85.6, 0.001));
check('card 85.6px -> 1.0 px/mm', close(L.pxPerMmFromCard(85.6), 1, 0.001));
check('SNELLEN lines are 8, descending', L.SNELLEN.length === 8 && L.SNELLEN[0] === 200 && L.SNELLEN[7] === 20);
check('Sloan letters are 10, no duplicates', L.SLOAN.length === 10 && new Set(L.SLOAN).size === 10);
check('acuityLabel 20 -> 20/20', L.acuityLabel(20) === '20/20');
check('acuityLabel null -> below 20/200', L.acuityLabel(null) === 'below 20/200');
check('band 20 excellent / 30 good / 50 fair / 100 reduced / null reduced',
  L.acuityBand(20) === 'excellent' && L.acuityBand(30) === 'good' &&
  L.acuityBand(50) === 'fair' && L.acuityBand(100) === 'reduced' && L.acuityBand(null) === 'reduced');

// ---- Acuity session flow ----
(function () {
  const s = L.newAcuitySession('left', 3, L.DEFAULT_PX_PER_MM);
  const rng = makeRng();
  let trials = 0;
  while (!s.finished) {
    const tr = L.nextTrial(s, rng);
    check('trial ' + (trials + 1) + ' den matches SNELLEN order', tr.den === L.SNELLEN[trials], 'got ' + tr.den);
    check('trial options include the letter, 4 distinct', tr.options.length === 4 &&
      tr.options.indexOf(tr.letter) !== -1 && new Set(tr.options).size === 4);
    check('trial heightPx matches formula', close(tr.heightPx, L.letterHeightPx(tr.den, 3, L.DEFAULT_PX_PER_MM), 0.001));
    const res = L.answerTrial(s, tr.letter);
    trials++;
    if (trials > 12) break;
  }
  check('all-correct session runs 8 trials', trials === 8, 'got ' + trials);
  check('all-correct session passes 20/20', s.passedDen === 20);
  const r = L.acuityResult(s);
  check('result label 20/20, band excellent', r.label === '20/20' && r.band === 'excellent');
  check('result is uncalibrated at default density', r.calibrated === false);
  check('result trials=8 correct=8', r.trials === 8 && r.correct === 8);
})();
(function () {
  const s = L.newAcuitySession('right', 2, 5);
  const rng = makeRng();
  const tr1 = L.nextTrial(s, rng);
  const r1 = L.answerTrial(s, tr1.letter); // pass 20/200
  check('pass first line, not finished', r1.correct === true && r1.finished === false && r1.passedDen === 200);
  const tr2 = L.nextTrial(s, rng);
  const wrong = tr2.options.find(function (o) { return o !== tr2.letter; });
  const r2 = L.answerTrial(s, wrong);
  check('wrong on 2nd line finishes, keeps 20/200', r2.correct === false && r2.finished === true && r2.passedDen === 200);
  const r = L.acuityResult(s);
  check('result label 20/200 band reduced', r.label === '20/200' && r.band === 'reduced');
  check('result calibrated at 5 px/mm', r.calibrated === true);
  check('nextTrial after finish returns null', L.nextTrial(s, rng) === null);
})();
(function () {
  const s = L.newAcuitySession('both', 4, L.DEFAULT_PX_PER_MM);
  const rng = makeRng();
  L.nextTrial(s, rng);
  const r = L.answerTrial(s, null); // "can't see it"
  check('cannot-see ends test with no pass', r.finished === true && r.passedDen === null);
  check('result label below 20/200', L.acuityResult(s).label === 'below 20/200');
})();

// ---- Near vision / astigmatism ----
check('near levels are 4, px descending 28/20/14/10',
  L.NEAR_LEVELS.length === 4 && L.NEAR_LEVELS.map(function (l) { return l.px; }).join(',') === '28,20,14,10');
check('nearResult S -> 14px', (function () { const r = L.nearResult('left', 'S'); return r && r.px === 14 && r.level === 'S'; })());
check('nearResult bad level -> null', L.nearResult('left', 'XX') === null);
check('astig uniform true', (function () { const r = L.astigResult('right', true, null); return r && r.uniform === true && r.darker === null; })());
check('astig darker vertical', (function () { const r = L.astigResult('right', false, 'vertical'); return r && r.uniform === false && r.darker === 'vertical'; })());
check('astig darker without direction -> null', L.astigResult('right', false, null) === null);
check('astig bad direction -> null', L.astigResult('right', false, 'sideways') === null);

// ---- Records / import / dashboard ----
function goodAcuity(eye, den) {
  return L.makeRecord({ kind: 'acuity', eye: eye, den: den, label: '20/' + den, band: 'good', distM: 3, calibrated: true, trials: 3, correct: 3 });
}
(function () {
  const rec = goodAcuity('left', 30);
  check('makeRecord adds id + date', typeof rec.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.date));
  check('validateRecord accepts good acuity', L.validateRecord(rec) === null);
  const bads = [
    [{}, 'notObject-ish'],
    [{ id: '', date: '2026-11-12', eye: 'left', kind: 'acuity' }, 'badId'],
    [Object.assign({}, rec, { date: '12/11/2026' }), 'badDate'],
    [Object.assign({}, rec, { eye: 'middle' }), 'badEye'],
    [Object.assign({}, rec, { den: 15 }), 'badDen'],
    [Object.assign({}, rec, { band: 'super' }), 'badBand'],
    [Object.assign({}, rec, { distM: 5 }), 'badDist'],
    [Object.assign({}, rec, { kind: 'xray' }), 'badKind'],
    [L.makeRecord({ kind: 'near', eye: 'left', level: 'ZZ', px: 1 }), 'badLevel'],
    [L.makeRecord({ kind: 'astig', eye: 'left', uniform: 'yes' }), 'badUniform']
  ];
  bads.forEach(function (pair, i) {
    check('validateRecord rejects case ' + i + ' (' + pair[1] + ')', L.validateRecord(pair[0]) !== null);
  });
  const payload = L.exportPayload([rec], { lang: 'en' });
  check('export payload app/version/records', payload.app === 'eye-test-bd' && payload.version === 1 && payload.records.length === 1);
  check('validateImport accepts own export', L.validateImport(payload).ok === true);
  const malformed = [
    null, 42, 'x', {}, { app: 'other', version: 1, records: [] },
    { app: 'eye-test-bd', version: 2, records: [] },
    { app: 'eye-test-bd', version: 1, records: 'no' },
    { app: 'eye-test-bd', version: 1, records: [Object.assign({}, rec, { den: 15 })] },
    { app: 'eye-test-bd', version: 1, records: [rec, rec] },
    { app: 'eye-test-bd', version: 1, records: [], settings: { lang: 'fr' } }
  ];
  malformed.forEach(function (m, i) {
    check('validateImport rejects malformed ' + i, L.validateImport(m).ok === false);
  });
  const recs = [goodAcuity('left', 30), goodAcuity('left', 20), goodAcuity('right', 100),
    L.makeRecord({ kind: 'near', eye: 'left', level: 'S', px: 14, labelEn: 'Small print', labelBn: 'x' }),
    L.makeRecord({ kind: 'astig', eye: 'right', uniform: false, darker: 'horizontal' })];
  recs[0].date = '2026-11-10'; recs[1].date = '2026-11-12';
  const d = L.dashboard(recs);
  check('dashboard totals', d.total === 5 && d.acuityTests === 3 && d.reducedCount === 1, JSON.stringify(d));
  check('dashboard latest left acuity is 20/20 (newer date)', d.latestLeft && d.latestLeft.den === 20);
  check('dashboard latest right acuity is 20/100', d.latestRight && d.latestRight.den === 100);
  check('dashboard latest near/astig found', d.latestNearLeft && d.latestNearLeft.level === 'S' && d.latestAstigRight && d.latestAstigRight.darker === 'horizontal');
})();

// ---- Formatting / i18n ----
check('toBn converts digits', L.toBn('20/200') === '\u09e8\u09e6/\u09e8\u09e6\u09e6');
check('fmtNum bn', L.fmtNum(30, 'bn') === '\u09e9\u09e6' && L.fmtNum(30, 'en') === '30');
check('i18n en + bn present for all keys used', (function () {
  const keys = ['appTitle', 'tagline', 'tabTest', 'tabResults', 'tabGuide', 'tabData', 'calTitle', 'calHelp',
    'calBarLabel', 'calUseDefault', 'calPxPerMm', 'calHeight2020', 'calStateCal', 'calStateDefault', 'distLabel',
    'eyeLabel', 'eyeLeft', 'eyeRight', 'eyeBoth', 'acuityTitle', 'acuityHelp', 'startAcuity', 'lineOf', 'of',
    'pickLetter', 'cantSee', 'acuityDone', 'yourResult', 'bandExcellent', 'bandGood', 'bandFair', 'bandReduced',
    'saveResult', 'saved', 'nearTitle', 'nearHelp', 'nearPick', 'nearDone', 'astigTitle', 'astigHelp', 'astigSame',
    'astigDarker', 'astigDirLabel', 'astigDirV', 'astigDirH', 'astigDirD', 'astigDone', 'astigUniformYes',
    'astigUniformNo', 'resultsTitle', 'noResults', 'latestTitle', 'historyTitle', 'colDate', 'colEye', 'colTest',
    'colResult', 'kindAcuity', 'kindNear', 'kindAstig', 'deleteBtn', 'deleted', 'exportBtn', 'importBtn',
    'importFile', 'importOk', 'importBad', 'eraseBtn', 'eraseHelp', 'eraseDone', 'eraseWrong', 'guideTitle',
    'guideIntro', 'guideStepsTitle', 'guideStep1', 'guideStep2', 'guideStep3', 'guideStep4', 'guideStep5',
    'guideRedTitle', 'guideRed1', 'guideRed2', 'guideRed3', 'guideRed4', 'guideRed5', 'disclaimer', 'footerNote',
    'bothEyesNote', 'leftEyeNote', 'rightEyeNote', 'needCalFirst', 'testRunning', 'restartBtn'];
  return keys.every(function (k) {
    return typeof I18n.t('en', k) === 'string' && I18n.t('en', k).length > 0 &&
      typeof I18n.t('bn', k) === 'string' && I18n.t('bn', k).length > 0 && I18n.t('bn', k) !== k;
  });
})());
check('i18n fallback returns en for unknown lang', I18n.t('xx', 'tabTest') === 'Test');
check('i18n bn title differs from en', I18n.t('bn', 'appTitle') !== I18n.t('en', 'appTitle'));

console.log('\n' + count + ' checks, ' + failures + ' failures');
process.exit(failures ? 1 : 0);
