import { type CSSProperties, useEffect, useRef } from 'react';

const layerStyle = (z: number, hidden = false): CSSProperties =>
  ({ '--z': String(z), ...(hidden ? { opacity: 0 } : {}) }) as CSSProperties;

/**
 * Wrangl taken apart in layers. The layers spread in depth on load, follow the pointer a few
 * degrees (fine pointers only), and fold back into one window as the hero scrolls away.
 * Callouts are positioned from the .pin rects. Reduced motion renders the spread, static.
 */
export function HeroStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const stack = stackRef.current;
    if (!stage || !stack) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const layers = [...stack.querySelectorAll<HTMLElement>('.layer')];
    const pins = [...stack.querySelectorAll<HTMLElement>('.pin')];
    const calls = [...stage.querySelectorAll<HTMLElement>('.callout')];
    const fine = window.matchMedia('(pointer: fine)').matches;
    const base = { rx: 0, ry: 0 };
    const cur = { rx: base.rx, ry: base.ry, e: reduced ? 1 : 0 };
    const goal = { rx: base.rx, ry: base.ry, intro: reduced ? 1 : 0, scroll: 1 };
    let running = false;
    let rafId = 0;
    let introTimer = 0;

    const place = () => {
      const s = stage.getBoundingClientRect();
      pins.forEach((pin) => {
        const r = pin.getBoundingClientRect();
        const c = calls[Number(pin.dataset.call)];
        if (!c) return;
        c.style.left = `${r.left + r.width / 2 - s.left}px`;
        c.style.top = `${r.top + r.height / 2 - s.top}px`;
      });
    };
    // The layout is drawn at desktop size and scaled as one unit, so narrow screens get the
    // same arrangement smaller instead of cards that crowd and overlap.
    const STACK_EXTENT = 600;
    const apply = () => {
      // 32px = the page gutters on narrow screens.
      const scale = Math.min(1, (window.innerWidth - 32) / STACK_EXTENT);
      stack.style.transform = `translate(-50%, -50%) scale(${scale}) rotateX(${cur.rx}deg) rotateY(${cur.ry}deg)`;
      layers.forEach((l, i) => {
        l.style.transform = `translateZ(${Number(l.style.getPropertyValue('--z')) * cur.e}px)`;
        if (i) l.style.opacity = String(Math.min(1, cur.e * 1.6));
      });
      stage.style.setProperty('--e', cur.e.toFixed(3));
      place();
    };
    const frame = () => {
      const e = goal.intro * goal.scroll;
      const k = 0.08;
      cur.rx += (goal.rx - cur.rx) * k;
      cur.ry += (goal.ry - cur.ry) * k;
      cur.e += (e - cur.e) * 0.06;
      apply();
      const settled =
        Math.abs(goal.rx - cur.rx) < 0.02 &&
        Math.abs(goal.ry - cur.ry) < 0.02 &&
        Math.abs(e - cur.e) < 0.002;
      if (settled) {
        running = false;
        return;
      }
      rafId = requestAnimationFrame(frame);
    };
    const kick = () => {
      if (!running && !reduced) {
        running = true;
        rafId = requestAnimationFrame(frame);
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - 0.5;
      const y = (ev.clientY - r.top) / r.height - 0.5;
      goal.ry = base.ry + x * 4;
      goal.rx = base.rx - y * 3;
      kick();
    };
    const onPointerLeave = () => {
      goal.rx = base.rx;
      goal.ry = base.ry;
      kick();
    };
    // Scrolling the hero away folds the layers back into one window.
    const onScroll = () => {
      const r = stage.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / (r.height * 0.9)));
      goal.scroll = 1 - p * 0.85;
      kick();
    };

    apply();
    window.addEventListener('resize', apply);
    if (!reduced) {
      introTimer = window.setTimeout(() => {
        goal.intro = 1;
        kick();
      }, 350);
      if (fine) {
        stage.addEventListener('pointermove', onPointerMove);
        stage.addEventListener('pointerleave', onPointerLeave);
      }
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('scroll', onScroll);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerleave', onPointerLeave);
      window.clearTimeout(introTimer);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      className="stage"
      id="stage"
      ref={stageRef}
      role="img"
      aria-label="Wrangl taken apart in layers: a chat in a project, a terminal running an agent, a swap quote, a picker with every ACP agent, an agent's token check on Robinhood Chain, and a swap waiting for your wallet to sign."
    >
      <div className="stack" id="stack" ref={stackRef} aria-hidden="true">
        <div className="layer l-base" style={layerStyle(0)}>
          <div className="face chatwin">
            <div className="bar">
              <span>storefront · Claude Agent</span>
              <span className="dim">chat</span>
            </div>
            <div className="cw-cols">
              <div className="cw-side">
                <span className="dim">projects</span>
                <span className="cw-on">storefront</span>
                <span className="dim cw-sub">token check</span>
                <span className="dim cw-sub">cart fix</span>
                <span>api</span>
              </div>
              <div className="cw-msgs">
                <p className="cw-me">Is this token safe to buy?</p>
                <p className="cw-tool">
                  <span className="ok">●</span> chain_token <span className="dim">done</span>
                </p>
                <p className="cw-tool">
                  <span className="ok">●</span> swap_quote <span className="dim">done</span>
                </p>
                <p className="cw-ans">Owner renounced, no mint. 10 USDG gets about 0.0057 ETH.</p>
                <p className="cw-input dim">Ask Claude Agent…</p>
              </div>
            </div>
          </div>
          <i className="pin" data-call="0" style={{ left: '50%', top: '100%' }}></i>
        </div>
        <div className="layer l-term" style={layerStyle(70, true)}>
          <div className="face tm">
            <div className="bar">
              <span>&gt;_ Terminal 2</span>
              <span className="dim">claude</span>
            </div>
            <div className="body">
              <p>
                <span className="dim">storefront %</span> claude
              </p>
              <p>
                <span className="ok">✻</span> Reading src/lib/cart-store.ts
              </p>
              <p>
                <span className="ok">✻</span> Editing src/components/cart.tsx
              </p>
              <p>
                <span className="ok">✓</span> 2 files changed, tests pass
              </p>
            </div>
          </div>
          <i className="pin" data-call="1" style={{ left: '30%', top: '100%' }}></i>
        </div>
        <div className="layer l-browser" style={layerStyle(130, true)}>
          <div className="face card">
            <div className="head">
              <span className="name">swap_quote</span>
              <span className="ok">KyberSwap</span>
            </div>
            <div className="rows">
              <span className="dim">sell</span>
              <span>25 USDG</span>
              <span className="dim">buy</span>
              <span>0.0142 ETH</span>
              <span className="dim">impact</span>
              <span className="ok">0.0%</span>
            </div>
          </div>
          <i className="pin" data-call="2" style={{ left: '60%', top: 0 }}></i>
        </div>
        <div className="layer l-chain" style={layerStyle(190, true)}>
          <div className="face card">
            <div className="head">
              <span className="name">chain_token</span>
              <span className="ok">done</span>
            </div>
            <div className="rows">
              <span className="dim">owner</span>
              <span className="ok">renounced</span>
              <span className="dim">mint</span>
              <span className="ok">none</span>
              <span className="dim">liquidity</span>
              <span>$84.2k</span>
            </div>
          </div>
          <i className="pin" data-call="3" style={{ left: '30%', top: 0 }}></i>
        </div>
        <div className="layer l-agents" style={layerStyle(225, true)}>
          <div className="face card picker">
            <div className="head">
              <span className="name">ACP agents</span>
              <span className="ok">ACP</span>
            </div>
            <ul>
              <li className="on">
                <span>Claude Agent</span>
                <span className="ok">✓</span>
              </li>
              <li>
                <span>Codex</span>
              </li>
              <li>
                <span>Gemini CLI</span>
              </li>
              <li>
                <span>Cursor</span>
              </li>
              <li className="dim">+ the whole registry</li>
            </ul>
          </div>
        </div>
        <div className="layer l-sign" style={layerStyle(260, true)}>
          <div className="face card sign">
            <div className="title">Swap 0.01 ETH</div>
            <div className="row">
              <span className="dim">simulated</span>
              <span className="ok">ok</span>
            </div>
            <div className="btns">
              <span className="go">Confirm in wallet</span>
              <span>Reject</span>
            </div>
          </div>
          <i className="pin" data-call="4" style={{ left: '50%', top: '100%' }}></i>
        </div>
      </div>
      <div className="callouts" aria-hidden="true">
        <span className="callout down">Chat per project</span>
        <span className="callout down">Terminals</span>
        <span className="callout up">Swap quotes</span>
        <span className="callout up">Token checks</span>
        <span className="callout down sig">Your wallet signs</span>
      </div>
    </div>
  );
}
