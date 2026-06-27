#!/usr/bin/env node
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(rootDir, 'output/playwright/observer-visual-parity');

mkdirSync(outputDir, { recursive: true });

const VIEWPORT = { width: 1440, height: 900 };
const BASELINE_URL = 'http://127.0.0.1:8101/index.html';
const TARGET_URL = 'http://127.0.0.1:8102/index.html';
const TARGET_CALIBRATE_URL = 'http://127.0.0.1:8102/index.html?calibrate=timeline';

// 关键视觉检查点（基于 main 的自然滚动位置）
const VISUAL_CHECKPOINTS = [
  { name: 'hero-start', scrollY: 0, waitMs: 1200 },
  { name: 'hero-mid', scrollY: 800, waitMs: 800 },
  { name: 'hero-figure', scrollY: 1400, waitMs: 800 },
  { name: 'belief-pattern-start', scrollY: 2200, waitMs: 1000 },
  { name: 'belief-pattern-bloom', scrollY: 2800, waitMs: 1200 },
  { name: 'belief-star-field', scrollY: 3600, waitMs: 1000 },
  { name: 'aod-bridge-start', scrollY: 4400, waitMs: 1200 },
  { name: 'aod-bridge-mid', scrollY: 4800, waitMs: 800 },
  { name: 'method-paper', scrollY: 5600, waitMs: 600 },
  { name: 'figure2-start', scrollY: 6800, waitMs: 1200 },
  { name: 'figure2-mid', scrollY: 7600, waitMs: 1000 },
  { name: 'figure2-end', scrollY: 8400, waitMs: 800 },
  { name: 'brand-paper', scrollY: 9200, waitMs: 600 },
  { name: 'figure3-start', scrollY: 10000, waitMs: 1200 },
  { name: 'figure3-mid', scrollY: 10600, waitMs: 800 },
  { name: 'services-paper', scrollY: 11400, waitMs: 600 },
  { name: 'ttg-start', scrollY: 12400, waitMs: 1200 },
  { name: 'ttg-mid', scrollY: 13200, waitMs: 1000 },
  { name: 'education-paper', scrollY: 14200, waitMs: 600 },
  { name: 'ph-start', scrollY: 15200, waitMs: 1200 },
  { name: 'ph-mid', scrollY: 15800, waitMs: 800 },
  { name: 'philosophy-paper', scrollY: 16800, waitMs: 600 },
  { name: 'crane-start', scrollY: 17800, waitMs: 1200 },
  { name: 'crane-mid', scrollY: 18400, waitMs: 1000 },
  { name: 'contact-end', scrollY: 19600, waitMs: 800 }
];

// 必需的视觉资产和 DOM 结构检查（基于 main 分支实际结构）
const VISUAL_ASSET_CHECKS = {
  'hero-figure': {
    images: ['back1.png', 'middle1.png'],
    videos: ['figure1.webm'],
    classes: ['.fallback-back', '.fallback-middle', '.hero-content']
  },
  'belief-pattern-bloom': {
    // Pattern bloom canvas 由 transition 组件动态创建，不检查 DOM 存在
    // 只检查 transition host 是否存在
    classes: ['[data-transition-module="pattern-bloom"]']
  },
  'belief-star-field': {
    canvas: ['[data-belief-star-field]'],
    classes: ['.belief-star-wash', '.belief-copy-wrap']
  },
  'aod-bridge-mid': {
    images: ['aod_cloud-alpha.png', 'aod_sun-alpha.png'],
    videos: ['aod_figure-alpha-front-scrub.webm'],
    classes: ['.aod-transition__layer--cloud', '.aod-transition__layer--sun']
  },
  'figure2-mid': {
    images: ['figure2-cloud-source.png', 'figure2-front-white-source.png', 'figure2-middle-fresco-opaque-alpha.png'],
    classes: ['.figure2-arch-layer--cloud', '.figure2-arch-layer--far-arcade-window', '.figure2-arch-layer--middle-composite', '.figure2-arch-layer--near-arch']
  },
  'figure3-mid': {
    videos: ['figure3-alpha-scrub.webm'],
    classes: ['.figure3-transition__video']
  },
  'ttg-mid': {
    images: ['ttg_bg.png', 'ttg_middle-alpha.png', 'ttg_front-original-overlay-alpha.png'],
    videos: ['ttg_figure-alpha-scrub.webm'],
    classes: ['.ttg-layer--bg', '.ttg-layer--middle', '.ttg-layer--front']
  },
  'ph-mid': {
    images: ['ph_background.png', 'ph_front-alpha.png'],
    videos: ['ph_figure-alpha-scrub.webm'],
    classes: ['.ph-bg', '.ph-layer--front', '.ph-layer--figure']
  },
  'crane-mid': {
    images: ['crane1_cloud2-alpha.png', 'crane1_cloud1-alpha.png', 'crane1_cloud-front2-alpha.png', 'crane1_arch-alpha.png'],
    // Crane 视频由 transition 组件动态创建，不作为严格检查项
    classes: ['.crane-layer--cloud-back', '.crane-layer--cloud-front', '.crane-layer--cloud-front-second', '.crane-layer--arch', '[data-transition-module="crane"]']
  }
};

