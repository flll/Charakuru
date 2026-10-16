import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {kitURL} from './kit.mjs';

// Run the real UI module in a DOM. Only import locations change; no source logic is mocked.
let source = await fs.readFile(new URL('../public/guide-adjustment-ui.mjs', import.meta.url), 'utf8');
for (const name of ['i18n.mjs', 'three-view-data.mjs', 'guide-adjustment-i18n.mjs', 'guide-adjustment-model.mjs']) {
  const url = name.startsWith('guide-adjustment') ? new URL('../public/' + name, import.meta.url) : kitURL('public/' + name);
  source = source.replace(`'./${name}'`, JSON.stringify(url.href));
}
const {createGuideAdjustmentUI} = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

function fixture(t) {
  const dom = new JSDOM(`<!doctype html><html lang="ja"><head><link data-guide-adjustment></head><body><dialog id="threeViewDialog">
    <div class="dialog-top"></div><div class="three-view-toolbar"><button data-guide-view="front">Front</button><button data-guide-view="side">Side</button></div>
    <div id="threeViewPreview"></div><p id="threeViewFilename"></p><p id="threeViewSideHelp"></p><p class="three-view-help"></p>
    <div class="three-view-controls"></div><p id="threeViewError"></p>
    <footer class="three-view-actions"><input id="threeViewLock" type="checkbox"><button id="applyThreeViews">Apply</button></footer>
    </dialog></body></html>`);
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  t.after(() => {globalThis.document = previous; dom.window.close();});
  const doc = dom.window.document, $ = selector => doc.querySelector(selector);
  const views = Object.fromEntries(['front', 'side', 'back'].map(view => [view, {path: view + '.png', height: 1.6, y: .8, x: 0, opacity: .65, locked: false, frame: {top: 0, bottom: 1}}]));
  const ctx = {draft: {views}, direction: 'front', sizeBasis: 1.6, bounds: {min: {y: 0}}, pending: false, modalCamera: null};
  let ui;
  // These are the existing host contracts: refresh reads draft; handlers read DOM state.
  function refresh() {$('#threeViewLock').checked = ctx.draft.views[ctx.direction].locked; ui.sync();}
  ui = createGuideAdjustmentUI($('#threeViewDialog'), () => ctx, refresh);
  for (const button of doc.querySelectorAll('[data-guide-view]')) button.onclick = () => {ctx.direction = button.dataset.guideView; refresh();};
  $('#threeViewLock').onchange = event => {for (const view of Object.values(views)) view.locked = event.target.checked; refresh();};
  ui.open(); refresh();
  const enter = key => $('#ga-' + key).dispatchEvent(new dom.window.KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true}));
  const type = (key, value) => {const input = $('#ga-' + key); input.value = value; input.dispatchEvent(new dom.window.Event('input', {bubbles: true}));};
  const edit = (key, value) => {type(key, value); enter(key);};
  return {dom, $, ctx, ui, refresh, type, edit, enter};
}

test('別の欄を確定しても途中のマイナスを破棄せず適用を止める', t => {
  const f = fixture(t);
  f.type('x', '-'); f.edit('opacity', '50');
  assert.equal(f.$('#ga-x').value, '-');
  assert.equal(f.$('#ga-x').getAttribute('aria-invalid'), 'true');
  assert.equal(f.$('#applyThreeViews').disabled, true);
  assert.equal(f.ctx.draft.views.front.x, 0);
  assert.equal(f.ctx.draft.views.front.opacity, .5);
});

test('プレビューのpointerdownより前に入力を確定してドラッグの開始値にする', t => {
  const f = fixture(t); let startX;
  f.$('#threeViewPreview').addEventListener('pointerdown', () => {startX = f.ctx.draft.views.front.x;});
  f.type('x', '10');
  f.$('#threeViewPreview').dispatchEvent(new f.dom.window.MouseEvent('pointerdown', {button: 0, bubbles: true, cancelable: true}));
  assert.equal(startX, .1);
  f.ctx.draft.views.front.x = .2; f.refresh(); f.enter('x');
  assert.equal(f.ctx.draft.views.front.x, .2);
});

test('最小値を丸めた表示のまま再確定しても保存精度を失わない', t => {
  const f = fixture(t); f.ctx.sizeBasis = 1.7; f.refresh();
  const exact = Number(f.$('#ga-scale').getAttribute('aria-valuemin'));
  f.edit('scale', String(exact)); f.enter('scale');
  assert.equal(f.ctx.draft.views.front.height, .01);
  assert.equal(f.$('#ga-scale').getAttribute('aria-invalid'), 'false');
  assert.equal(f.$('#applyThreeViews').disabled, false);
});

function newlyValidPendingInput(f) {
  f.edit('scale', '1250'); // 20m images allow a foot level of 0, but not +1cm.
  f.edit('bottom', '1');
  assert.equal(f.$('#ga-bottom').getAttribute('aria-invalid'), 'true');
  f.edit('scale', '100'); // +1cm now becomes valid, and still needs to be committed.
  assert.equal(f.$('#ga-bottom').value, '1');
  assert.equal(f.$('#applyThreeViews').disabled, false);
}

test('範囲変更で有効になった入力を方向切替の前に確定する', t => {
  const f = fixture(t); newlyValidPendingInput(f);
  f.$('[data-guide-view="side"]').click();
  assert.equal(f.ctx.direction, 'side');
  assert.ok(Math.abs(f.ctx.draft.views.side.y - .81) < 1e-12);
  assert.equal(f.$('#ga-bottom').value, '1');
});

test('未確定の有効入力を反映しても固定チェックの意図を取り消さない', t => {
  const f = fixture(t); newlyValidPendingInput(f);
  f.$('#threeViewLock').checked = true;
  f.$('#threeViewLock').dispatchEvent(new f.dom.window.Event('change', {bubbles: true}));
  assert.ok(Object.values(f.ctx.draft.views).every(g => g.locked));
  assert.equal(f.$('#threeViewLock').checked, true);
  assert.equal(f.$('#ga-bottom').disabled, true);
  assert.ok(Math.abs(f.ctx.draft.views.front.y - .81) < 1e-12);
});
