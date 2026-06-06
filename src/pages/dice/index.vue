<template>
  <view class="dice-page" :class="`dice-page--${activeChapter.tone}`">
    <view class="dice-page__fixed">
      <DiceArchiveKinetic
        :progress="scrollProgress"
        :velocity="scrollVelocity"
        :idle-phase="idlePhase"
        :chapter="activeChapter"
        :mode="activeMode"
        :year="selectedYear"
        :shape-intensity="shapeIntensity"
        :material-index="materialIndex"
      />
    </view>

    <view class="dice-page__topbar">
      <button class="dice-page__back" @tap="goHome" aria-label="Back">
        <text class="dice-page__back-mark">‹</text>
      </button>

      <view class="dice-page__nav" aria-label="DICE sections">
        <button
          v-for="mode in modes"
          :key="mode.id"
          class="dice-page__nav-item"
          :class="{ 'dice-page__nav-item--active': activeMode === mode.id }"
          @tap="activeMode = mode.id"
        >
          <text>{{ mode.label }}</text>
        </button>
      </view>

      <view class="dice-page__credit">
        <text>DICE.BERLIN</text>
        <text>RECREATION</text>
      </view>
    </view>

    <view class="dice-page__rail">
      <button
        v-for="(chapter, index) in chapters"
        :key="chapter.id"
        class="dice-page__rail-item"
        :class="{ 'dice-page__rail-item--active': activeChapter.id === chapter.id }"
        @tap="scrollToChapter(index)"
      >
        <text class="dice-page__rail-index">{{ chapter.nav }}</text>
        <text class="dice-page__rail-label">{{ chapter.short }}</text>
      </button>
    </view>

    <view class="dice-page__deck">
      <view class="dice-page__chapter-meta">
        <text class="dice-page__eyeline">{{ activeChapter.kicker }}</text>
        <text class="dice-page__headline">{{ activeChapter.title }}</text>
        <text class="dice-page__summary">{{ activeChapter.summary }}</text>
      </view>

      <view class="dice-page__mode-panel">
        <view v-if="activeMode === 'archive'" class="dice-panel dice-panel--archive">
          <view class="dice-panel__stats">
            <view v-for="stat in archiveStats" :key="stat.label" class="dice-panel__stat">
              <text class="dice-panel__stat-value">{{ stat.value }}</text>
              <text class="dice-panel__stat-label">{{ stat.label }}</text>
            </view>
          </view>

          <view class="dice-panel__log">
            <view v-for="item in activeChapter.notes" :key="item" class="dice-panel__log-row">
              <text>{{ item }}</text>
            </view>
          </view>
        </view>

        <view v-else-if="activeMode === 'program'" class="dice-panel dice-panel--program">
          <view class="dice-panel__tabs">
            <button
              v-for="year in years"
              :key="year"
              class="dice-panel__tab"
              :class="{ 'dice-panel__tab--active': selectedYear === year }"
              @tap="selectedYear = year"
            >
              <text>{{ year }}</text>
            </button>
          </view>

          <view class="dice-panel__program">
            <view v-for="slot in selectedProgram" :key="slot.time" class="dice-panel__slot">
              <text class="dice-panel__slot-time">{{ slot.time }}</text>
              <view class="dice-panel__slot-copy">
                <text class="dice-panel__slot-title">{{ slot.title }}</text>
                <text class="dice-panel__slot-meta">{{ slot.meta }}</text>
              </view>
            </view>
          </view>
        </view>

        <view v-else-if="activeMode === 'tool'" class="dice-panel dice-panel--tool">
          <view class="dice-tool">
            <view class="dice-tool__row">
              <text class="dice-tool__label">Shape force</text>
              <view class="dice-tool__steps">
                <button
                  v-for="level in intensityLevels"
                  :key="level"
                  class="dice-tool__step"
                  :class="{ 'dice-tool__step--active': shapeIntensity === level }"
                  @tap="shapeIntensity = level"
                >
                  <text>{{ level }}</text>
                </button>
              </view>
            </view>

            <view class="dice-tool__row">
              <text class="dice-tool__label">Material pass</text>
              <view class="dice-tool__swatches">
                <button
                  v-for="(material, index) in materials"
                  :key="material.label"
                  class="dice-tool__swatch"
                  :class="{ 'dice-tool__swatch--active': materialIndex === index }"
                  :style="{ background: material.color }"
                  :aria-label="material.label"
                  @tap="materialIndex = index"
                />
              </view>
            </view>

            <view class="dice-tool__exports">
              <button class="dice-tool__export" @tap="markExport('Poster')">
                <text>Poster</text>
              </button>
              <button class="dice-tool__export" @tap="markExport('Motion')">
                <text>Motion</text>
              </button>
              <button class="dice-tool__export" @tap="markExport('Still')">
                <text>Still</text>
              </button>
            </view>

            <text class="dice-tool__status">{{ exportStatus }}</text>
          </view>
        </view>

        <view v-else class="dice-panel dice-panel--media">
          <view class="dice-media">
            <view class="dice-media__video">
              <!-- #ifdef H5 -->
              <video
                class="dice-media__video-node"
                :src="referenceVideo"
                :poster="activeFrame.src"
                muted
                loop
                autoplay
                playsinline
                controls
              />
              <!-- #endif -->
              <!-- #ifndef H5 -->
              <image class="dice-media__video-node" :src="activeFrame.src" mode="aspectFill" />
              <!-- #endif -->
            </view>

            <view class="dice-media__frames">
              <button
                v-for="frame in frames"
                :key="frame.id"
                class="dice-media__frame"
                :class="{ 'dice-media__frame--active': activeFrame.id === frame.id }"
                @tap="activeFrameId = frame.id"
              >
                <image :src="frame.src" mode="aspectFill" />
              </button>
            </view>
          </view>
        </view>
      </view>
    </view>

    <view class="dice-page__scroll">
      <view
        v-for="chapter in chapters"
        :key="chapter.id"
        class="dice-page__marker"
      >
        <text class="dice-page__marker-kicker">{{ chapter.kicker }}</text>
        <text class="dice-page__marker-title">{{ chapter.title }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onPageScroll, onReady, onResize } from '@dcloudio/uni-app'