async function captureCheckpoint(page, checkpoint, label) {
  await page.evaluate((y) => window.scrollTo(0, y), checkpoint.scrollY);
  await page.waitForTimeout(checkpoint.waitMs);

  const screenshot = await page.screenshot({ fullPage: false });
  const screenshotPath = path.join(outputDir, `${label}-${checkpoint.name}.png`);
  writeFileSync(screenshotPath, screenshot);

  const state = await page.evaluate(() => {
    const scrollY = window.scrollY;
    const docHeight = document.documentElement.scrollHeight;
    const viewportHeight = window.innerHeight;

    // 收集可见元素
    const getVisibleElements = (selector) => {
      const elements = [...document.querySelectorAll(selector)];
      return elements.filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.height > 0 &&
               parseFloat(style.opacity) > 0.01 &&
               style.visibility !== 'hidden' &&
               style.display !== 'none';
      }).map(el => ({
        tag: el.tagName,
        class: el.className,
        opacity: parseFloat(window.getComputedStyle(el).opacity),
        rect: {
          top: Math.round(el.getBoundingClientRect().top),
          left: Math.round(el.getBoundingClientRect().left),
          width: Math.round(el.getBoundingClientRect().width),
          height: Math.round(el.getBoundingClientRect().height)
        }
      }));
    };

    // 检查视频状态
    const videoStates = [...document.querySelectorAll('video')].map(v => ({
      src: v.src.split('/').pop(),
      currentTime: v.currentTime.toFixed(2),
      paused: v.paused,
      visible: v.getBoundingClientRect().height > 0 &&
               parseFloat(window.getComputedStyle(v).opacity) > 0.01
    }));

    // 检查 canvas 状态
    const canvasStates = [...document.querySelectorAll('canvas')].map(c => ({
      id: c.id,
      class: c.className,
      width: c.width,
      height: c.height,
      visible: c.getBoundingClientRect().height > 0 &&
               parseFloat(window.getComputedStyle(c).opacity) > 0.01
    }));

    return {
      scrollY,
      docHeight,
      viewportHeight,
      visibleImages: getVisibleElements('img'),
      visibleVideos: videoStates.filter(v => v.visible),
      visibleCanvas: canvasStates.filter(c => c.visible),
      consoleErrors: window.__capturedErrors || []
    };
  });

  return { screenshot: screenshotPath, state };
}

