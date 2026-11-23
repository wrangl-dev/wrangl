// 3D chain: one block per real Robinhood Chain block. Loaded lazily (dynamic import)
// so three.js stays out of the first paint. Ported from prototype/index.html.
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  EdgesGeometry,
  Fog,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  WebGLRenderer,
} from 'three';

type ChainBlock = {
  group: Group;
  fill: Mesh<BoxGeometry, MeshBasicMaterial>;
  wire: LineSegments<EdgesGeometry, LineBasicMaterial>;
  spin: number;
};

export type ChainSceneHandle = {
  addBlocks: (grew: number) => void;
  dispose: () => void;
};

const SPACING = 2.6;
const COUNT = 22;

/** Returns null when WebGL is not available. */
export function createChainScene(
  canvas: HTMLCanvasElement,
  { reducedMotion }: { reducedMotion: boolean },
): ChainSceneHandle | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  scene.fog = new Fog(0x0a0a0a, 16, 52);
  const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(9, 6.5, 17);
  camera.lookAt(4, 0, 0);

  const geo = new BoxGeometry(1.5, 1.5, 1.5);
  const edges = new EdgesGeometry(geo);
  const blocks: ChainBlock[] = [];
  const linkGeo = new BufferGeometry();
  const lineMat = new LineBasicMaterial({ color: 0x6a6a6a, transparent: true, opacity: 0.9 });

  function makeBlock(i: number, latest: boolean): ChainBlock {
    const group = new Group();
    const fill = new Mesh(
      geo,
      new MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85 }),
    );
    const wire = new LineSegments(
      edges,
      new LineBasicMaterial({ color: latest ? 0xc6f432 : 0x9a9a9a }),
    );
    group.add(fill, wire);
    group.position.set(
      i * SPACING - (COUNT - 6) * SPACING,
      Math.sin(i * 0.55) * 0.9,
      Math.cos(i * 0.4) * 1.4,
    );
    group.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, 0);
    scene.add(group);
    return { group, fill, wire, spin: (Math.random() - 0.5) * 0.004 };
  }
  for (let i = 0; i < COUNT; i++) blocks.push(makeBlock(i, i === COUNT - 1));

  const links = new LineSegments(linkGeo, lineMat);
  scene.add(links);
  function relink() {
    const pts = [];
    for (let i = 1; i < blocks.length; i++) {
      pts.push(blocks[i - 1].group.position, blocks[i].group.position);
    }
    // Drop the old GPU buffer; three re-uploads the new points on the next render.
    linkGeo.dispose();
    linkGeo.setFromPoints(pts);
  }
  relink();

  // A sparse field of points for depth.
  const starGeo = new BufferGeometry();
  const stars = new Float32Array(600 * 3);
  for (let i = 0; i < stars.length; i += 3) {
    stars[i] = (Math.random() - 0.3) * 80;
    stars[i + 1] = (Math.random() - 0.5) * 30;
    stars[i + 2] = -Math.random() * 40;
  }
  starGeo.setAttribute('position', new BufferAttribute(stars, 3));
  const starMat = new PointsMaterial({ color: 0x5a5a5a, size: 0.08 });
  scene.add(new Points(starGeo, starMat));

  let shift = 0;
  function addBlocks(grew: number) {
    for (let k = 0; k < grew; k++) {
      const prevLatest = blocks[blocks.length - 1];
      prevLatest.wire.material.color.set(0x9a9a9a);
      const nb = makeBlock(COUNT - 1, true);
      const last = blocks[blocks.length - 1].group.position;
      nb.group.position.set(
        last.x + SPACING,
        Math.sin((blocks.length + shift) * 0.55) * 0.9,
        Math.cos((blocks.length + shift) * 0.4) * 1.4,
      );
      nb.group.scale.setScalar(0.01);
      blocks.push(nb);
      shift++;
      const gone = blocks.shift();
      if (gone) {
        scene.remove(gone.group);
        gone.fill.material.dispose();
        gone.wire.material.dispose();
      }
    }
    relink();
  }

  let rafId = 0;
  let offset = 0;

  function render() {
    renderer.render(scene, camera);
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Resizing clears the canvas; with reduced motion there is no loop to redraw it.
    if (reducedMotion) render();
  }
  window.addEventListener('resize', resize);
  resize();

  function frame(t: number) {
    // Drift so the newest block sits right of center.
    const target = blocks[blocks.length - 1].group.position.x - 5 * SPACING;
    offset += (target - offset) * 0.03;
    camera.position.x = 9 + offset;
    camera.lookAt(4 + offset, 0, 0);
    for (const b of blocks) {
      b.group.rotation.y += b.spin;
      if (b.group.scale.x < 1) b.group.scale.setScalar(Math.min(1, b.group.scale.x + 0.04));
    }
    const latest = blocks[blocks.length - 1];
    latest.group.position.y += Math.sin(t / 500) * 0.004;
    render();
    if (!reducedMotion) rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  return {
    addBlocks,
    dispose() {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      for (const b of blocks) {
        b.fill.material.dispose();
        b.wire.material.dispose();
      }
      geo.dispose();
      edges.dispose();
      linkGeo.dispose();
      lineMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
    },
  };
}
