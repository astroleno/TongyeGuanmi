import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoDir = path.dirname(appDir);
const distDir = path.join(repoDir, 'dist');
const manifestName = 'r5-release-manifest.json';

async function filesBelow(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry);
    const info = await stat(target);
    if (info.isDirectory()) {
      files.push(...await filesBelow(target));
    } else if (path.basename(target) !== manifestName) {
      files.push(target);
    }
  }
  return files;
}

const files = (await filesBelow(distDir))
  .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
const entries = await Promise.all(files.map(async (file) => {
  const bytes = await readFile(file);
  return {
    path: path.relative(distDir, file).split(path.sep).join('/'),
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
}));
const manifest = {
  schemaVersion: 1,
  candidate: 'react-refactor-r5-candidate',
  files: entries,
  fileCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0)
};
const output = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(path.join(distDir, manifestName), output, 'utf8');
process.stdout.write(`${JSON.stringify({
  manifest: manifestName,
  fileCount: manifest.fileCount,
  totalBytes: manifest.totalBytes,
  sha256: createHash('sha256').update(output).digest('hex')
})}\n`);
