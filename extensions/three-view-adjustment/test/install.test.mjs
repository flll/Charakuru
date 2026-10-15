import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {applyGuideUI, BASE_HASH, moduleNames} from '../install.mjs';
import {kit} from './kit.mjs';

const source = fileURLToPath(new URL('../public', import.meta.url));
const entry = 'public/three-view-ui.mjs';
const original = await fs.readFile(path.join(kit, entry));
assert.equal(createHash('sha256').update(original).digest('hex'), BASE_HASH, 'Tests require an untouched official kit.');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'charakuru-guide-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('charakuru-guide-test-'));
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, 'public'));
  await fs.writeFile(path.join(root, entry), original);
  await fs.writeFile(path.join(root, 'project.charakit'), 'untouched project bytes');
  return root;
}

test('Install, check, repeat, restore and reinstall preserve the upstream entry and project bytes', async t => {
  const root = await fixture(t);
  await applyGuideUI({kit: root});
  await applyGuideUI({kit: root, action: 'check'});
  await applyGuideUI({kit: root});
  await applyGuideUI({kit: root, action: 'restore'});
  assert.deepEqual(await fs.readFile(path.join(root, entry)), original);
  await assert.rejects(applyGuideUI({kit: root, action: 'check'}), /not installed/);
  await applyGuideUI({kit: root});
  assert.equal(await fs.readFile(path.join(root, 'project.charakit'), 'utf8'), 'untouched project bytes');
});

test('An extension update after restore accepts the actual previous helper revision', async t => {
  const root = await fixture(t);
  await applyGuideUI({kit: root});
  const next = path.join(root, 'next-source');
  await fs.mkdir(next);
  for (const name of moduleNames) await fs.copyFile(path.join(source, name), path.join(next, name));
  await fs.appendFile(path.join(next, 'guide-adjustment.css'), '\n/* next revision */\n');
  await applyGuideUI({kit: root, action: 'restore', source: next});
  await applyGuideUI({kit: root, source: next});
  await applyGuideUI({kit: root, action: 'check', source: next});
});

test('Unknown upstream bytes and user edits stop before writing any other file', async t => {
  const root = await fixture(t), target = path.join(root, entry);
  await fs.appendFile(target, '\n// user edit\n');
  const edited = await fs.readFile(target);
  await assert.rejects(applyGuideUI({kit: root}), /Unsupported/);
  assert.deepEqual(await fs.readFile(target), edited);
  await assert.rejects(fs.stat(path.join(root, '.charakuru-local')), /ENOENT/);
  await fs.writeFile(target, original);
  await applyGuideUI({kit: root});
  await fs.appendFile(path.join(root, 'public/guide-adjustment.css'), '\n/* local edit */');
  const entryBefore = await fs.readFile(target);
  await assert.rejects(applyGuideUI({kit: root, action: 'restore'}), /Unexpected local edits/);
  assert.deepEqual(await fs.readFile(target), entryBefore);
});
