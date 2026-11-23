// The Wrangl "W_" mark: the same filled paths the brand assets are drawn from.
const PATHS = [
  'M163 8.1 Q167 0 176 0 L324 0 Q333 0 328.9 8 L167 324 L411.5 7.1 Q417 0 426 0 L589 0 Q598 0 592.6 7.2 L346.4 331.8 Q341 339 332 339 L9 339 Q0 339 4 330.9Z',
  'M462.6 229.8 Q461 221 466.4 213.8 L590.3 50.6 Q593 47 597.5 47 L598.5 47 Q603 47 603.7 51.5 L619 153 L719.9 7.4 Q725 0 734 0 L882 0 Q891 0 886 7.5 L669 331.5 Q664 339 655 339 L492 339 Q483 339 481.4 330.2Z',
  'M763 282.5 Q768 275 777 275 L1003 275 Q1012 275 1007.3 282.7 L977.7 331.3 Q973 339 964 339 L734 339 Q725 339 730 331.5Z',
];

export function Logo({ height = 14, className }: { height?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 1012 339"
      height={height}
      width={(height * 1012) / 339}
      className={className}
      role="img"
      aria-label="Wrangl"
    >
      {PATHS.map((d) => (
        <path key={d.slice(0, 12)} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}
