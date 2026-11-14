import type React from 'react'
import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { agents } from './agents.js'
import { INK, Mark, WHITE } from './marks'

// Hero loop for the site: the W_ mark at the centre, every ACP agent Wrangl lists around it,
// thin lines between, and light pulses running out to each agent. Black and white only.
export const HUB_W = 1600
export const HUB_H = 1000
export const HUB_FRAMES = 300 // 10 s at 30 fps

const CX = HUB_W / 2
const CY = HUB_H / 2

type Agent = { name: string; featured: boolean }
// `stagger` pulls every other label inward by that factor so neighbours at the flat top and
// bottom of the ellipse never sit side by side. Rings stay still: rotating them shifts names
// by a slot per loop, which jumps when the clip wraps. Motion comes from the pulses instead.
type Ring = { names: string[]; rx: number; ry: number; size: number; stagger?: number }

// Featured agents (flag in agents.js) take the inner ring, the rest the outer one.
const outerNames = (agents as Agent[]).filter((a) => !a.featured).map((a) => a.name)
const rings: Ring[] = [
  {
    names: (agents as Agent[]).filter((a) => a.featured).map((a) => a.name),
    rx: 430,
    ry: 290,
    size: 25
  },
  { names: outerNames, rx: 705, ry: 445, size: 19, stagger: 0.86 }
]

// Deterministic per-name phase so pulses are staggered but identical on every render.
const phaseOf = (name: string) => {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (h % 1000) / 1000
}

export const AgentsHub: React.FC = () => {
  const frame = useCurrentFrame()
  const loop = frame / HUB_FRAMES // 0..1

  const nodes = rings.flatMap((ring) =>
    ring.names.map((name, i) => {
      const step = (Math.PI * 2) / ring.names.length
      const angle = i * step - Math.PI / 2
      const k = ring.stagger && i % 2 === 1 ? ring.stagger : 1
      const x = CX + Math.cos(angle) * ring.rx * k
      const y = CY + Math.sin(angle) * ring.ry * k
      // Two pulses per loop keeps the motion seamless.
      const t = (loop * 2 + phaseOf(name)) % 1
      const arrive = Math.max(0, 1 - Math.abs(t - 0.96) / 0.14)
      return { name, x, y, t, arrive, size: ring.size }
    })
  )

  const breathe = 0.5 + 0.5 * Math.sin(loop * Math.PI * 4)

  return (
    <AbsoluteFill style={{ background: INK }}>
      <svg
        width={HUB_W}
        height={HUB_H}
        style={{ position: 'absolute', inset: 0 }}
        aria-hidden="true"
      >
        {rings.map((r) => (
          <ellipse
            key={r.rx}
            cx={CX}
            cy={CY}
            rx={r.rx}
            ry={r.ry}
            fill="none"
            stroke={WHITE}
            strokeOpacity={0.06}
            strokeDasharray="2 8"
          />
        ))}
        {nodes.map((n) => (
          <line
            key={`l-${n.name}`}
            x1={CX}
            y1={CY}
            x2={n.x}
            y2={n.y}
            stroke={WHITE}
            strokeOpacity={0.07 + n.arrive * 0.25}
            strokeWidth={1}
          />
        ))}
        {nodes.map((n) => {
          const px = CX + (n.x - CX) * n.t
          const py = CY + (n.y - CY) * n.t
          const fade = Math.min(1, n.t * 6) * Math.min(1, (1 - n.t) * 12)
          return (
            <circle key={`p-${n.name}`} cx={px} cy={py} r={3} fill={WHITE} opacity={0.9 * fade} />
          )
        })}
        <circle
          cx={CX}
          cy={CY}
          r={128 + breathe * 10}
          fill="none"
          stroke={WHITE}
          strokeOpacity={0.08 + breathe * 0.06}
        />
      </svg>

      {nodes.map((n) => (
        <div
          key={`t-${n.name}`}
          style={{
            position: 'absolute',
            left: n.x,
            top: n.y,
            transform: 'translate(-50%, -50%)',
            padding: '4px 10px',
            background: INK,
            border: `1px solid rgba(255,255,255,${0.1 + n.arrive * 0.5})`,
            borderRadius: 3,
            color: WHITE,
            opacity: 0.42 + n.arrive * 0.58,
            font: `500 ${n.size}px ui-monospace, "SF Mono", Menlo, monospace`,
            whiteSpace: 'nowrap'
          }}
        >
          {n.name}
        </div>
      ))}

      <div
        style={{
          position: 'absolute',
          left: CX - 105,
          top: CY - 105,
          width: 210,
          height: 210,
          borderRadius: 48,
          background: INK,
          border: '1px solid rgba(255,255,255,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Mark size={150} />
      </div>
    </AbsoluteFill>
  )
}
