import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const currentPath = path.join(rootDir, 'index.html');
const figure3HomepageAdapterPath = path.join(rootDir, 'js/transitions/homepage/figure3-homepage-adapter.js');

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

const current = extractVisibleText(await readFile(currentPath, 'utf8'));
const currentText = current.join('\n');
const searchableText = `${currentText}\n${await readFile(figure3HomepageAdapterPath, 'utf8')}`;

const required = [
  '你的同行不是更聪明，只是更早把 AI 用进了生意里。',
  'AI 不是技术专家的玩具。它该帮你省下不该花的钱、多接几个客户，再把臃肿的岗位精简下来——能管好这几件事的，才是真利器。它决定了未来三年你是领跑还是追赶。',
  '一句话讲清我们干什么',
  '让 AI 从一场培训，变成账上的数字。',
  '我们不卖课、不卖软件，而是进到你的业务现场，把 AI 做成团队天天在用、月底对得上账的东西。',
  '先识场，再立法',
  '先看懂，',
  '再用上。',
  '你的生意怎么跑，你比谁都懂。我们不重画流程，先把现场的耗损、断点和慢单找出来，再决定 AI 接到哪里。',
  '识场',
  '立法',
  '共创',
  '成器',
  '陪跑',
  '用不上，不算落地',
  '我们见过太多',
  '“用不上”。',
  '只培训',
  '只上软件',
  '只交方案',
  '在开放真实的场域中并肩协作。',
  '看见复杂系统背后的结构与门道。',
  '先小做，再扩',
  '先跑通，',
  '再铺开。',
  '落到现场',
  '先看账，',
  '再定工具。',
  '同样一件事，有人报三万有人报三千万。我们帮你看真生意里的',
  '投流怎么花、店怎么卖、车间怎么排。',
  '给企业家的延伸服务',
  '先会用，',
  '再出海。',
  '你为生意请的这套 AI 打法，也能用在孩子身上。',
  '把你拿不准的那个决定，先拿出来聊。'
];
const missing = required.filter((line) => !searchableText.includes(line));

const forbidden = [
  '企业 AI 能力建设',
  '信息汇总 -> 判断框架',
  '经验 -> 可调用资产',
  '洞察 -> 内容与跟进',
  'AI 学习工具链',
  '研究项目路径',
  '同野，取“同人于野”；观幂，是看见复杂系统背后的结构。',
  '预约一次 AI 现场诊断',
  '同野观幂 / 00',
  'Method / 01',
  '从“看得懂”到“用得上”的五步打法',
  'AI 落地前两步',
  'THE FIELD EDITION',
  '同人于野，观复杂之幂。',
  '给企业家的延伸服务 / 04'
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

console.log('Copy alignment looks good.');
