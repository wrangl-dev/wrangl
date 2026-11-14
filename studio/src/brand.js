// Single source for the Wrangl mark. Every asset (Remotion stills, site SVGs, app icon,
// the in-app mark) is drawn from these paths, so they can never drift apart.

// Black and white only (user call, 2026-11-13).
export const INK = '#0A0A0A'
export const WHITE = '#FFFFFF'

// "W_": slanted solid blocks forming a W plus the cursor. Traced from the user's
// chosen artwork (studio/reference-gpt.png, 98.7% pixel overlap before corner
// rounding). Filled shapes, not strokes. Wide mark: 1012 x 339.
export const MARK_W = 1012
export const MARK_H = 339
export const MARK_VIEWBOX = `0 0 ${MARK_W} ${MARK_H}`
export const MARK_PATHS = [
  'M163 8.1 Q167 0 176 0 L324 0 Q333 0 328.9 8 L167 324 L411.5 7.1 Q417 0 426 0 L589 0 Q598 0 592.6 7.2 L346.4 331.8 Q341 339 332 339 L9 339 Q0 339 4 330.9Z',
  'M462.6 229.8 Q461 221 466.4 213.8 L590.3 50.6 Q593 47 597.5 47 L598.5 47 Q603 47 603.7 51.5 L619 153 L719.9 7.4 Q725 0 734 0 L882 0 Q891 0 886 7.5 L669 331.5 Q664 339 655 339 L492 339 Q483 339 481.4 330.2Z',
  'M763 282.5 Q768 275 777 275 L1003 275 Q1012 275 1007.3 282.7 L977.7 331.3 Q973 339 964 339 L734 339 Q725 339 730 331.5Z'
]

// Tile: rounded square, mark spans 76% of its width, centred.
export const TILE_RADIUS = 0.23
export const TILE_MARK_WIDTH = 0.76

const pathTags = (color) => MARK_PATHS.map((d) => `<path d="${d}" fill="${color}"/>`).join('')

// Bare mark, for places that sit on their own background.
export const markSvg = (color = WHITE) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">${pathTags(color)}</svg>\n`

// App tile, for favicons and the site header.
export const tileSvg = (bg = INK, fg = WHITE) => {
  const S = 1000
  const k = (S * TILE_MARK_WIDTH) / MARK_W
  const x = (S - MARK_W * k) / 2
  const y = (S - MARK_H * k) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" rx="${S * TILE_RADIUS}" fill="${bg}"/><g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(4)})">${pathTags(fg)}</g></svg>\n`
}
