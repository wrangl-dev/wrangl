import { Environment, Lightformer } from '@react-three/drei'
import { ThreeCanvas } from '@remotion/three'
import type React from 'react'
import { useMemo } from 'react'
import { AbsoluteFill } from 'remotion'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { MARK_H, MARK_W, markSvg } from './brand.js'
import { INK, WHITE } from './marks'

const MONO = '"SF Mono", ui-monospace, Menlo, monospace'

// The official W_ paths, extruded. Centred on the origin, about 4 units wide.
function useMarkGeometry(depth: number) {
  return useMemo(() => {
    const shapes = new SVGLoader().parse(markSvg()).paths.flatMap((p) => SVGLoader.createShapes(p))
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: true,
      bevelThickness: 6,
      bevelSize: 4,
      bevelSegments: 6,
      curveSegments: 12
    })
    // SVG y points down; flip it and centre the mark.
    geo.translate(-MARK_W / 2, -MARK_H / 2, -depth / 2)
    geo.scale(0.004, -0.004, 0.004)
    geo.computeVertexNormals()
    return geo
  }, [depth])
}

const Studio: React.FC = () => (
  <Environment resolution={256}>
    <Lightformer form="rect" intensity={4} position={[0, 5, 2]} scale={[10, 1, 1]} />
    <Lightformer
      form="rect"
      intensity={2}
      position={[-6, 1, 3]}
      rotation-y={Math.PI / 2}
      scale={[8, 2, 1]}
    />
    <Lightformer
      form="rect"
      intensity={2}
      position={[6, -1, 3]}
      rotation-y={-Math.PI / 2}
      scale={[8, 2, 1]}
    />
    {/* Big soft panel behind the camera, so the front faces read as bright metal. */}
    <Lightformer form="rect" intensity={1.6} position={[0, 0, 10]} scale={[14, 8, 1]} />
    <Lightformer form="ring" intensity={3} position={[3, 3, 6]} scale={2} />
  </Environment>
)

const ChromeMark: React.FC<{
  rotation: [number, number, number]
  position: [number, number, number]
}> = ({ rotation, position }) => {
  const geo = useMarkGeometry(120)
  // Faces bright and glossy, edges pick up the studio strips.
  return (
    <mesh geometry={geo} rotation={rotation} position={position}>
      <meshPhysicalMaterial
        color={WHITE}
        metalness={0.85}
        roughness={0.18}
        clearcoat={1}
        clearcoatRoughness={0.05}
      />
    </mesh>
  )
}

// Terminal floor: a grid running into the dark.
const Floor: React.FC = () => (
  <group position={[0, -2.1, 0]}>
    <gridHelper args={[60, 60, '#3a3a3a', '#1f1f1f']} />
  </group>
)

export const XHeader3D: React.FC = () => (
  <AbsoluteFill style={{ background: INK }}>
    <ThreeCanvas width={1500} height={500} camera={{ position: [0, 0.6, 9], fov: 32 }}>
      <color attach="background" args={[INK]} />
      <fog attach="fog" args={[INK, 9, 22]} />
      <Studio />
      <ChromeMark rotation={[0.1, -0.5, 0.04]} position={[3.3, 0.2, 1.6]} />
      <Floor />
    </ThreeCanvas>
    <div
      style={{
        position: 'absolute',
        left: 120,
        top: 128,
        display: 'flex',
        flexDirection: 'column',
        gap: 18
      }}
    >
      <span
        style={{
          color: WHITE,
          font: '800 112px system-ui, -apple-system, sans-serif',
          letterSpacing: '-0.045em',
          lineHeight: 1
        }}
      >
        wrangl
      </span>
      <span style={{ color: WHITE, opacity: 0.72, font: `500 26px ${MONO}` }}>
        <span style={{ opacity: 0.5 }}>$ </span>the agent terminal for robinhood chain
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 26,
            background: WHITE,
            marginLeft: 6,
            verticalAlign: '-4px'
          }}
        />
      </span>
    </div>
  </AbsoluteFill>
)

export const XAvatar3D: React.FC = () => (
  <AbsoluteFill style={{ background: INK }}>
    <ThreeCanvas width={400} height={400} camera={{ position: [0, 0, 9], fov: 30 }}>
      <color attach="background" args={[INK]} />
      <Studio />
      <ChromeMark rotation={[0.12, -0.32, 0]} position={[0, 0, 0]} />
    </ThreeCanvas>
  </AbsoluteFill>
)