import DiceArchiveKinetic from '@/components/fx/DiceArchiveKinetic.vue'

type DiceTone = 'archive' | 'programme' | 'gallery' | 'future'
type DiceMode = 'archive' | 'program' | 'tool' | 'media'

type DiceChapter = {
  id: string
  nav: string
  short: string
  kicker: string
  title: string
  meta: string
  summary: string
  notes: string[]
  tone: DiceTone
}

const chapters: DiceChapter[] = [
  {
    id: 'identity',
    nav: '01',
    short: 'Identity',
    kicker: 'DICE ARCHIVE',
    title: '2018-2022',
    meta: 'DICE ARCHIVE 2018-2022',
    summary: 'A Berlin festival and conference archive rebuilt around a fluid sculptural identity, oversized custom type and scroll-driven motion.',
    notes: [
      'WordPress publishing layer',
      'Three.js / WebGL motion system',
      'Sculptural shape exported for posters and recordings'
    ],
    tone: 'archive'
  },
  {
    id: 'season',
    nav: '02',
    short: 'Season',
    kicker: 'OCTOBER 2021-',
    title: 'MARCH 2022',
    meta: 'DICE ARCHIVE 2018-2022',
    summary: 'A rolling programme surface for lineups, conversations, workshops and hybrid cultural moments across the Berlin season.',
    notes: [
      'Festival calendar and archive entries',
      'Large year titles and compressed detail rows',
      'Motion palette tuned per season'
    ],
    tone: 'archive'
  },
  {
    id: 'lookback',
    nav: '03',
    short: 'Look back',
    kicker: 'DICE 2019',
    title: 'A LOOK BACK',
    meta: 'DICE 2019 - A LOOK BACK',
    summary: 'A gallery rhythm that treats each year as a color and material study, with image fragments orbiting the central object.',
    notes: [
      'Year-by-year archive pages',
      'Compressed recap and media stills',
      'Editorial typography against vivid field color'
    ],
    tone: 'gallery'
  },
  {
    id: 'programme',
    nav: '04',
    short: 'Program',
    kicker: 'DICE 2018',
    title: 'PROGRAMME',
    meta: 'DICE 2018 - PROGRAMME',
    summary: 'Programme listings appear as a live index instead of static cards: time, venue and session title stay close to the kinetic stage.',
    notes: [
      'Conference slots and performance blocks',
      'Information-dense but low chrome',
      'Archive navigation remains visible while scrolling'
    ],
    tone: 'programme'
  },
  {
    id: 'tool',
    nav: '05',
    short: 'Tool',
    kicker: 'DICE TOOL',
    title: 'SHAPE EXPORT',
    meta: 'HIGH RESOLUTION EXPORT TOOL',
    summary: 'A reconstructed version of the original in-browser tool idea: tune force, material and output type while the sculpture mutates.',
    notes: [
      'Poster, still and motion output modes',
      'Material swatches drive the WebGL shader palette',
      'The exported feeling is simulated in-app'
    ],
    tone: 'future'
  }
]

