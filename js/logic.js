// eye-test-bd -- pure logic (no DOM). Node-testable: node tests/logic.test.js
// Snellen acuity math: a 20/20 optotype subtends 5 arc-minutes at the test
// distance. letterHeightMm(den, distM) = distM * tan(5') * den/20.
// Cap-height rendering: font-size = heightPx / CAP_RATIO (system sans
// cap height is ~0.72 of font-size). This is a SCREENING approximation,
// not a clinical measurement -- see README limitations.
(function (root) {
  'use strict';

  var TAN_5MIN = Math.tan((5 / 60) * Math.PI / 180); // ~0.0014544
  var CAP_RATIO = 0.72;
  var CARD_MM = 85.6; // standard credit/debit card width, for calibration
  var DEFAULT_PX_PER_MM = 96 / 25.4; // CSS reference pixel density
  var SLOAN = ['C', 'D', 'E', 'F', 'L', 'N', 'O', 'P', 'T', 'Z'];
  var SNELLEN = [200, 100, 70, 50, 40, 30, 25, 20];
  var DISTANCES_M = [2, 3, 4];
  var NEAR_LEVELS = [
    { id: 'L', px: 28, en: 'Large print', bn: '\u09ac\u09a1\u09bc \u0985\u0995\u09cd\u09b7\u09b0' },
    { id: 'M', px: 20, en: 'Medium print', bn: '\u09ae\u09be\u099d\u09be\u09b0\u09bf \u0985\u0995\u09cd\u09b7\u09b0' },
    { id: 'S', px: 14, en: 'Small print', bn: '\u099b\u09cb\u099f \u0985\u0995\u09cd\u09b7\u09b0' },
    { id: 'XS', px: 10, en: 'Very small print', bn: '\u0996\u09c1\u09ac \u099b\u09cb\u099f \u0985\u0995\u09cd\u09b7\u09b0' }
  ];
  var EYES = ['left', 'right', 'both'];

  function letterHeightMm(den, distM) {
    return distM * 1000 * TAN_5MIN * (den / 20);
  }
  function letterHeightPx(den, distM, pxPerMm) {
    return letterHeightMm(den, distM) * pxPerMm;
  }
  function fontSizePx(den, distM, pxPerMm) {
    return letterHeightPx(den, distM, pxPerMm) / CAP_RATIO;
  }
  function pxPerMmFromCard(barPx) {
    return barPx / CARD_MM;
  }
  function acuityLabel(den) {
    if (den === null || den === undefined) return 'below 20/200';
    return '20/' + den;
  }
  function acuityBand(den) {
    if (den === null || den === undefined) return 'reduced';
    if (den <= 20) return 'excellent';
    if (den <= 30) return 'good';
    if (den <= 50) return 'fair';
    return 'reduced';
  }

  // ---- Acuity session state machine ----
  // One letter per line (single-letter screening approximation). A correct
  // answer advances to the next smaller line; a wrong answer (or "can't
  // see it") ends the test at the last passed line.
  function newAcuitySession(eye, distM, pxPerMm) {
    return {
      eye: eye, distM: distM, pxPerMm: pxPerMm,
      lineIdx: 0, passedDen: null, finished: false,
      trials: 0, correct: 0, current: null
    };
  }
  function pickLetter(rng) {
    return SLOAN[Math.floor(rng() * SLOAN.length)];
  }
  function makeOptions(letter, rng) {
    var opts = [letter];
    var guard = 0;
    while (opts.length < 4 && guard++ < 100) {
      var c = pickLetter(rng);
      if (opts.indexOf(c) === -1) opts.push(c);
    }
    // Fisher-Yates shuffle with injected rng
    for (var i = opts.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = opts[i]; opts[i] = opts[j]; opts[j] = t;
    }
    return opts;
  }
  function nextTrial(session, rng) {
    if (session.finished) return null;
    rng = rng || Math.random;
    var den = SNELLEN[session.lineIdx];
    var letter = pickLetter(rng);
    var trial = {
      den: den,
      lineNo: session.lineIdx + 1,
      lineCount: SNELLEN.length,
      letter: letter,
      options: makeOptions(letter, rng),
      heightPx: letterHeightPx(den, session.distM, session.pxPerMm),
      fontPx: fontSizePx(den, session.distM, session.pxPerMm)
    };
    session.current = trial;
    return trial;
  }
  function answerTrial(session, choice) {
    if (session.finished || !session.current) return null;
    session.trials++;
    var ok = choice === session.current.letter;
    if (ok) {
      session.correct++;
      session.passedDen = session.current.den;
      session.lineIdx++;
      if (session.lineIdx >= SNELLEN.length) session.finished = true;
    } else {
      session.finished = true;
    }
    var res = { correct: ok, finished: session.finished, passedDen: session.passedDen };
    session.current = null;
    return res;
  }
  function acuityResult(session) {
    return {
      kind: 'acuity',
      eye: session.eye,
      den: session.passedDen,
      label: acuityLabel(session.passedDen),
      band: acuityBand(session.passedDen),
      distM: session.distM,
      calibrated: session.pxPerMm !== DEFAULT_PX_PER_MM,
      trials: session.trials,
      correct: session.correct
    };
  }

  // ---- Near vision ----
  function nearResult(eye, levelId) {
    var lv = null;
    NEAR_LEVELS.forEach(function (l) { if (l.id === levelId) lv = l; });
    if (!lv) return null;
    return { kind: 'near', eye: eye, level: lv.id, px: lv.px, labelEn: lv.en, labelBn: lv.bn };
  }

  // ---- Astigmatism ----
  function astigResult(eye, uniform, darkerDir) {
    if (typeof uniform !== 'boolean') return null;
    if (!uniform && ['vertical', 'horizontal', 'diagonal'].indexOf(darkerDir) === -1) return null;
    return { kind: 'astig', eye: eye, uniform: uniform, darker: uniform ? null : darkerDir };
  }

  // ---- Records / store ----
  function newRecordId() {
    return 'r' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }
  function makeRecord(base) {
    var r = { id: newRecordId(), date: new Date().toISOString().slice(0, 10) };
    for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) r[k] = base[k];
    return r;
  }
  function isValidEye(e) { return EYES.indexOf(e) !== -1; }
  function validateRecord(r) {
    if (!r || typeof r !== 'object') return 'notObject';
    if (typeof r.id !== 'string' || !r.id) return 'badId';
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return 'badDate';
    if (!isValidEye(r.eye)) return 'badEye';
    if (r.kind === 'acuity') {
      if (r.den !== null && SNELLEN.indexOf(r.den) === -1) return 'badDen';
      if (typeof r.label !== 'string' || !r.label) return 'badLabel';
      if (['excellent', 'good', 'fair', 'reduced'].indexOf(r.band) === -1) return 'badBand';
      if (DISTANCES_M.indexOf(r.distM) === -1) return 'badDist';
      if (typeof r.calibrated !== 'boolean') return 'badCalibrated';
    } else if (r.kind === 'near') {
      if (NEAR_LEVELS.map(function (l) { return l.id; }).indexOf(r.level) === -1) return 'badLevel';
    } else if (r.kind === 'astig') {
      if (typeof r.uniform !== 'boolean') return 'badUniform';
      if (!r.uniform && ['vertical', 'horizontal', 'diagonal'].indexOf(r.darker) === -1) return 'badDarker';
    } else {
      return 'badKind';
    }
    return null;
  }
  function validateImport(data) {
    if (!data || typeof data !== 'object') return { ok: false, error: 'notObject' };
    if (data.app !== 'eye-test-bd') return { ok: false, error: 'wrongApp' };
    if (data.version !== 1) return { ok: false, error: 'badVersion' };
    if (!Array.isArray(data.records)) return { ok: false, error: 'badRecords' };
    var ids = {};
    for (var i = 0; i < data.records.length; i++) {
      var err = validateRecord(data.records[i]);
      if (err) return { ok: false, error: err + '@' + i };
      if (ids[data.records[i].id]) return { ok: false, error: 'dupId@' + i };
      ids[data.records[i].id] = true;
    }
    if (data.settings !== undefined) {
      if (typeof data.settings !== 'object') return { ok: false, error: 'badSettings' };
      if (data.settings.lang !== undefined && ['en', 'bn'].indexOf(data.settings.lang) === -1)
        return { ok: false, error: 'badLang' };
    }
    return { ok: true, data: data };
  }
  function exportPayload(records, settings) {
    return { app: 'eye-test-bd', version: 1, exported: new Date().toISOString().slice(0, 10), records: records, settings: settings || {} };
  }
  function latestByEyeKind(records, eye, kind) {
    var best = null;
    records.forEach(function (r) {
      if (r.eye === eye && r.kind === kind) {
        if (!best || r.date >= best.date) best = r;
      }
    });
    return best;
  }
  function dashboard(records) {
    var total = records.length;
    var acuity = records.filter(function (r) { return r.kind === 'acuity'; }).length;
    var reduced = records.filter(function (r) {
      return r.kind === 'acuity' && (r.den === null || r.den > 50);
    }).length;
    return {
      total: total,
      acuityTests: acuity,
      reducedCount: reduced,
      latestLeft: latestByEyeKind(records, 'left', 'acuity'),
      latestRight: latestByEyeKind(records, 'right', 'acuity'),
      latestNearLeft: latestByEyeKind(records, 'left', 'near'),
      latestNearRight: latestByEyeKind(records, 'right', 'near'),
      latestAstigLeft: latestByEyeKind(records, 'left', 'astig'),
      latestAstigRight: latestByEyeKind(records, 'right', 'astig')
    };
  }

  // ---- Formatting ----
  var BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
  function toBn(s) {
    return String(s).replace(/[0-9]/g, function (d) { return BN_DIGITS[+d]; });
  }
  function fmtNum(n, lang) {
    var s = String(n);
    return lang === 'bn' ? toBn(s) : s;
  }
  function fmtDate(iso, lang) {
    if (lang === 'bn') return toBn(iso);
    return iso;
  }

  var api = {
    TAN_5MIN: TAN_5MIN, CAP_RATIO: CAP_RATIO, CARD_MM: CARD_MM,
    DEFAULT_PX_PER_MM: DEFAULT_PX_PER_MM, SLOAN: SLOAN, SNELLEN: SNELLEN,
    DISTANCES_M: DISTANCES_M, NEAR_LEVELS: NEAR_LEVELS, EYES: EYES,
    letterHeightMm: letterHeightMm, letterHeightPx: letterHeightPx,
    fontSizePx: fontSizePx, pxPerMmFromCard: pxPerMmFromCard,
    acuityLabel: acuityLabel, acuityBand: acuityBand,
    newAcuitySession: newAcuitySession, nextTrial: nextTrial,
    answerTrial: answerTrial, acuityResult: acuityResult,
    nearResult: nearResult, astigResult: astigResult,
    makeRecord: makeRecord, validateRecord: validateRecord,
    validateImport: validateImport, exportPayload: exportPayload,
    latestByEyeKind: latestByEyeKind, dashboard: dashboard,
    toBn: toBn, fmtNum: fmtNum, fmtDate: fmtDate
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EyeTestLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
