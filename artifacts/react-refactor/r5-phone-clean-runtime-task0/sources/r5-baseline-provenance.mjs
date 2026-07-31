import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/app/node_modules/vite/dist/node/index.js';

const appDir = '/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/app';
const repoDir = path.dirname(appDir);
process.chdir(appDir);

const built = await build({
  configFile: path.join(appDir, 'vite.config.ts'),
  build: {
    write: false,
    manifest: false
  }
});

const outputs = Array.isArray(built) ? built.flatMap((item) => item.output) : built.output;
const chunks = [...new Map(
  outputs
    .filter((item) => item.type === 'chunk')
    .map((chunk) => [chunk.fileName, chunk])
).values()];
const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
const phoneShell = chunks.find((chunk) => (
  chunk.facadeModuleId?.endsWith('/src/production/phone/PhoneStoryShell.tsx')
));
if (!phoneShell) throw new Error('PhoneStoryShell chunk not found');

const phoneFiles = new Set();
function visit(fileName, followDynamicImports = true) {
  if (phoneFiles.has(fileName)) return;
  const chunk = byFile.get(fileName);
  if (!chunk) return;
  phoneFiles.add(fileName);
  for (const imported of chunk.imports) {
    const follow = !imported.includes('/index-') && !imported.endsWith('/index.js');
    visit(imported, follow);
  }
  if (followDynamicImports) {
    for (const imported of chunk.dynamicImports) visit(imported, true);
  }
}
visit(phoneShell.fileName, true);

const phoneChunks = chunks.filter((chunk) => phoneFiles.has(chunk.fileName));
const eagerFiles = new Set();
function visitEager(fileName, followImports = true) {
  if (eagerFiles.has(fileName)) return;
  const chunk = byFile.get(fileName);
  if (!chunk) return;
  eagerFiles.add(fileName);
  if (!followImports) return;
  for (const imported of chunk.imports) {
    const follow = !imported.includes('/index-') && !imported.endsWith('/index.js');
    visitEager(imported, follow);
  }
}
visitEager(phoneShell.fileName, true);

const normalizeId = (id) => {
  const bare = id.split('?')[0];
  if (bare.startsWith(repoDir + path.sep)) {
    return path.relative(repoDir, bare).split(path.sep).join('/');
  }
  return bare;
};

const ownersByModule = new Map();
for (const chunk of phoneChunks) {
  for (const id of Object.keys(chunk.modules)) {
    const owners = ownersByModule.get(id) ?? [];
    owners.push(chunk.fileName);
    ownersByModule.set(id, owners);
  }
}
const duplicatedModules = [...ownersByModule.entries()]
  .filter(([, owners]) => owners.length > 1)
  .map(([module, owners]) => ({ module: normalizeId(module), owners }));

const importersByFile = new Map();
for (const chunk of phoneChunks) {
  for (const imported of [...chunk.imports, ...chunk.dynamicImports]) {
    if (!phoneFiles.has(imported)) continue;
    const importers = importersByFile.get(imported) ?? [];
    importers.push({
      file: chunk.fileName,
      kind: chunk.dynamicImports.includes(imported) ? 'dynamic' : 'static'
    });
    importersByFile.set(imported, importers);
  }
}

const eagerLeafModules = [...eagerFiles]
  .flatMap((fileName) => Object.keys(byFile.get(fileName)?.modules ?? {}))
  .map(normalizeId)
  .filter((id) => (
    /^app\/src\/production\/phone\/(scenes|transitions)\//.test(id)
    || /^app\/src\/scenes\/[^/]+\/phone\//.test(id)
    || /^app\/src\/transitions\/[^/]+\/phone\./.test(id)
  ))
  .sort();

const details = phoneChunks
  .map((chunk) => ({
    file: chunk.fileName,
    rawBytes: Buffer.byteLength(chunk.code),
    facade: chunk.facadeModuleId ? normalizeId(chunk.facadeModuleId) : null,
    isDynamicEntry: chunk.isDynamicEntry,
    importers: importersByFile.get(chunk.fileName) ?? [],
    imports: chunk.imports.filter((file) => phoneFiles.has(file)),
    dynamicImports: chunk.dynamicImports.filter((file) => phoneFiles.has(file)),
    moduleCount: Object.keys(chunk.modules).length
  }))
  .sort((a, b) => b.rawBytes - a.rawBytes);

const directLazyEntries = phoneChunks.filter((chunk) => (
  chunk.fileName !== phoneShell.fileName && chunk.isDynamicEntry
));
const maxDirectLazyEntry = directLazyEntries
  .map((chunk) => ({
    file: chunk.fileName,
    rawBytes: Buffer.byteLength(chunk.code),
    facade: chunk.facadeModuleId ? normalizeId(chunk.facadeModuleId) : null
  }))
  .sort((a, b) => b.rawBytes - a.rawBytes)[0];
const initialChunk = chunks.find((chunk) => chunk.facadeModuleId?.endsWith('/index.html'));
const maxBudgetedLazyChunk = phoneChunks
  .filter((chunk) => (
    chunk.fileName !== phoneShell.fileName
    && chunk.fileName !== initialChunk?.fileName
  ))
  .map((chunk) => ({
    file: chunk.fileName,
    rawBytes: Buffer.byteLength(chunk.code),
    facade: chunk.facadeModuleId ? normalizeId(chunk.facadeModuleId) : null
  }))
  .sort((a, b) => b.rawBytes - a.rawBytes)[0];

process.stdout.write(`${JSON.stringify({
  phoneShell: phoneShell.fileName,
  phoneChunkCount: phoneChunks.length,
  donorMaxLazyLeafBytes: maxBudgetedLazyChunk,
  largestDirectDynamicLeaf: maxDirectLazyEntry,
  largestTen: details.slice(0, 10),
  duplicatedModuleCount: duplicatedModules.length,
  duplicatedModules,
  eagerChunkFiles: [...eagerFiles].sort(),
  eagerLeafModules
}, null, 2)}\n`);