const modes: Array<{ id: DiceMode; label: string }> = [
  { id: 'archive', label: 'Archive' },
  { id: 'program', label: 'Program' },
  { id: 'tool', label: 'Tool' },
  { id: 'media', label: 'Media' }
]

const years = ['2022', '2021', '2019', '2018']
const programByYear: Record<string, Array<{ time: string; title: string; meta: string }>> = {
  '2022': [
    { time: '18:00', title: 'Opening voices', meta: 'Conference hall - keynote' },
    { time: '20:30', title: 'Club futures', meta: 'Panel - live stream' },
    { time: '23:00', title: 'Late programme', meta: 'Performance - Berlin' }
  ],
  '2021': [
    { time: '16:00', title: 'Independent labels', meta: 'Roundtable' },
    { time: '19:00', title: 'Embodied networks', meta: 'Workshop' },
    { time: '21:30', title: 'Archive listening room', meta: 'Screening' }
  ],
  '2019': [
    { time: '14:00', title: 'A look back', meta: 'Gallery sequence' },
    { time: '17:30', title: 'Artist economies', meta: 'Talk' },
    { time: '22:00', title: 'Performance night', meta: 'Main stage' }
  ],
  '2018': [
    { time: '13:00', title: 'Programme launch', meta: 'Conference' },
    { time: '18:00', title: 'New cultural tools', meta: 'Discussion' },
    { time: '21:00', title: 'Opening party', meta: 'Festival' }
  ]
}

const archiveStats = [
  { value: '4', label: 'archive years' },
  { value: '5', label: 'morph scenes' },
  { value: '1', label: 'shape system' }
]

const frames = [
  { id: 'frame-01', src: '/static/dice-berlin/frame-01.jpg' },
  { id: 'frame-02', src: '/static/dice-berlin/frame-02.jpg' },
  { id: 'frame-03', src: '/static/dice-berlin/frame-03.jpg' },
  { id: 'frame-04', src: '/static/dice-berlin/frame-04.jpg' }
]

const intensityLevels = [1, 2, 3, 4, 5]
const materials = [
  { label: 'mint', color: '#58dc9f' },
  { label: 'ink', color: '#111611' },
  { label: 'coral', color: '#ff5f78' },
  { label: 'amber', color: '#ffc438' }
]
const referenceVideo = 'https://videos.ctfassets.net/d5ayvrj0vsak/1i1AqeKIWB345PJECsuXr5/3524d8838b578eee711e27c44f05a32a/DICE.mp4'

