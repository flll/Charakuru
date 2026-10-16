import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {patchGuideUI} from './lib/patch.mjs';

export const BASE_HASH = '381f754f899ae7d45a8ef549cbc85de920aeff1dd459ebbd115b3337aa53c078';
export const moduleNames = ['guide-adjustment-ui.mjs', 'guide-adjustment-model.mjs', 'guide-adjustment-i18n.mjs', 'guide-adjustment.css'];
const extensionRoot = path.dirname(fileURLToPath(import.meta.url));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => fs.readFile(file).catch(error => {
  if (error.code === 'ENOENT') return null;
  throw error;
});

// Validate every existing file before the first write. Never edit project data.
export async function applyGuideUI({kit, action = 'install', source = path.join(extensionRoot, 'public')}) {
  if (!kit || !['install', 'check', 'restore'].includes(action)) {
    throw Error('Usage: node install.mjs install|check|restore --kit <extracted-official-kit>');
  }
  const root = path.resolve(kit), backup = path.join(root, '.charakuru-local', 'three-view-adjustment');
  const entry = path.join(root, 'public', 'three-view-ui.mjs');
  const originalFile = path.join(backup, 'three-view-ui.mjs');
  const stateFile = path.join(backup, 'installed.json');
  const current = await fs.readFile(entry), saved = await read(originalFile);
  const previous = JSON.parse(await read(stateFile) || 'null');
  const original = saved ?? current;
  if (digest(original) !== BASE_HASH) throw Error('Unsupported or edited upstream UI. Nothing changed.');
  const patched = Buffer.from(patchGuideUI(original.toString('utf8')));
  if (![BASE_HASH, digest(patched), previous?.entry].includes(digest(current))) {
    throw Error('Unexpected edits in three-view-ui.mjs. Nothing changed.');
  }
  const modules = [];
  for (const name of moduleNames) {
    const file = path.join(root, 'public', name);
    const desired = await fs.readFile(path.join(source, name)), existing = await read(file);
    if (existing && !existing.equals(desired) && digest(existing) !== previous?.modules?.[name]) {
      throw Error(`Unexpected local edits in ${name}. Nothing changed.`);
    }
    modules.push({name, file, desired, existing});
  }
  if (action === 'check') {
    if (!current.equals(patched) || modules.some(m => !m.existing?.equals(m.desired))) {
      throw Error('This extension revision is not installed.');
    }
  } else {
    await fs.mkdir(backup, {recursive: true});
    if (!saved) await fs.writeFile(originalFile, original, {flag: 'wx'});
    if (action === 'install') for (const m of modules) await fs.writeFile(m.file, m.desired);
    await fs.writeFile(entry, action === 'install' ? patched : original);
    // Restore leaves helpers inactive. Record their ACTUAL bytes, allowing a later update.
    await fs.writeFile(stateFile, JSON.stringify({
      version: 1, action, base: BASE_HASH, entry: digest(patched),
      modules: Object.fromEntries(modules.filter(m => action === 'install' || m.existing)
        .map(m => [m.name, digest(action === 'install' ? m.desired : m.existing)])),
    }, null, 2) + '\n');
  }
  return {action, verified: true, entry: digest(await fs.readFile(entry))};
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , action, flag, kit, ...extra] = process.argv;
  try {
    if (flag !== '--kit' || extra.length) throw Error('Usage: node install.mjs install|check|restore --kit <extracted-official-kit>');
    console.log(JSON.stringify(await applyGuideUI({kit, action})));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
