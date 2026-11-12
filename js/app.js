// eye-test-bd -- DOM wiring. Pure ASCII (Bengali via i18n \uXXXX escapes).
(function () {
  'use strict';
  var L = window.EyeTestLogic;
  var I18n = window.EyeTestI18n;
  var STORE_KEY = 'eye-test-bd:v1';

  function t(key) { return I18n.t(state.settings.lang, key); }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  var state = {
    settings: { lang: 'en', pxPerMm: L.DEFAULT_PX_PER_MM, calibrated: false, distM: 3, eye: 'left' },
    records: [],
    session: null,
    pendingNear: null,
    pendingAstig: null,
    lastAcuity: null
  };

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && data.settings) {
        if (data.settings.lang === 'bn' || data.settings.lang === 'en') state.settings.lang = data.settings.lang;
        if (typeof data.settings.pxPerMm === 'number' && data.settings.pxPerMm > 0) state.settings.pxPerMm = data.settings.pxPerMm;
        if (typeof data.settings.calibrated === 'boolean') state.settings.calibrated = data.settings.calibrated;
        if (L.DISTANCES_M.indexOf(data.settings.distM) !== -1) state.settings.distM = data.settings.distM;
        if (L.EYES.indexOf(data.settings.eye) !== -1) state.settings.eye = data.settings.eye;
      }
      if (data && Array.isArray(data.records)) {
        state.records = data.records.filter(function (r) { return L.validateRecord(r) === null; });
      }
    } catch (e) { /* corrupted storage: start clean */ }
  }
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ settings: state.settings, records: state.records }));
    } catch (e) { /* storage full/blocked: keep in-memory */ }
  }

  // ---- i18n ----
  function applyLang() {
    var lang = state.settings.lang;
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
    document.querySelectorAll('[data-i18n]').forEach(function (n) {
      n.textContent = I18n.t(lang, n.getAttribute('data-i18n'));
    });
    $('langBtn').textContent = lang === 'bn' ? 'English' : '\u09ac\u09be\u0982\u09b2\u09be';
    renderCalibration();
    renderEyeNote();
    renderNearList();
    renderGuide();
    renderResults();
  }

  // ---- Tabs ----
  function showTab(name) {
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    document.querySelectorAll('.tabpage').forEach(function (p) {
      p.hidden = p.id !== 'tab-' + name;
    });
  }

  // ---- Calibration ----
  function renderCalibration() {
    var px = state.settings.pxPerMm;
    var barPx = Math.round(px * L.CARD_MM);
    var slider = $('calSlider');
    slider.value = Math.max(100, Math.min(500, barPx));
    $('calBar').style.width = barPx + 'px';
    $('calPxMm').textContent = t('calPxPerMm') + ': ' + px.toFixed(2);
    var h = L.letterHeightMm(20, state.settings.distM);
    $('calH2020').textContent = t('calHeight2020') + ': ' +
      (state.settings.lang === 'bn' ? L.toBn(h.toFixed(1)) : h.toFixed(1)) + ' mm';
    $('calState').textContent = state.settings.calibrated ? t('calStateCal') : t('calStateDefault');
    $('calState').className = state.settings.calibrated ? 'ok' : 'warn';
  }
  function onCalSlider() {
    var barPx = parseInt($('calSlider').value, 10);
    state.settings.pxPerMm = L.pxPerMmFromCard(barPx);
    state.settings.calibrated = true;
    persist();
    renderCalibration();
  }
  function useDefaultCal() {
    state.settings.pxPerMm = L.DEFAULT_PX_PER_MM;
    state.settings.calibrated = false;
    persist();
    renderCalibration();
  }

  function renderEyeNote() {
    var eye = state.settings.eye;
    $('eyeNote').textContent = eye === 'left' ? t('leftEyeNote') : eye === 'right' ? t('rightEyeNote') : t('bothEyesNote');
  }

  // ---- Acuity test ----
  function startAcuity() {
    state.session = L.newAcuitySession(state.settings.eye, state.settings.distM, state.settings.pxPerMm);
    state.lastAcuity = null;
    $('acuitySetup').hidden = true;
    $('acuityResult').hidden = true;
    $('acuityArea').hidden = false;
    $('testMsg').textContent = '';
    showTrial();
  }
  function showTrial() {
    var trial = L.nextTrial(state.session);
    if (!trial) { finishAcuity(); return; }
    $('lineLabel').textContent = t('lineOf') + ' ' +
      L.fmtNum(trial.lineNo, state.settings.lang) + ' ' + t('of') + ' ' +
      L.fmtNum(trial.lineCount, state.settings.lang) + ' \u2014 20/' +
      L.fmtNum(trial.den, state.settings.lang);
    var letterEl = $('trialLetter');
    letterEl.textContent = trial.letter;
    letterEl.style.fontSize = Math.round(trial.fontPx) + 'px';
    letterEl.style.lineHeight = '1.05';
    var grid = $('optGrid');
    grid.innerHTML = '';
    trial.options.forEach(function (opt) {
      var b = el('button', 'opt-btn', opt);
      b.type = 'button';
      b.setAttribute('data-opt', opt);
      b.addEventListener('click', function () { answerAcuity(opt); });
      grid.appendChild(b);
    });
  }
  function answerAcuity(choice) {
    var res = L.answerTrial(state.session, choice);
    if (!res) return;
    if (res.finished) finishAcuity();
    else showTrial();
  }
  function finishAcuity() {
    state.lastAcuity = L.acuityResult(state.session);
    state.session = null;
    $('acuityArea').hidden = true;
    var r = state.lastAcuity;
    $('acuityResultText').textContent = t('yourResult') + ': 20/' +
      (r.den === null ? '\u2014' : L.fmtNum(r.den, state.settings.lang));
    $('acuityBandText').textContent = t('band' + r.band.charAt(0).toUpperCase() + r.band.slice(1));
    $('acuityBandText').className = 'band band-' + r.band;
    $('acuityResult').hidden = false;
    $('saveAcuityBtn').disabled = false;
  }
  function saveAcuity() {
    if (!state.lastAcuity) return;
    state.records.push(L.makeRecord(state.lastAcuity));
    state.lastAcuity = null;
    $('saveAcuityBtn').disabled = true;
    $('testMsg').textContent = t('saved');
    persist();
    renderResults();
  }
  function restartAcuity() {
    $('acuityArea').hidden = true;
    $('acuityResult').hidden = true;
    $('acuitySetup').hidden = false;
    state.session = null;
    state.lastAcuity = null;
  }

  // ---- Near vision ----
  var NEAR_SENTENCE = 'The quick brown fox jumps over the lazy dog.';
  function renderNearList() {
    var list = $('nearList');
    list.innerHTML = '';
    L.NEAR_LEVELS.forEach(function (lv) {
      var row = el('div', 'near-row');
      var sample = el('div', 'near-sample', NEAR_SENTENCE);
      sample.style.fontSize = lv.px + 'px';
      var btn = el('button', 'btn small', t('nearPick') + ' \u2014 ' + lv.en);
      btn.type = 'button';
      btn.setAttribute('data-level', lv.id);
      btn.addEventListener('click', function () { pickNear(lv.id); });
      row.appendChild(sample);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }
  function pickNear(levelId) {
    var res = L.nearResult(state.settings.eye, levelId);
    if (!res) return;
    state.pendingNear = res;
    $('nearResultText').textContent = t('nearDone') + ': ' + res.labelEn + ' (' + res.px + 'px)';
    $('nearResult').hidden = false;
    $('saveNearBtn').disabled = false;
  }
  function saveNear() {
    if (!state.pendingNear) return;
    state.records.push(L.makeRecord(state.pendingNear));
    state.pendingNear = null;
    $('saveNearBtn').disabled = true;
    $('testMsg').textContent = t('saved');
    persist();
    renderResults();
  }

  // ---- Astigmatism ----
  function buildAstigFan() {
    var svg = $('astigFan');
    var NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    for (var i = 0; i < 12; i++) {
      var a = (i * 15) * Math.PI / 180;
      var x2 = 100 + 88 * Math.sin(a);
      var y2 = 100 - 88 * Math.cos(a);
      var line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', '100'); line.setAttribute('y1', '100');
      line.setAttribute('x2', x2.toFixed(1)); line.setAttribute('y2', y2.toFixed(1));
      line.setAttribute('stroke', '#111'); line.setAttribute('stroke-width', '2');
      svg.appendChild(line);
    }
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', '100'); c.setAttribute('cy', '100'); c.setAttribute('r', '8');
    c.setAttribute('fill', '#fff'); c.setAttribute('stroke', '#111'); c.setAttribute('stroke-width', '2');
    svg.appendChild(c);
  }
  function pickAstig(uniform, darker) {
    var res = L.astigResult(state.settings.eye, uniform, darker || null);
    if (!res) return;
    state.pendingAstig = res;
    $('astigResultText').textContent = t('astigDone') + ': ' +
      (uniform ? t('astigUniformYes') : t('astigUniformNo'));
    $('astigResult').hidden = false;
    $('saveAstigBtn').disabled = false;
    $('astigDirRow').hidden = uniform;
  }
  function saveAstig() {
    if (!state.pendingAstig) return;
    state.records.push(L.makeRecord(state.pendingAstig));
    state.pendingAstig = null;
    $('saveAstigBtn').disabled = true;
    $('testMsg').textContent = t('saved');
    persist();
    renderResults();
  }

  // ---- Results ----
  function eyeName(eye) {
    return eye === 'left' ? t('eyeLeft') : eye === 'right' ? t('eyeRight') : t('eyeBoth');
  }
  function recordSummary(r) {
    if (r.kind === 'acuity') return r.label;
    if (r.kind === 'near') return r.labelEn + ' (' + r.px + 'px)';
    if (r.kind === 'astig') return r.uniform ? t('astigUniformYes') : t('astigUniformNo');
    return '';
  }
  function renderResults() {
    var lang = state.settings.lang;
    var dash = L.dashboard(state.records);
    var cards = $('dashCards');
    cards.innerHTML = '';
    var items = [
      [t('eyeLeft'), dash.latestLeft ? dash.latestLeft.label : '\u2014'],
      [t('eyeRight'), dash.latestRight ? dash.latestRight.label : '\u2014'],
      [t('kindNear') + ' \u00b7 ' + t('eyeLeft'), dash.latestNearLeft ? dash.latestNearLeft.labelEn : '\u2014'],
      [t('kindNear') + ' \u00b7 ' + t('eyeRight'), dash.latestNearRight ? dash.latestNearRight.labelEn : '\u2014']
    ];
    items.forEach(function (it) {
      var c = el('div', 'dash-card');
      c.appendChild(el('div', 'dash-label', it[0]));
      c.appendChild(el('div', 'dash-value', it[1]));
      cards.appendChild(c);
    });
    $('noResults').hidden = state.records.length !== 0;
    var body = $('historyBody');
    body.innerHTML = '';
    var sorted = state.records.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    sorted.forEach(function (r) {
      var tr = document.createElement('tr');
      var tdDate = el('td', null, L.fmtDate(r.date, lang));
      var tdEye = el('td', null, eyeName(r.eye));
      var tdKind = el('td', null, t('kind' + r.kind.charAt(0).toUpperCase() + r.kind.slice(1)));
      var tdRes = el('td', null, recordSummary(r));
      var tdAct = el('td');
      var del = el('button', 'btn small danger', t('deleteBtn'));
      del.type = 'button';
      del.setAttribute('data-del', r.id);
      del.addEventListener('click', function () { deleteRecord(r.id); });
      tdAct.appendChild(del);
      tr.appendChild(tdDate); tr.appendChild(tdEye); tr.appendChild(tdKind); tr.appendChild(tdRes); tr.appendChild(tdAct);
      body.appendChild(tr);
    });
  }
  function deleteRecord(id) {
    state.records = state.records.filter(function (r) { return r.id !== id; });
    persist();
    renderResults();
  }

  // ---- Guide ----
  function renderGuide() {
    var steps = $('guideSteps');
    steps.innerHTML = '';
    for (var i = 1; i <= 5; i++) {
      var li = el('li', null, t('guideStep' + i));
      steps.appendChild(li);
    }
    var reds = $('guideReds');
    reds.innerHTML = '';
    for (var j = 1; j <= 5; j++) {
      reds.appendChild(el('li', null, t('guideRed' + j)));
    }
  }

  // ---- Data: export / import / erase ----
  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportData() {
    download('eye-test-bd-export.json',
      JSON.stringify(L.exportPayload(state.records, state.settings), null, 2));
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var msg = $('importMsg');
      try {
        var parsed = JSON.parse(reader.result);
        var v = L.validateImport(parsed);
        if (!v.ok) { msg.textContent = t('importBad') + v.error; msg.className = 'err'; return; }
        state.records = v.data.records;
        if (v.data.settings && v.data.settings.lang) state.settings.lang = v.data.settings.lang;
        persist();
        applyLang();
        msg.textContent = t('importOk');
        msg.className = 'ok';
      } catch (e) {
        msg.textContent = t('importBad') + 'badJson';
        msg.className = 'err';
      }
    };
    reader.readAsText(file);
  }
  function eraseData() {
    var msg = $('eraseMsg');
    if ($('eraseInput').value !== 'DELETE') {
      msg.textContent = t('eraseWrong');
      msg.className = 'err';
      return;
    }
    state.records = [];
    $('eraseInput').value = '';
    persist();
    renderResults();
    msg.textContent = t('eraseDone');
    msg.className = 'ok';
  }

  // ---- Init ----
  function init() {
    load();
    document.querySelectorAll('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); });
    });
    $('langBtn').addEventListener('click', function () {
      state.settings.lang = state.settings.lang === 'bn' ? 'en' : 'bn';
      persist();
      applyLang();
    });
    $('calSlider').addEventListener('input', onCalSlider);
    $('useDefaultBtn').addEventListener('click', useDefaultCal);
    $('distSelect').addEventListener('change', function () {
      state.settings.distM = parseInt($('distSelect').value, 10);
      persist();
      renderCalibration();
    });
    $('eyeSelect').addEventListener('change', function () {
      state.settings.eye = $('eyeSelect').value;
      persist();
      renderEyeNote();
    });
    $('distSelect').value = String(state.settings.distM);
    $('eyeSelect').value = state.settings.eye;
    $('startAcuityBtn').addEventListener('click', startAcuity);
    $('cantSeeBtn').addEventListener('click', function () { answerAcuity(null); });
    $('restartBtn').addEventListener('click', restartAcuity);
    $('saveAcuityBtn').addEventListener('click', saveAcuity);
    $('saveNearBtn').addEventListener('click', saveNear);
    $('saveAstigBtn').addEventListener('click', saveAstig);
    $('astigSameBtn').addEventListener('click', function () { pickAstig(true, null); });
    $('astigDarkerBtn').addEventListener('click', function () {
      $('astigDirRow').hidden = false;
      $('astigResult').hidden = true;
    });
    document.querySelectorAll('[data-astig-dir]').forEach(function (b) {
      b.addEventListener('click', function () { pickAstig(false, b.getAttribute('data-astig-dir')); });
    });
    $('exportBtn').addEventListener('click', exportData);
    $('importFile').addEventListener('change', function () {
      if ($('importFile').files[0]) importData($('importFile').files[0]);
      $('importFile').value = '';
    });
    $('eraseBtn').addEventListener('click', eraseData);
    buildAstigFan();
    showTab('test');
    applyLang();
  }

  window.EyeTest = { logic: L, i18n: I18n, state: state, saveRecordForTest: function (r) {
    state.records.push(L.makeRecord(r)); persist(); renderResults();
  } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