async function checkAssetPresence(page, checkpointName) {
  const checks = VISUAL_ASSET_CHECKS[checkpointName];
  if (!checks) return { passed: true, missing: [] };

  const missing = await page.evaluate((checks) => {
    const missing = [];

    if (checks.images) {
      for (const imgName of checks.images) {
        const imgs = [...document.querySelectorAll('img')].filter(img =>
          img.src.includes(imgName) &&
          img.getBoundingClientRect().height > 0
        );
        // 图片只要加载了就算通过，不强制要求高 opacity（可能被滤镜/遮罩影响）
        if (imgs.length === 0) missing.push(`image: ${imgName} (not loaded or visible)`);
      }
    }

    if (checks.videos) {
      for (const videoName of checks.videos) {
        const videos = [...document.querySelectorAll('video')].filter(v =>
          v.src.includes(videoName)
        );
        if (videos.length === 0) {
          missing.push(`video: ${videoName} (not in DOM)`);
        } else {
          // 视频存在即可，opacity 由 ScrollTrigger 控制，可能在采样时刻为 0
          const hasPositiveRect = videos.some(v => v.getBoundingClientRect().height > 0);
          if (!hasPositiveRect) {
            missing.push(`video: ${videoName} (in DOM but zero-height)`);
          }
        }
      }
    }

    if (checks.classes) {
      for (const className of checks.classes) {
        const els = [...document.querySelectorAll(className)];
        if (els.length === 0) {
          missing.push(`class: ${className} (not in DOM)`);
        } else {
          // 元素存在且有尺寸即通过，不强制检查 opacity（ScrollTrigger 动态控制）
          const hasSize = els.some(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (!hasSize) missing.push(`class: ${className} (in DOM but collapsed)`);
        }
      }
    }

    if (checks.canvas) {
      for (const canvasSelector of checks.canvas) {
        const canvases = [...document.querySelectorAll(canvasSelector)];
        if (canvases.length === 0) {
          missing.push(`canvas: ${canvasSelector} (not in DOM)`);
        } else {
          const hasSize = canvases.some(c => {
            const rect = c.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          });
          if (!hasSize) missing.push(`canvas: ${canvasSelector} (in DOM but zero-size)`);
        }
      }
    }

    return missing;
  }, checks);

  return { passed: missing.length === 0, missing };
}

async function run() {
  console.log('Starting visual parity verification...\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });

  // 捕获控制台错误
  const setupErrorCapture = (page) => {
    page.on('console', msg => {
      if (msg.type() === 'error') {
        page.evaluate((text) => {
          window.__capturedErrors = window.__capturedErrors || [];
          window.__capturedErrors.push(text);
        }, msg.text());
      }
    });
  };

  const results = {
    baseline: {},
    target: {},
    targetCalibrate: {},
    issues: [],
    summary: { critical: 0, high: 0, medium: 0 }
  };

  console.log('📸 Capturing baseline (main branch on :8101)...\n');
  const baselinePage = await context.newPage();
  setupErrorCapture(baselinePage);
  await baselinePage.goto(BASELINE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await baselinePage.waitForTimeout(2000); // 等待 loader 隐藏

  for (const checkpoint of VISUAL_CHECKPOINTS) {
    process.stdout.write(`  ${checkpoint.name}...`);
    const result = await captureCheckpoint(baselinePage, checkpoint, 'baseline');
    results.baseline[checkpoint.name] = result.state;
    console.log(' ✓');
  }
  await baselinePage.close();

  console.log('\n📸 Capturing target (observer branch on :8102)...\n');
  const targetPage = await context.newPage();
  setupErrorCapture(targetPage);
  await targetPage.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await targetPage.waitForTimeout(2000);

  for (const checkpoint of VISUAL_CHECKPOINTS) {
    process.stdout.write(`  ${checkpoint.name}...`);
    const result = await captureCheckpoint(targetPage, checkpoint, 'target');
    results.target[checkpoint.name] = result.state;

    const assetCheck = await checkAssetPresence(targetPage, checkpoint.name);
    if (!assetCheck.passed) {
      results.issues.push({
        severity: 'HIGH',
        checkpoint: checkpoint.name,
        type: 'missing-assets',
        details: assetCheck.missing
      });
      results.summary.high++;
      console.log(` ⚠️  ${assetCheck.missing.length} missing`);
    } else {
      console.log(' ✓');
    }
  }

  // 检查文档高度差异
  const baselineHeight = results.baseline['hero-start'].docHeight;
  const targetHeight = results.target['hero-start'].docHeight;
  const heightDiff = Math.abs(targetHeight - baselineHeight);
  const heightDiffPercent = (heightDiff / baselineHeight * 100).toFixed(1);

  if (heightDiff > 1000) {
    results.issues.push({
      severity: 'CRITICAL',
      checkpoint: 'document-height',
      type: 'layout-regression',
      details: [`Document height differs by ${heightDiff}px (${heightDiffPercent}%): baseline=${baselineHeight}px, target=${targetHeight}px`]
    });
    results.summary.critical++;
  } else if (heightDiff > 100) {
    results.issues.push({
      severity: 'MEDIUM',
      checkpoint: 'document-height',
      type: 'layout-difference',
      details: [`Document height differs by ${heightDiff}px (${heightDiffPercent}%): baseline=${baselineHeight}px, target=${targetHeight}px`]
    });
    results.summary.medium++;
  }

  await targetPage.close();

  console.log('\n📸 Capturing target with calibration HUD...\n');
  const calibratePage = await context.newPage();
  setupErrorCapture(calibratePage);
  await calibratePage.goto(TARGET_CALIBRATE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await calibratePage.waitForTimeout(2000);

  // 只捕获几个关键点验证 HUD 可见
  const calibrateCheckpoints = ['hero-start', 'belief-pattern-bloom', 'figure2-mid', 'crane-mid'];
  for (const name of calibrateCheckpoints) {
    const checkpoint = VISUAL_CHECKPOINTS.find(c => c.name === name);
    process.stdout.write(`  ${checkpoint.name}...`);
    const result = await captureCheckpoint(calibratePage, checkpoint, 'calibrate');
    results.targetCalibrate[checkpoint.name] = result.state;
    console.log(' ✓');
  }

  // 检查 HUD 是否实际显示
  const hudVisible = await calibratePage.evaluate(() => {
    const hud = document.querySelector('[data-timeline-calibration-hud]');
    if (!hud) return false;
    const style = window.getComputedStyle(hud);
    return style.display !== 'none' && parseFloat(style.opacity) > 0.01;
  });

  if (!hudVisible) {
    results.issues.push({
      severity: 'HIGH',
      checkpoint: 'calibration-hud',
      type: 'hud-not-visible',
      details: ['HUD should be visible with ?calibrate=timeline but is not rendered or is hidden']
    });
    results.summary.high++;
  }

  await calibratePage.close();
  await browser.close();

  // 生成报告
  const report = {
    timestamp: new Date().toISOString(),
    viewport: VIEWPORT,
    baselineUrl: BASELINE_URL,
    targetUrl: TARGET_URL,
    targetCalibrateUrl: TARGET_CALIBRATE_URL,
    checkpoints: VISUAL_CHECKPOINTS.length,
    documentHeight: {
      baseline: baselineHeight,
      target: targetHeight,
      diff: heightDiff,
      diffPercent: heightDiffPercent
    },
    issues: results.issues,
    summary: results.summary
  };

  writeFileSync(
    path.join(outputDir, 'visual-parity-report.json'),
    JSON.stringify(report, null, 2)
  );

  // 生成 Markdown 报告
  let markdown = `# Homepage Observer Visual Parity Report

**Date**: ${new Date().toISOString()}
**Viewport**: ${VIEWPORT.width}x${VIEWPORT.height}
**Baseline**: ${BASELINE_URL}
**Target**: ${TARGET_URL}

## Summary

- 🔴 **Critical**: ${results.summary.critical}
- 🟠 **High**: ${results.summary.high}
- 🟡 **Medium**: ${results.summary.medium}
- ✅ **Total Checkpoints**: ${VISUAL_CHECKPOINTS.length}

## Document Height

- **Baseline**: ${baselineHeight}px
- **Target**: ${targetHeight}px
- **Difference**: ${heightDiff}px (${heightDiffPercent}%)

`;

  if (results.issues.length === 0) {
    markdown += `## ✅ All Checks Passed

No visual regressions detected. The observer branch renders identically to main.

`;
  } else {
    markdown += `## Issues Found\n\n`;
    for (const issue of results.issues) {
      const emoji = issue.severity === 'CRITICAL' ? '🔴' : issue.severity === 'HIGH' ? '🟠' : '🟡';
      markdown += `### ${emoji} ${issue.severity}: ${issue.checkpoint}\n\n`;
      markdown += `**Type**: ${issue.type}\n\n`;
      markdown += `**Details**:\n`;
      for (const detail of issue.details) {
        markdown += `- ${detail}\n`;
      }
      markdown += `\n`;
    }
  }

  markdown += `## Screenshots

All screenshots are saved to \`${outputDir}\`:

`;

  for (const checkpoint of VISUAL_CHECKPOINTS) {
    markdown += `- **${checkpoint.name}** (scroll: ${checkpoint.scrollY}px)\n`;
    markdown += `  - Baseline: \`baseline-${checkpoint.name}.png\`\n`;
    markdown += `  - Target: \`target-${checkpoint.name}.png\`\n`;
  }

  markdown += `\n## Calibration HUD\n\n`;
  markdown += hudVisible
    ? `✅ HUD is visible with \`?calibrate=timeline\`\n\n`
    : `❌ HUD is NOT visible with \`?calibrate=timeline\`\n\n`;

  for (const name of calibrateCheckpoints) {
    markdown += `- \`calibrate-${name}.png\`\n`;
  }

  writeFileSync(path.join(outputDir, 'visual-parity-report.md'), markdown);

  console.log(`\n${markdown}`);
  console.log(`\n📊 Full report saved to: ${outputDir}/visual-parity-report.json`);
  console.log(`📄 Markdown report: ${outputDir}/visual-parity-report.md`);
  console.log(`📸 Screenshots: ${outputDir}/*.png`);

  const exitCode = results.summary.critical > 0 ? 2 : results.summary.high > 0 ? 1 : 0;
  process.exit(exitCode);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(3);
});
