// A few line icons, drawn on a 16px grid.
const ICONS = {
  plus: 'M8 3v10M3 8h10',
  close: 'M4 4l8 8M12 4l-8 8',
  terminal: 'M2.5 3.5h11v9h-11zM5 6.5l2 1.5-2 1.5M8.5 10h2.5',
  send: 'M8 13V3M4 7l4-4 4 4',
  folder: 'M2 4.5h4l1.5 1.5H14v6.5H2z',
  file: 'M4 2.5h5l3 3v8H4zM9 2.5v3h3',
  settings:
    'M8 5.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  wallet: 'M2.5 4.5h10v8h-10zM10 8.5h2.5M2.5 6.5h10',
  chain: 'M6.5 9.5l3-3M5 8l-1.5 1.5a2.1 2.1 0 003 3L8 11M11 8l1.5-1.5a2.1 2.1 0 00-3-3L8 5',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
