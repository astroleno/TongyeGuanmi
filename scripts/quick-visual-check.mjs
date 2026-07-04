#!/usr/bin/env node
import { chromium } from 'playwright';

async function checkTransitions() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  console.log('\n=== 开始检查转场问题 ===\n');

  const issues = [];

  // 1. 检查 hero → pattern 状态
  console.log('1. 检查 hero → pattern...');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 0.5));
  await page.waitForTimeout(1000);

  const patternState = await page.evaluate(() => {
    const pattern = document.querySelector('[data-scene-id="pattern-bloom"]');
    const isVisible = pattern && !pattern.hidden;
    const computedStyle = pattern ? window.getComputedStyle(pattern) : null;
    return {
      exists: !!pattern,
      visible: isVisible,
      opacity: computedStyle?.opacity,
      display: computedStyle?.display
    };
  });

  console.log('   Pattern 状态:', patternState);
  if (!patternState.visible) {
    issues.push('❌ Pattern 不可见');
  }

  // 2. 检查 pattern → star-map
  console.log('\n2. 检查 pattern → star-map...');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await page.waitForTimeout(1500);

  const starmapState = await page.evaluate(() => {
    const starmap = document.querySelector('[data-scene-id="belief-star"]');
    const canvas = document.querySelector('[data-belief-star-field]');
    const computedStyle = starmap ? window.getComputedStyle(starmap) : null;
    return {
      exists: !!starmap,
      visible: starmap && !starmap.hidden,
      height: computedStyle?.height,
      canvasExists: !!canvas,
      canvasHeight: canvas ? window.getComputedStyle(canvas).height : null
    };
  });

  console.log('   Star-map 状态:', starmapState);
  if (starmapState.height && parseInt(starmapState.height) > window.innerHeight) {
    issues.push('❌ Star-map 高度超过 100vh');
  }

  // 3. 检查 AOD 转场
  console.log('\n3. 检查 star-map → AOD...');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2.5));
  await page.waitForTimeout(2000);

  const aodState = await page.evaluate(() => {
    const aod = document.querySelector('[data-scene-id="aod-animation"]');
    const video = aod?.querySelector('video');
    return {
      exists: !!aod,
      visible: aod && !aod.hidden,
      videoExists: !!video,
      videoPlaying: video ? !video.paused : false,
      currentTime: video?.currentTime
    };
  });

  console.log('   AOD 状态:', aodState);

  // 4. 检查 belief copy 位置
  const beliefCopy = await page.evaluate(() => {
    const copy = document.querySelector('.belief-copy-wrap');
    if (!copy) return null;
    const rect = copy.getBoundingClientRect();
    const aod = document.querySelector('[data-scene-id="aod-animation"]');
    const aodRect = aod?.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      aodTop: aodRect?.top,
      aodBottom: aodRect?.bottom,
      overlapping: aodRect && rect.bottom > aodRect.top && rect.top < aodRect.bottom
    };
  });

  console.log('   Belief copy 位置:', beliefCopy);
  if (beliefCopy?.overlapping) {
    issues.push('❌ Belief 文案与 AOD 重叠');
  }

  // 5. 检查 Figure2
  console.log('\n5. 检查 Figure2...');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 5));
  await page.waitForTimeout(2000);

  const figure2State = await page.evaluate(() => {
    const figure2 = document.querySelector('[data-scene-id="figure2-animation"]');
    const video = figure2?.querySelector('video');
    return {
      exists: !!figure2,
      visible: figure2 && !figure2.hidden,
      videoExists: !!video,
      videoPlaying: video ? !video.paused : false,
      currentTime: video?.currentTime
    };
  });

  console.log('   Figure2 状态:', figure2State);
  if (figure2State.videoExists && !figure2State.videoPlaying) {
    issues.push('❌ Figure2 视频未播放');
  }

  // 6. 检查 services 背景色
  console.log('\n6. 检查 Services...');
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 8));
  await page.waitForTimeout(1500);

  const servicesState = await page.evaluate(() => {
    const services = document.querySelector('[data-scene-id="services"]');
    const computedStyle = services ? window.getComputedStyle(services) : null;
    return {
      exists: !!services,
      visible: services && !services.hidden,
      backgroundColor: computedStyle?.backgroundColor
    };
  });

  console.log('   Services 状态:', servicesState);

  // 7. 检查 contact 背景色
  console.log('\n7. 检查 Contact...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  const contactState = await page.evaluate(() => {
    const contact = document.querySelector('[data-scene-id="contact"]');
    const section = document.querySelector('#contact');
    const computedStyle = section ? window.getComputedStyle(section) : null;
    return {
      exists: !!contact,
      visible: contact && !contact.hidden,
      backgroundColor: computedStyle?.backgroundColor,
      theme: section?.dataset.sectionTheme
    };
  });

  console.log('   Contact 状态:', contactState);
  if (contactState.theme === 'light' && contactState.backgroundColor?.includes('7, 17, 14')) {
    issues.push('❌ Contact 背景色是深色（应该是浅色）');
  }

  // 总结
  console.log('\n=== 问题总结 ===\n');
  if (issues.length === 0) {
    console.log('✅ 未发现明显问题');
  } else {
    issues.forEach(issue => console.log(issue));
  }

  console.log('\n按 Ctrl+C 关闭浏览器...');
  await page.waitForTimeout(30000);

  await browser.close();
}

checkTransitions().catch(console.error);
