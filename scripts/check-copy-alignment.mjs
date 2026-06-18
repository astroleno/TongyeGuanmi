import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = '/Users/aitoshuu/Downloads/tongyeme/index.html';
const currentPath = path.join(rootDir, 'index.html');

const decodeEntities = (text) => text
  .replace(/&copy;/g, '©')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>');

function extractVisibleText(html) {
  return decodeEntities(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const source = extractVisibleText(await readFile(sourcePath, 'utf8'));
const current = extractVisibleText(await readFile(currentPath, 'utf8'));
const currentText = current.join('\n');
const missing = source.filter((line) => !currentText.includes(line));

const forbidden = [
  '企业 AI 能力建设',
  '信息汇总 -> 判断框架',
  '经验 -> 可调用资产',
  '洞察 -> 内容与跟进',
  'AI 学习工具链',
  '研究项目路径',
  '同野，取“同人于野”；观幂，是看见复杂系统背后的结构。',
  '预约一次 AI 现场诊断'
];
const stale = forbidden.filter((line) => currentText.includes(line));

if (missing.length || stale.length) {
  if (missing.length) {
    console.error('Copy alignment failed: standard copy missing from generated index.html');
    missing.forEach((line) => console.error(`- ${line}`));
  }
  if (stale.length) {
    console.error('Copy alignment failed: stale rewritten copy remains');
    stale.forEach((line) => console.error(`- ${line}`));
  }
  process.exit(1);
}

console.log('Copy aligns with /Users/aitoshuu/Downloads/tongyeme/index.html.');
