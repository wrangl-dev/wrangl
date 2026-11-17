import type React from 'react'
import { AbsoluteFill, Composition, Still } from 'remotion'
import { AgentsHub, HUB_FRAMES, HUB_H, HUB_W } from './agents-hub'
import { INK, Mark, Tile, WHITE, Wordmark } from './marks'
import { XAvatar3D, XHeader3D } from './x-3d'

const center: React.CSSProperties = { alignItems: 'center', justifyContent: 'center' }
// Same line as the site title, so X, the OG card and the landing say one thing.
const TAGLINE = 'The agent terminal for Robinhood Chain.'

// macOS app icon grid: 1024 canvas, 824 tile, transparent margin. Source for `tauri icon`.
const AppIcon: React.FC = () => (
  <AbsoluteFill style={center}>
    <Tile size={824} />
  </AbsoluteFill>
)

// Full-bleed square for web icons (PWA "any", apple-touch, favicon.ico source).
const WebIcon: React.FC = () => (
  <AbsoluteFill style={{ background: INK, ...center }}>
    <Mark size={512 * 0.8} />
  </AbsoluteFill>
)

// Maskable PWA icon: mark kept inside the 80% safe circle.
const MaskableIcon: React.FC = () => (
  <AbsoluteFill style={{ background: INK, ...center }}>
    <Mark size={512 * 0.62} />
  </AbsoluteFill>
)

// Same layout as the X header (the one the user liked), at OG size.
const OgImage: React.FC = () => (
  <AbsoluteFill style={{ background: INK, ...center, flexDirection: 'column', gap: 30 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
      <Mark size={300} />
      <Wordmark color={WHITE} size={150} />
    </div>
    <div
      style={{ color: WHITE, opacity: 0.6, font: '500 44px system-ui, -apple-system, sans-serif' }}
    >
      {TAGLINE}
    </div>
  </AbsoluteFill>
)

// X crops the avatar to a circle, so the mark sits well inside it.
const XAvatar: React.FC = () => (
  <AbsoluteFill style={{ background: INK, ...center }}>
    <Mark size={400 * 0.66} />
  </AbsoluteFill>
)

const XHeader: React.FC = () => (
  <AbsoluteFill style={{ background: INK, ...center, flexDirection: 'row', gap: 36 }}>
    <Wordmark color={WHITE} size={140} />
    <div
      style={{
        color: WHITE,
        opacity: 0.6,
        font: '500 40px system-ui, -apple-system, sans-serif',
        maxWidth: 420,
        lineHeight: 1.2
      }}
    >
      {TAGLINE}
    </div>
  </AbsoluteFill>
)

export const RootCompositions: React.FC = () => (
  <>
    <Still id="AppIcon" component={AppIcon} width={1024} height={1024} />
    <Still id="WebIcon" component={WebIcon} width={512} height={512} />
    <Still id="MaskableIcon" component={MaskableIcon} width={512} height={512} />
    <Still id="OgImage" component={OgImage} width={1200} height={630} />
    <Still id="XAvatar" component={XAvatar} width={400} height={400} />
    <Still id="XHeader" component={XHeader} width={1500} height={500} />
    <Still id="XAvatar3D" component={XAvatar3D} width={400} height={400} />
    <Still id="XHeader3D" component={XHeader3D} width={1500} height={500} />
    <Composition
      id="AgentsHub"
      component={AgentsHub}
      durationInFrames={HUB_FRAMES}
      fps={30}
      width={HUB_W}
      height={HUB_H}
    />
  </>
)
