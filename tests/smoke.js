// eye-test-bd -- headless-Chrome smoke test via raw CDP (no puppeteer).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9363;
const BASE = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;
let count = 0;
const pageErrors = [];
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const CHROME_BIN = process.env.CHROME_BIN ||
    require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/etb-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 300));
    }
  };
  function send(method, params) {
    return new Promise((res) => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const nav = async (url) => { await send('Page.navigate', { url }); await wait(1200); };
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };
  const click = async (id) => ev(`document.getElementById('${id}').click()`);
  const BN_TITLE = '\u099a\u09cb\u0996\u09c7\u09b0 \u09aa\u09b0\u09c0\u0995\u09cd\u09b7\u09be \u09ac\u09bf\u09a1\u09bf';

  // ---- Load: defaults ----
  await nav(BASE);
  check('page title mentions Eye Test', (await ev('document.title'))?.includes('Eye Test'));
  check('4 tabs', (await ev(`document.querySelectorAll('[data-tab]').length`)) === 4);
  check('calibration bar renders ~324px wide', Math.abs((await ev(`document.getElementById('calBar').offsetWidth`)) - 324) <= 2,
    String(await ev(`document.getElementById('calBar').offsetWidth`)));
  check('px/mm shows default 3.78', (await ev(`document.getElementById('calPxMm').textContent`)).includes('3.78'));
  check('20/20 height at 3m shows 4.4 mm', (await ev(`document.getElementById('calH2020').textContent`)).includes('4.4'));
  check('default state warning shown', (await ev(`document.getElementById('calState').textContent`)).length > 5);
  check('astigmatism fan has 12 lines + circle', (await ev(`document.querySelectorAll('#astigFan line').length`)) === 12);
  check('near list has 4 rows', (await ev(`document.querySelectorAll('#nearList .near-row').length`)) === 4);
  check('guide steps render 5 + 5', (await ev(`document.querySelectorAll('#guideSteps li').length`)) === 5 &&
    (await ev(`document.querySelectorAll('#guideReds li').length`)) === 5);

  // ---- Calibration slider ----
  await ev(`var el=document.getElementById('calSlider'); el.value='400'; el.dispatchEvent(new Event('input',{bubbles:true}))`);
  check('slider 400 -> px/mm 4.67', (await ev(`document.getElementById('calPxMm').textContent`)).includes('4.67'));
  check('calibrated state shown', (await ev(`document.getElementById('calState').textContent`)).includes('Calibrated'));
  await click('useDefaultBtn');
  check('use-default restores 3.78', (await ev(`document.getElementById('calPxMm').textContent`)).includes('3.78'));

  // ---- Acuity: all correct -> 20/20 ----
  await click('startAcuityBtn');
  check('trial area visible', (await ev(`document.getElementById('acuityArea').hidden`)) === false);
  check('line label says Line 1 of 8', (await ev(`document.getElementById('lineLabel').textContent`)).includes('Line 1 of 8'));
  check('first letter font is large (>150px)', parseFloat(await ev(`getComputedStyle(document.getElementById('trialLetter')).fontSize`)) > 150,
    await ev(`getComputedStyle(document.getElementById('trialLetter')).fontSize`));
  check('4 option buttons', (await ev(`document.querySelectorAll('#optGrid .opt-btn').length`)) === 4);
  const answerCorrect = async () => ev(`(function(){var l=document.getElementById('trialLetter').textContent;var b=[...document.querySelectorAll('#optGrid .opt-btn')].find(function(x){return x.textContent===l;});if(!b)return 'NO-MATCH';b.click();return 'ok';})()`);
  for (let i = 0; i < 8; i++) {
    const r = await answerCorrect();
    check('correct answer ' + (i + 1) + '/8 accepted', r === 'ok', String(r));
    await wait(120);
  }
  check('result panel visible', (await ev(`document.getElementById('acuityResult').hidden`)) === false);
  check('result says 20/20', (await ev(`document.getElementById('acuityResultText').textContent`)).includes('20/20'));
  check('band says Excellent', (await ev(`document.getElementById('acuityBandText').textContent`)).includes('Excellent'));
  await click('saveAcuityBtn');
  check('saved message shown', (await ev(`document.getElementById('testMsg').textContent`)).includes('Saved'));
  check('1 record stored', (await ev(`window.EyeTest.state.records.length`)) === 1);

  // ---- Acuity: wrong on line 2 -> 20/200 ----
  await click('restartBtn');
  await click('startAcuityBtn');
  await answerCorrect(); // pass 20/200
  await ev(`(function(){var l=document.getElementById('trialLetter').textContent;var b=[...document.querySelectorAll('#optGrid .opt-btn')].find(function(x){return x.textContent!==l;});b.click();})()`);
  await wait(150);
  check('wrong answer ends test at 20/200', (await ev(`document.getElementById('acuityResultText').textContent`)).includes('20/200'));
  check('band says Reduced', (await ev(`document.getElementById('acuityBandText').textContent`)).includes('Reduced'));
  await click('saveAcuityBtn');
  check('2 records stored', (await ev(`window.EyeTest.state.records.length`)) === 2);

  // ---- Near vision ----
  await ev(`document.querySelector('[data-level="XS"]').click()`);
  check('near result shown', (await ev(`document.getElementById('nearResult').hidden`)) === false);
  await click('saveNearBtn');
  check('3 records stored', (await ev(`window.EyeTest.state.records.length`)) === 3);

  // ---- Astigmatism ----
  await click('astigSameBtn');
  check('astig result shown', (await ev(`document.getElementById('astigResult').hidden`)) === false);
  check('astig result says uniform', (await ev(`document.getElementById('astigResultText').textContent`)).includes('uniform'));
  await click('saveAstigBtn');
  check('4 records stored', (await ev(`window.EyeTest.state.records.length`)) === 4);
  await ev(`document.getElementById('astigDarkerBtn').click()`);
  check('direction row appears', (await ev(`document.getElementById('astigDirRow').hidden`)) === false);
  await ev(`document.querySelector('[data-astig-dir="vertical"]').click()`);
  check('darker-vertical result shown', (await ev(`document.getElementById('astigResultText').textContent`)).includes('astigmatism'));

  // ---- Results tab ----
  await ev(`document.querySelector('[data-tab="results"]').click()`);
  check('history has 4 rows', (await ev(`document.querySelectorAll('#historyBody tr').length`)) === 4);
  check('dashboard latest left is 20/200 (most recent acuity)', (await ev(`document.querySelector('#dashCards .dash-card .dash-value').textContent`)).includes('20/200'));
  await ev(`document.querySelector('#historyBody [data-del]').click()`);
  check('delete removes a row', (await ev(`document.querySelectorAll('#historyBody tr').length`)) === 3);

  // ---- Import validation (in-page logic) ----
  check('validateImport accepts own records', (await ev(`window.EyeTest.logic.validateImport({app:'eye-test-bd',version:1,records:window.EyeTest.state.records}).ok`)) === true);
  check('validateImport rejects wrong app', (await ev(`window.EyeTest.logic.validateImport({app:'nope',version:1,records:[]}).ok`)) === false);

  // ---- Erase guard ----
  await ev(`document.querySelector('[data-tab="data"]').click()`);
  await ev(`document.getElementById('eraseInput').value='WRONG'; document.getElementById('eraseBtn').click()`);
  check('wrong erase word keeps records', (await ev(`window.EyeTest.state.records.length`)) === 3);
  await ev(`document.getElementById('eraseInput').value='DELETE'; document.getElementById('eraseBtn').click()`);
  check('DELETE erases all', (await ev(`window.EyeTest.state.records.length`)) === 0);

  // ---- Language toggle + persistence ----
  await ev(`document.querySelector('[data-tab="test"]').click()`);
  await click('langBtn');
  check('BN title renders', (await ev(`document.getElementById('appTitle').textContent`)) === BN_TITLE);
  check('BN digits in calibration (4.4 -> Bengali)', (await ev(`document.getElementById('calH2020').textContent`)).includes('\u09ea.\u09ea'),
    await ev(`document.getElementById('calH2020').textContent`));
  await nav(BASE); // reload: language persists
  check('BN persists after reload', (await ev(`document.getElementById('appTitle').textContent`)) === BN_TITLE);
  await click('langBtn');
  check('back to EN title', (await ev(`document.getElementById('appTitle').textContent`)) === 'Eye Test BD');

  // ---- Mobile 390px: no horizontal overflow on any tab ----
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await nav(BASE);
  for (const tab of ['test', 'results', 'guide', 'data']) {
    await ev(`document.querySelector('[data-tab="${tab}"]').click()`);
    await wait(150);
    check('390px no overflow on ' + tab, (await ev(`document.documentElement.scrollWidth`)) <= 390,
      'scrollWidth=' + (await ev(`document.documentElement.scrollWidth`)));
  }

  // ---- Console errors ----
  check('no page console errors / exceptions', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 400));

  chrome.kill();
  console.log('\n' + count + ' checks, ' + failures + ' failures');
  process.exit(failures || pageErrors.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR: ' + e.message); chrome.kill(); process.exit(2); });
