import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

type RevealTag = 'div' | 'h1' | 'p' | 'span';

export const TEXT_REVEAL_EFFECTS = ['stagger', 'blur-to-clear', 'rise-up'] as const;
export type TextRevealEffect = (typeof TEXT_REVEAL_EFFECTS)[number];

type TextRevealProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  active: boolean;
  as?: RevealTag;
  blurPx?: number;
  children: ReactNode;
  delayMs?: number;
  durationMs?: number;
  effects?: readonly TextRevealEffect[];
  scaleX?: number;
  staggerMs?: number;
  variant?: 'line' | 'staggered';
  yPx?: number;
};

type TextRevealItemProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  as?: 'span';
  children: ReactNode;
  index?: number;
};

type RevealStyle = CSSProperties & Record<`--text-reveal-${string}`, string>;

export function TextReveal({
  active,
  as: Tag = 'span',
  blurPx = 9,
  children,
  delayMs = 0,
  durationMs = 1350,
  effects = [],
  scaleX = 1,
  staggerMs = 160,
  style,
  variant = 'staggered',
  yPx = 18,
  ...props
}: TextRevealProps) {
  const effectSet = new Set(effects);
  const revealStyle: RevealStyle = {
    ...style,
    '--text-reveal-blur': `${effectSet.has('blur-to-clear') ? blurPx : 0}px`,
    '--text-reveal-delay': `${delayMs}ms`,
    '--text-reveal-duration': `${durationMs}ms`,
    '--text-reveal-scale-x': String(scaleX),
    '--text-reveal-stagger': `${effectSet.has('stagger') ? staggerMs : 0}ms`,
    '--text-reveal-y': `${effectSet.has('rise-up') ? yPx : 0}px`
  };

  return (
    <Tag
      {...props}
      data-text-reveal={variant}
      data-text-reveal-active={String(active)}
      data-text-reveal-effects={effects.join(' ')}
      style={revealStyle}
    >
      {children}
    </Tag>
  );
}

export function TextRevealItem({ as: Tag = 'span', children, index = 0, style, ...props }: TextRevealItemProps) {
  const revealStyle: RevealStyle = {
    ...style,
    '--text-reveal-index': String(index)
  };

  return (
    <Tag {...props} data-text-reveal-item={index} style={revealStyle}>
      {children}
    </Tag>
  );
}