const scrollTop = ref(0)
const scrollProgress = ref(0)
const scrollVelocity = ref(0)
const idlePhase = ref(0)
const viewportHeight = ref(667)
const activeMode = ref<DiceMode>('archive')
const selectedYear = ref('2022')
const shapeIntensity = ref(3)
const materialIndex = ref(0)
const activeFrameId = ref('frame-03')
const exportStatus = ref('Ready for high resolution output')

const pageHeight = computed(() => Math.max(1, viewportHeight.value * (chapters.length - 1)))
const activeIndex = computed(() => Math.min(chapters.length - 1, Math.max(0, Math.round(scrollProgress.value * (chapters.length - 1)))))
const activeChapter = computed(() => chapters[activeIndex.value])
const selectedProgram = computed(() => programByYear[selectedYear.value] || programByYear['2022'])
const activeFrame = computed(() => frames.find((frame) => frame.id === activeFrameId.value) || frames[0])

let lastScrollTop = 0
let lastScrollAt = Date.now()
let timer: ReturnType<typeof setInterval> | null = null

watch(activeIndex, (index) => {
  if (index === chapters.length - 1) {
    activeMode.value = 'tool'
    return
  }

  if (index === 2 && activeMode.value === 'archive') activeMode.value = 'media'
  if (index === 3 && activeMode.value === 'archive') activeMode.value = 'program'
})

onMounted(() => {
  refreshViewport()
  startIdleLoop()
  // #ifdef H5
  window.addEventListener('scroll', handleH5Scroll, { passive: true })
  // #endif
})

onReady(refreshViewport)
onResize(refreshViewport)
onBeforeUnmount(() => {
  stopIdleLoop()
  // #ifdef H5
  window.removeEventListener('scroll', handleH5Scroll)
  // #endif
})

onPageScroll((event) => {
  updateScroll(Number(event.scrollTop || 0))
})

function updateScroll(rawTop: number) {
  const nextTop = Math.max(0, rawTop)
  const now = Date.now()
  const elapsed = Math.max(16, now - lastScrollAt)
  const delta = nextTop - lastScrollTop

  scrollTop.value = nextTop
  scrollProgress.value = clamp(nextTop / pageHeight.value)
  scrollVelocity.value = clamp(delta / elapsed * 18, -84, 84)
  lastScrollTop = nextTop
  lastScrollAt = now
}

function handleH5Scroll() {
  updateScroll(window.scrollY || document.documentElement.scrollTop || 0)
}

function startIdleLoop() {
  stopIdleLoop()
  timer = setInterval(() => {
    idlePhase.value = (idlePhase.value + 0.035) % 1000
    scrollVelocity.value *= 0.86
    if (Math.abs(scrollVelocity.value) < 0.08) {
      scrollVelocity.value = 0
    }
  }, 50)
}

function stopIdleLoop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function refreshViewport() {
  try {
    const info = uni.getSystemInfoSync()
    viewportHeight.value = Math.max(520, Number(info.windowHeight || 667))
  } catch (err) {
    viewportHeight.value = 667
  }
}

function scrollToChapter(index: number) {
  const target = Math.max(0, Math.min(chapters.length - 1, index)) * viewportHeight.value
  uni.pageScrollTo({
    scrollTop: target,
    duration: 420
  })
}

function markExport(kind: string) {
  exportStatus.value = `${kind} export staged - force ${shapeIntensity.value}, ${materials[materialIndex.value].label}`
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value || 0))
}

function goHome() {
  uni.redirectTo({ url: '/pages/index/index' })
}
</script>

<style scoped lang="scss">
.dice-page {
  position: relative;
  min-height: 560vh;
  color: #111611;
  background: #eceed8;
}

