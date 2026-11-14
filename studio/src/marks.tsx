import type React from 'react'
import {
  INK,
  MARK_H,
  MARK_PATHS,
  MARK_VIEWBOX,
  MARK_W,
  TILE_MARK_WIDTH,
  TILE_RADIUS,
  WHITE
} from './brand.js'

export { INK, WHITE }

type MarkProps = { color?: string; bg?: string; size?: number }

// `size` is the mark's width; height follows the artwork's aspect ratio.
export const Mark: React.FC<MarkProps> = ({ color = WHITE, size = 120 }) => (
  <svg width={size} height={(size * MARK_H) / MARK_W} viewBox={MARK_VIEWBOX} role="img">
    <title>Wrangl</title>
    {MARK_PATHS.map((d) => (
      <path key={d} d={d} fill={color} />
    ))}
  </svg>
)

export const Tile: React.FC<MarkProps> = ({ color = INK, bg = WHITE, size = 120 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * TILE_RADIUS,
      background: color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}
  >
    <Mark color={bg} size={size * TILE_MARK_WIDTH} />
  </div>
)

export const Wordmark: React.FC<{ color: string; size: number }> = ({ color, size }) => (
  <span
    style={{
      color,
      fontFamily: 'system-ui, -apple-system, "SF Pro Display", sans-serif',
      fontWeight: 800,
      fontSize: size,
      letterSpacing: '-0.045em',
      lineHeight: 1
    }}
  >
    wrangl
  </span>
)
