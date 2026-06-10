# Ink Effects Usage

## Markup

Use the light keyword treatment for normal emphasis:

```html
<span data-ink-reveal>共创</span>
```

Use the WebGL treatment only for large, high-impact words:

```html
<span data-ink-reveal="webgl">AI</span>
```

## Rules

- Use WebGL ink on loader, hero, section-scale headings, or one key word in a large statement.
- Use light ink for normal body keywords and card titles.
- Keep `maxWebglKeywords` at `2` unless a performance pass proves more is safe.
- Do not mark every repeated keyword on the page.
- Reduced-motion users must still see readable emphasis without animated reveal.

## Intensity Tiers

- `Subtle`: body keywords use restrained ink marks and mostly neutral type.
- `Accent`: loader and hero intro use visible jade/gold edges without becoming the main spectacle.
- `Cinematic`: scene transitions keep the strongest jade/gold glow and flash treatment.

## Current Entry Points

- Loader text reveal: `js/effects/ink-text-reveal.js`
- Hero scene transition: `js/effects/ink-scene-transition.js`
- Keyword scanner: `js/components/ink-keyword.js`
- Keyword CSS: `css/components/ink-keyword.css`
