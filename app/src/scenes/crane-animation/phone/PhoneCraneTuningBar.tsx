import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import './PhoneCraneTuningBar.css';

type PhoneCraneTuning = Readonly<{
  flockScale: number;
  flockY: number;
  buildingY: number;
}>;

const STORAGE_KEY = 'r5-phone-crane-tuning-v1';

export const DEFAULT_PHONE_CRANE_TUNING: PhoneCraneTuning = {
  flockScale: 1,
  flockY: 0,
  buildingY: 0
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normaliseTuning = (
  value: Partial<PhoneCraneTuning>
): PhoneCraneTuning => ({
  flockScale: clamp(Number(value.flockScale) || 1, 0.7, 1.4),
  flockY: clamp(Number(value.flockY) || 0, -25, 25),
  buildingY: clamp(Number(value.buildingY) || 0, -25, 25)
});

const readStoredTuning = (): PhoneCraneTuning => {
  if (typeof window === 'undefined') return DEFAULT_PHONE_CRANE_TUNING;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored
      ? normaliseTuning(JSON.parse(stored) as Partial<PhoneCraneTuning>)
      : DEFAULT_PHONE_CRANE_TUNING;
  } catch {
    return DEFAULT_PHONE_CRANE_TUNING;
  }
};

export const formatPhoneCraneTuning = ({
  flockScale,
  flockY,
  buildingY
}: PhoneCraneTuning) =>
  `flockScale=${flockScale.toFixed(3)}, flockY=${flockY.toFixed(2)}vh, buildingY=${buildingY.toFixed(2)}vh`;

export function PhoneCraneTuningBar() {
  const panelRef = useRef<HTMLElement>(null);
  const ownerRef = useRef<HTMLElement | null>(null);
  const summaryRef = useRef<HTMLInputElement>(null);
  const [tuning, setTuning] = useState<PhoneCraneTuning>(readStoredTuning);
  const [copied, setCopied] = useState(false);
  const summary = useMemo(() => formatPhoneCraneTuning(tuning), [tuning]);

  useLayoutEffect(() => {
    const owner =
      ownerRef.current ??
      panelRef.current?.closest<HTMLElement>('.phone-lab-contact') ??
      document.querySelector<HTMLElement>('.phone-lab-contact') ??
      null;
    ownerRef.current = owner;
    if (!owner) return;

    owner.style.setProperty(
      '--phone-crane-tune-flock-scale',
      tuning.flockScale.toFixed(3)
    );
    owner.style.setProperty(
      '--phone-crane-tune-flock-y',
      `${tuning.flockY.toFixed(2)}lvh`
    );
    owner.style.setProperty(
      '--phone-crane-tune-building-y',
      `${tuning.buildingY.toFixed(2)}lvh`
    );

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
    } catch {
      // Live controls remain usable when private browsing blocks storage.
    }
  }, [tuning]);

  useEffect(
    () => () => {
      const owner = ownerRef.current;
      owner?.style.removeProperty('--phone-crane-tune-flock-scale');
      owner?.style.removeProperty('--phone-crane-tune-flock-y');
      owner?.style.removeProperty('--phone-crane-tune-building-y');
    },
    []
  );

  const update = useCallback(
    (key: keyof PhoneCraneTuning, value: number) => {
      setCopied(false);
      setTuning((current) => normaliseTuning({ ...current, [key]: value }));
    },
    []
  );

  const copySummary = useCallback(() => {
    const fallbackCopy = () => {
      summaryRef.current?.select();
      try {
        setCopied(document.execCommand('copy'));
      } catch {
        setCopied(false);
      }
    };

    if (!window.navigator.clipboard?.writeText) {
      fallbackCopy();
      return;
    }

    void window.navigator.clipboard.writeText(summary).then(
      () => setCopied(true),
      fallbackCopy
    );
  }, [summary]);

  return (
    <aside
      ref={panelRef}
      className="phone-crane-tuning-bar"
      aria-label="Crane 手机构图调参"
      data-phone-crane-tuning-bar="true"
    >
      <div className="phone-crane-tuning-bar__title">
        <strong>Crane 构图</strong>
        <button
          type="button"
          onClick={() => setTuning(DEFAULT_PHONE_CRANE_TUNING)}
        >
          重置
        </button>
      </div>

      <label>
        <span>鹤群缩放</span>
        <input
          aria-label="鹤群缩放"
          type="range"
          min="0.7"
          max="1.4"
          step="0.005"
          value={tuning.flockScale}
          onChange={(event) =>
            update('flockScale', event.currentTarget.valueAsNumber)
          }
        />
        <output>{tuning.flockScale.toFixed(3)}</output>
      </label>

      <label>
        <span>鹤群 Y</span>
        <input
          aria-label="鹤群 Y"
          type="range"
          min="-25"
          max="25"
          step="0.25"
          value={tuning.flockY}
          onChange={(event) =>
            update('flockY', event.currentTarget.valueAsNumber)
          }
        />
        <output>{tuning.flockY.toFixed(2)}vh</output>
      </label>

      <label>
        <span>建筑 Y</span>
        <input
          aria-label="建筑 Y"
          type="range"
          min="-25"
          max="25"
          step="0.25"
          value={tuning.buildingY}
          onChange={(event) =>
            update('buildingY', event.currentTarget.valueAsNumber)
          }
        />
        <output>{tuning.buildingY.toFixed(2)}vh</output>
      </label>

      <div className="phone-crane-tuning-bar__result">
        <input
          ref={summaryRef}
          aria-label="Crane 参数"
          type="text"
          readOnly
          value={summary}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" onClick={copySummary}>
          {copied ? '已复制' : '复制参数'}
        </button>
      </div>
    </aside>
  );
}
