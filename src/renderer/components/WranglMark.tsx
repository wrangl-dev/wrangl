/**
 * Wrangl brand mark: "W_", slanted solid blocks forming a W plus the cursor.
 *
 * Inline SVG filled with `currentColor` so it follows the text color on both
 * light and dark themes. Paths match `studio/src/brand.js`, the single source
 * every Wrangl logo asset is rendered from; change them there first.
 *
 * The artwork is wide (1012 x 339), so `size` sets the height of the box and
 * the box is 1.5x as wide; the mark fills that width, centred vertically.
 */
export function WranglMark({
  size = 22,
  className
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      width={size * 1.5}
      height={size}
      viewBox="0 -168 1012 675"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Wrangl"
      className={className}
      fill="currentColor"
    >
      <path d="M163 8.1 Q167 0 176 0 L324 0 Q333 0 328.9 8 L167 324 L411.5 7.1 Q417 0 426 0 L589 0 Q598 0 592.6 7.2 L346.4 331.8 Q341 339 332 339 L9 339 Q0 339 4 330.9Z" />
      <path d="M462.6 229.8 Q461 221 466.4 213.8 L590.3 50.6 Q593 47 597.5 47 L598.5 47 Q603 47 603.7 51.5 L619 153 L719.9 7.4 Q725 0 734 0 L882 0 Q891 0 886 7.5 L669 331.5 Q664 339 655 339 L492 339 Q483 339 481.4 330.2Z" />
      <path d="M763 282.5 Q768 275 777 275 L1003 275 Q1012 275 1007.3 282.7 L977.7 331.3 Q973 339 964 339 L734 339 Q725 339 730 331.5Z" />
    </svg>
  )
}