.dice-page__fixed {
  position: fixed;
  inset: 0;
  z-index: 1;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.dice-page__topbar {
  position: fixed;
  top: calc(var(--safe-top) + 18rpx);
  left: 22rpx;
  right: 22rpx;
  z-index: 20;
  display: grid;
  grid-template-columns: 56rpx minmax(0, 1fr) auto;
  align-items: start;
  gap: 18rpx;
  pointer-events: none;
}

.dice-page__back,
.dice-page__nav-item,
.dice-page__rail-item,
.dice-panel__tab,
.dice-tool__step,
.dice-tool__swatch,
.dice-tool__export,
.dice-media__frame {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  line-height: 1;
  background: transparent;
}

.dice-page__back::after,
.dice-page__nav-item::after,
.dice-page__rail-item::after,
.dice-panel__tab::after,
.dice-tool__step::after,
.dice-tool__swatch::after,
.dice-tool__export::after,
.dice-media__frame::after {
  display: none;
}

.dice-page__back {
  width: 54rpx;
  height: 54rpx;
  border: 1rpx solid rgba(17, 22, 17, .22);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #111611;
  background: rgba(236, 238, 216, .58);
  pointer-events: auto;
}

.dice-page__back-mark {
  transform: translateY(-2rpx);
  font-size: 42rpx;
  font-weight: 300;
  line-height: 1;
}

.dice-page__nav {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1rpx solid rgba(17, 22, 17, .28);
  pointer-events: auto;
}

.dice-page__nav-item {
  min-height: 54rpx;
  padding-top: 12rpx;
  color: rgba(17, 22, 17, .54);
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 0;
  text-align: left;
  text-transform: uppercase;
}

.dice-page__nav-item--active {
  color: #111611;
}

.dice-page__credit {
  min-width: 132rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6rpx;
  color: rgba(17, 22, 17, .68);
  font-size: 16rpx;
  font-weight: 700;
  line-height: 1;
  text-align: right;
}

.dice-page__rail {
  position: fixed;
  left: 24rpx;
  top: 18vh;
  z-index: 18;
  width: 124rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  pointer-events: auto;
}

.dice-page__rail-item {
  min-height: 48rpx;
  display: grid;
  grid-template-columns: 34rpx minmax(0, 1fr);
  align-items: center;
  gap: 10rpx;
  color: rgba(17, 22, 17, .46);
  text-align: left;
}

.dice-page__rail-item--active {
  color: #111611;
}

.dice-page__rail-index {
  font-size: 16rpx;
  font-weight: 800;
  line-height: 1;
}

.dice-page__rail-label {
  overflow: hidden;
  font-size: 18rpx;
  font-weight: 650;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.dice-page__deck {
  position: fixed;
  left: 24rpx;
  right: 24rpx;
  bottom: 28rpx;
  z-index: 16;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 336rpx;
  gap: 28rpx;
  align-items: end;
  pointer-events: none;
}

.dice-page__chapter-meta,
.dice-page__mode-panel {
  pointer-events: auto;
}

.dice-page__chapter-meta {
  max-width: 456rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.dice-page__eyeline {
  color: rgba(17, 22, 17, .68);
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.dice-page__headline {
  color: #58dc9f;
  font-size: 76rpx;
  font-weight: 520;
  line-height: .86;
  text-transform: uppercase;
}

.dice-page--programme .dice-page__headline,
.dice-page--future .dice-page__headline {
  color: #111611;
}

.dice-page--gallery .dice-page__headline {
  color: rgba(255, 255, 255, .96);
}

.dice-page__summary {
  max-width: 420rpx;
  color: rgba(17, 22, 17, .72);
  font-size: 22rpx;
  font-weight: 550;
  line-height: 1.25;
}

.dice-page--gallery .dice-page__summary,
.dice-page--gallery .dice-page__eyeline,
.dice-page--gallery .dice-page__credit,
.dice-page--gallery .dice-page__nav-item,
.dice-page--gallery .dice-page__rail-item {
  color: rgba(255, 255, 255, .76);
}

.dice-page--gallery .dice-page__nav-item--active,
.dice-page--gallery .dice-page__rail-item--active {
  color: #ffffff;
}

.dice-page--gallery .dice-page__back {
  color: #ffffff;
  border-color: rgba(255, 255, 255, .34);
  background: rgba(20, 75, 50, .32);
}

.dice-page--gallery .dice-page__nav {
  border-top-color: rgba(255, 255, 255, .32);
}

.dice-page--gallery .dice-page__summary {
  color: rgba(255, 255, 255, .84);
}

.dice-page__mode-panel {
  min-height: 326rpx;
}

.dice-panel {
  min-height: 326rpx;
  padding: 18rpx;
  border: 1rpx solid rgba(17, 22, 17, .20);
  background: rgba(236, 238, 216, .42);
  backdrop-filter: blur(14px);
}

.dice-page--gallery .dice-panel {
  border-color: rgba(255, 255, 255, .26);
  background: rgba(37, 104, 68, .38);
}

.dice-panel__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.dice-panel__stat {
  min-height: 78rpx;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-top: 1rpx solid currentColor;
  color: rgba(17, 22, 17, .76);
}

.dice-page--gallery .dice-panel__stat,
.dice-page--gallery .dice-panel__log-row,
.dice-page--gallery .dice-panel__slot,
.dice-page--gallery .dice-tool,
.dice-page--gallery .dice-tool__status {
  color: rgba(255, 255, 255, .86);
}

.dice-panel__stat-value {
  padding-top: 8rpx;
  font-size: 34rpx;
  font-weight: 540;
  line-height: 1;
}

.dice-panel__stat-label {
  padding-bottom: 2rpx;
  font-size: 15rpx;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.dice-panel__log {
  margin-top: 18rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.dice-panel__log-row {
  padding-top: 10rpx;
  border-top: 1rpx solid rgba(17, 22, 17, .16);
  color: rgba(17, 22, 17, .72);
  font-size: 18rpx;
  font-weight: 620;
  line-height: 1.18;
}

.dice-panel__tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8rpx;
}

.dice-panel__tab {
  height: 42rpx;
  border-bottom: 1rpx solid rgba(17, 22, 17, .22);
  color: rgba(17, 22, 17, .50);
  font-size: 18rpx;
  font-weight: 800;
  text-align: left;
}

.dice-panel__tab--active {
  color: #111611;
  border-bottom-color: #111611;
}

.dice-panel__program {
  margin-top: 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.dice-panel__slot {
  display: grid;
  grid-template-columns: 62rpx minmax(0, 1fr);
  gap: 12rpx;
  color: rgba(17, 22, 17, .78);
}

.dice-panel__slot-time {
  padding-top: 4rpx;
  font-size: 18rpx;
  font-weight: 850;
  line-height: 1;
}

.dice-panel__slot-copy {
  display: flex;
  flex-direction: column;
  gap: 5rpx;
}

.dice-panel__slot-title {
  font-size: 22rpx;
  font-weight: 680;
  line-height: 1.08;
  text-transform: uppercase;
}

.dice-panel__slot-meta {
  color: currentColor;
  opacity: .68;
  font-size: 16rpx;
  font-weight: 620;
  line-height: 1.1;
}

.dice-tool {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  color: rgba(17, 22, 17, .80);
}

.dice-tool__row {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.dice-tool__label {
  font-size: 18rpx;
  font-weight: 800;
  line-height: 1;
  text-transform: uppercase;
}

.dice-tool__steps {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6rpx;
}

.dice-tool__step {
  height: 44rpx;
  border: 1rpx solid rgba(17, 22, 17, .24);
  color: currentColor;
  font-size: 18rpx;
  font-weight: 800;
}

.dice-tool__step--active {
  color: #eceed8;
  background: #111611;
}

.dice-tool__swatches {
  display: grid;
  grid-template-columns: repeat(4, 44rpx);
  gap: 10rpx;
}

.dice-tool__swatch {
  width: 44rpx;
  height: 44rpx;
  border: 2rpx solid rgba(17, 22, 17, .18);
}

.dice-tool__swatch--active {
  border-color: #111611;
  box-shadow: 0 0 0 4rpx rgba(17, 22, 17, .10);
}

.dice-tool__exports {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8rpx;
}

.dice-tool__export {
  height: 46rpx;
  border: 1rpx solid rgba(17, 22, 17, .28);
  color: currentColor;
  font-size: 16rpx;
  font-weight: 800;
  text-transform: uppercase;
}

.dice-tool__status {
  min-height: 34rpx;
  color: rgba(17, 22, 17, .62);
  font-size: 16rpx;
  font-weight: 700;
  line-height: 1.15;
}

.dice-media {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.dice-media__video {
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  background: rgba(17, 22, 17, .18);
}

.dice-media__video-node {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.dice-media__frames {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8rpx;
}

.dice-media__frame {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border: 2rpx solid transparent;
  opacity: .66;
}

.dice-media__frame image {
  width: 100%;
  height: 100%;
  display: block;
}

.dice-media__frame--active {
  border-color: #111611;
  opacity: 1;
}

.dice-page__scroll {
  position: relative;
  z-index: 2;
  min-height: 560vh;
  padding-top: 72vh;
  pointer-events: none;
}

.dice-page__marker {
  height: 100vh;
  padding: 0 36rpx 118rpx;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8rpx;
  opacity: .001;
}

.dice-page__marker-kicker,
.dice-page__marker-title {
  color: #111611;
  line-height: .9;
  text-transform: uppercase;
}

.dice-page__marker-kicker {
  font-size: 26rpx;
  font-weight: 700;
}

.dice-page__marker-title {
  font-size: 72rpx;
  font-weight: 500;
}

@media (max-width: 520px) {
  .dice-page__topbar {
    grid-template-columns: 54rpx minmax(0, 1fr);
  }

  .dice-page__credit {
    display: none;
  }

  .dice-page__rail {
    top: 16vh;
    width: 42rpx;
  }

  .dice-page__rail-label {
    display: none;
  }

  .dice-page__deck {
    grid-template-columns: 1fr;
    gap: 16rpx;
  }

  .dice-page__chapter-meta {
    max-width: 650rpx;
    padding-left: 60rpx;
  }

  .dice-page__headline {
    font-size: 64rpx;
  }

  .dice-page__summary {
    max-width: 550rpx;
    font-size: 20rpx;
  }

  .dice-page__mode-panel {
    min-height: 288rpx;
  }

  .dice-panel {
    min-height: 288rpx;
    padding: 14rpx;
  }
}

@media (min-width: 900px) {
  .dice-page__topbar {
    left: 48px;
    right: 48px;
    grid-template-columns: 40px minmax(0, 1fr) 140px;
    gap: 24px;
  }

  .dice-page__back {
    width: 32px;
    height: 32px;
  }

  .dice-page__back-mark {
    font-size: 28px;
  }

  .dice-page__nav-item {
    min-height: 44px;
    padding-top: 11px;
    font-size: 10px;
  }

  .dice-page__credit {
    font-size: 9px;
  }

  .dice-page__rail {
    left: 12px;
    width: 136px;
  }

  .dice-page__rail-index,
  .dice-page__rail-label {
    font-size: 10px;
  }

  .dice-page__deck {
    left: 12px;
    right: 12px;
    bottom: 14px;
    grid-template-columns: minmax(360px, 460px) 420px;
    gap: 36px;
  }

  .dice-page__eyeline {
    font-size: 14px;
  }

  .dice-page__headline {
    font-size: 42px;
  }

  .dice-page__summary {
    max-width: 380px;
    font-size: 13px;
    line-height: 1.22;
  }

  .dice-page__mode-panel {
    min-height: 220px;
  }

  .dice-panel {
    min-height: 220px;
    padding: 18px;
  }

  .dice-panel__stat-value {
    font-size: 28px;
  }

  .dice-panel__stat-label,
  .dice-panel__log-row,
  .dice-panel__slot-time,
  .dice-panel__slot-meta,
  .dice-tool__status {
    font-size: 11px;
  }

  .dice-panel__slot-title,
  .dice-tool__label {
    font-size: 14px;
  }

  .dice-tool__step,
  .dice-tool__export,
  .dice-panel__tab {
    font-size: 12px;
  }
}
</style>
