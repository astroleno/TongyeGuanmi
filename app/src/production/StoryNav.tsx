import { publicMenuItems } from './navigation';
import { activateStaticReading } from './static-reading';
import { semanticBoolean } from '../runtime/semantic-data-attribute';
import type { SceneId } from '../story/types';
import './StoryNav.css';

export type StoryChrome = Readonly<{ tone: 'dark' | 'light' }>;

export { activateStaticReading };

export function PhoneStoryFaultActions({
  moduleFault,
  onRetry,
  onReadDirectly
}: Readonly<{ moduleFault: boolean; onRetry(): void; onReadDirectly(): void }>) {
  return (
    <div className="phone-story__fault-actions" role="group" aria-label="故事加载恢复">
      <button type="button" className="phone-story__retry" data-phone-retry="true"
        data-phone-recovery-reload={moduleFault ? 'true' : undefined} onClick={onRetry}>
        {moduleFault ? '重新加载最新版本' : '重试加载故事'}
      </button>
      <button type="button" className="phone-story__read" data-phone-read-directly="true"
        onClick={onReadDirectly}>直接阅读</button>
    </div>
  );
}

const LIGHT_SCENES = new Set<SceneId>([
  'pattern',
  'aod-animation',
  'method-top',
  'figure2-animation',
  'figure2-proof',
  'brand',
  'figure3-animation',
  'services',
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
]);

export function chromeForScene(scene: SceneId): StoryChrome {
  return { tone: LIGHT_SCENES.has(scene) ? 'light' : 'dark' };
}

export type StoryNavProps = {
  currentScene: SceneId;
  visible: boolean;
  menuOpen: boolean;
  /** A partial shell must only expose destinations it can actually render. */
  menuItems?: readonly { label: string; hash: string; scene: SceneId }[];
  showCta?: boolean;
  edgeTreatment?: 'blur' | 'gradient';
  onReadDirectly?(): void;
  onToggleMenu(): void;
  onNavigate(scene: SceneId): void;
};

export function StoryNav({
  currentScene,
  visible,
  menuOpen,
  menuItems = publicMenuItems,
  showCta = true,
  edgeTreatment = 'blur',
  onReadDirectly,
  onToggleMenu,
  onNavigate
}: StoryNavProps) {
  const chrome = chromeForScene(currentScene);
  const linkTabIndex = visible ? undefined : -1;
  const items = menuItems.filter((item) => item.scene !== 'hero');

  return (
    <>
      <nav
        className={`site-nav${edgeTreatment === 'blur' ? ' has-scroll-edge-blur' : ''}`}
        aria-label="主导航"
        aria-hidden={visible ? undefined : 'true'}
        inert={visible ? undefined : true}
        data-visible={semanticBoolean(visible)}
        data-tone={chrome.tone}
        data-menu-open={semanticBoolean(menuOpen)}
        data-edge-treatment={edgeTreatment}
      >
        <div className="site-nav-track">
          <a
            className="brand"
            href="#top"
            aria-label="同野观幂首页"
            tabIndex={linkTabIndex}
            onClick={(event) => {
              event.preventDefault();
              onNavigate('hero');
            }}
          >
            <span className="brand-mark">同</span>
            <span className="brand-text">同野观幂</span>
          </a>
          <button
            className="site-nav__action site-nav__toggle"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="story-menu"
            tabIndex={linkTabIndex}
            onClick={onToggleMenu}
          >
            菜单
          </button>
          <div id="story-menu" className="nav-links" aria-label="页面章节">
            {items.map((item) => (
              <a
                key={item.hash}
                href={item.hash}
                aria-current={currentScene === item.scene ? 'page' : undefined}
                className={currentScene === item.scene ? 'is-active' : undefined}
                tabIndex={linkTabIndex}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(item.scene);
                }}
              >
                {item.label}
              </a>
            ))}
            {onReadDirectly ? (
              <button
                className="nav-read"
                type="button"
                tabIndex={linkTabIndex}
                data-story-read-directly="true"
                onClick={onReadDirectly}
              >
                直接阅读
              </button>
            ) : null}
          </div>
          {showCta ? (
            <a
              className="site-nav__action nav-cta"
              href="#contact"
              tabIndex={linkTabIndex}
              onClick={(event) => {
                event.preventDefault();
                onNavigate('contact');
              }}
            >
              预约诊断
            </a>
          ) : null}
        </div>
      </nav>
      {visible && edgeTreatment === 'blur' ? (
        <div
          className="scroll-edge-blur"
          aria-hidden="true"
          data-visible="true"
          data-tone={chrome.tone}
        >
          {Array.from({ length: 7 }, (_, index) => (
            <span key={index} className="scroll-edge-blur__layer" />
          ))}
          <span className="scroll-edge-blur__tint" />
        </div>
      ) : null}
    </>
  );
}
