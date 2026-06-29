import { useState, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";

// Peak surface bending stress (MPa) for an end-loaded cantilever, as a
// fraction of yield — used to drive the beam's color and the haptic/audio feel.
function stressRatio(EGpa: number, tMm: number, LMm: number, deltaMm: number, sigmaYMpa: number) {
  if (LMm <= 0 || sigmaYMpa <= 0) return 0;
  const sigmaPa =
    (3 * (EGpa * 1e9) * (tMm / 1000) * (Math.abs(deltaMm) / 1000)) /
    (2 * Math.pow(LMm / 1000, 2));
  return sigmaPa / 1e6 / sigmaYMpa;
}

type Stops = Array<[number, [number, number, number]]>;
function rampColor(stops: Stops, x: number) {
  const xc = Math.max(0, Math.min(stops[stops.length - 1][0], x));
  for (let i = 1; i < stops.length; i++) {
    const [p1, c1] = stops[i];
    if (xc <= p1) {
      const [p0, c0] = stops[i - 1];
      const f = (xc - p0) / (p1 - p0 || 1);
      return { r: c0[0] + (c1[0] - c0[0]) * f, g: c0[1] + (c1[1] - c0[1]) * f, b: c0[2] + (c1[2] - c0[2]) * f };
    }
  }
  const last = stops[stops.length - 1][1];
  return { r: last[0], g: last[1], b: last[2] };
}

// Diverging stress map across the thickness: the neutral axis is dim, the
// stretched (tension) face warms to red, the compressed face cools to blue.
const NEUTRAL_RGB: [number, number, number] = [0.31, 0.706, 0.467]; // calm safe-green
const TENSION_STOPS: Stops = [
  [0.0, NEUTRAL_RGB],
  [0.5, [0.85, 0.55, 0.22]], // amber
  [1.0, [0.84, 0.27, 0.27]], // yield red
  [1.3, [1.0, 0.3, 0.3]],
];
const COMPRESSION_STOPS: Stops = [
  [0.0, NEUTRAL_RGB],
  [0.5, [0.2, 0.58, 0.68]], // teal
  [1.0, [0.27, 0.46, 0.9]], // blue
  [1.3, [0.3, 0.4, 1.0]],
];
// signed: + = tension (warm), − = compression (cool).
function signedStressColor(signed: number) {
  return signed >= 0 ? rampColor(TENSION_STOPS, signed) : rampColor(COMPRESSION_STOPS, -signed);
}

// Horizontal foreshortening integral ∫₀¹cos θ(p) dp for the bent centerline,
// used both to draw the beam and to derive large-deflection stiffening.
function cosIntegral(c: number, steps = 64) {
  let s = 0;
  const dp = 1 / steps;
  for (let i = 0; i < steps; i++) {
    const p = (i + 0.5) * dp;
    s += Math.cos(c * (3 * p - 1.5 * p * p)) * dp;
  }
  return s;
}

// ── 3D beam viewer ──────────────────────────────────────────────
// Renders a rectangular cantilever to true L:t:w proportions, bent
// along the cubic cantilever deflection shape. Drag to orbit; in
// interactive mode, grab the beam to bend it and feel the stress.
function Beam3D({
  L,
  t,
  w,
  delta,
  interactive,
  E,
  sigmaY,
  onLiveDelta,
  capRotate,
  capBend,
}: {
  L: number;
  t: number;
  w: number;
  delta: number;
  interactive: boolean;
  E: number;
  sigmaY: number;
  onLiveDelta: (mm: number | null) => void;
  capRotate: string;
  capBend: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ yaw: -0.6, pitch: -0.35, dragging: false, lx: 0, ly: 0 });
  const meshRef = useRef<THREE.Mesh | null>(null);
  const wallRef = useRef<THREE.Mesh | null>(null);
  const pivotRef = useRef<THREE.Group | null>(null);

  // Geometry caches so deflection can be applied per-frame without rebuilding.
  const geoRef = useRef<THREE.BufferGeometry | null>(null);
  const baseYRef = useRef<Float32Array | null>(null);
  const xnRef = useRef<Float32Array | null>(null);
  const colorAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const dimsRef = useRef({ Lv: 1, Ls: 1, halfT: 0.01 });
  const applyRef = useRef<((d: number) => void) | null>(null);

  // Auto-fit framing: track the beam's bounding sphere so the camera can keep
  // the whole (possibly curled) beam in view.
  const beamCenterRef = useRef(new THREE.Vector3());
  const beamRadiusRef = useRef(2);
  const camDistRef = useRef(6);

  // Invisible, fattened proxy around the beam — a forgiving grab target so a
  // thin wafer is still easy to catch with a fingertip. Deflects with the beam.
  const proxyRef = useRef<THREE.Mesh | null>(null);
  const proxyBaseYRef = useRef<Float32Array | null>(null);
  const proxyXnRef = useRef<Float32Array | null>(null);

  // Live interaction state (driven outside React for smoothness).
  const liveDeltaRef = useRef(delta);
  const designDeltaRef = useRef(delta);
  const grabbingRef = useRef(false);
  const springRef = useRef(false);
  const springVelRef = useRef(0);
  const yieldRef = useRef(false);
  const forceRef = useRef(true);
  const lastVibeRef = useRef(0);
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null>(null);

  // Latest props, readable from the long-lived animation/pointer closures.
  const propsRef = useRef({ interactive, E, sigmaY, L, t, w, onLiveDelta });
  useEffect(() => {
    propsRef.current = { interactive, E, sigmaY, L, t, w, onLiveDelta };
    forceRef.current = true; // recolor on material change
  }, [interactive, E, sigmaY, L, t, w, onLiveDelta]);

  // Keep the resting deflection in sync with the design input.
  useEffect(() => {
    designDeltaRef.current = delta;
    if (!grabbingRef.current && !springRef.current) {
      liveDeltaRef.current = delta;
      forceRef.current = true;
    }
  }, [delta]);

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1015");

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3a78c2, 0.5);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);
    pivotRef.current = pivot;

    const grid = new THREE.GridHelper(8, 16, 0x1f2a33, 0x141c22);
    grid.position.y = -1.2;
    pivot.add(grid);

    // Slope angle of the cantilever along its length, as a fraction p (0=root,
    // 1=tip) of the material. Tuned so the small-angle tip drop ≈ the deflection
    // ratio c; integrating cos/sin of this keeps the centerline length constant.
    const slope = (p: number, c: number) => c * (3 * p - 1.5 * p * p);

    // Bend the beam by deflection (mm), preserving its true length: walk the
    // centerline at constant arc-length spacing (so the tip foreshortens and
    // pulls inward as it droops) and rotate each cross-section with the slope.
    const M = 128;
    const cx = new Float32Array(M + 1);
    const cy = new Float32Array(M + 1);
    const applyDeflection = (deltaMm: number) => {
      const geo = geoRef.current;
      const baseY = baseYRef.current;
      const xn = xnRef.current;
      if (!geo || !baseY || !xn) return;
      const { Lv, Ls } = dimsRef.current;
      // c = tip-deflection ratio (= dWorld/Ls); clamp so it can't curl past ~85°.
      let c = deltaMm / Math.max(Lv, 1e-3);
      c = Math.max(-0.95, Math.min(0.95, c));

      // Numerically integrate the centerline (X right, Y down-negative).
      const dp = 1 / M;
      cx[0] = 0;
      cy[0] = 0;
      for (let i = 1; i <= M; i++) {
        const pm = (i - 0.5) * dp;
        const phi = slope(pm, c);
        cx[i] = cx[i - 1] + Ls * Math.cos(phi) * dp;
        cy[i] = cy[i - 1] - Ls * Math.sin(phi) * dp;
      }

      const bend = (out: THREE.BufferAttribute, off: Float32Array, frac: Float32Array) => {
        for (let i = 0; i < out.count; i++) {
          const p = frac[i];
          const a = off[i]; // cross-section offset from the neutral axis (thickness)
          const phi = slope(p, c);
          const fi = p * M;
          const i0 = Math.min(M - 1, Math.max(0, Math.floor(fi)));
          const f = fi - i0;
          const X = cx[i0] + (cx[i0 + 1] - cx[i0]) * f;
          const Y = cy[i0] + (cy[i0 + 1] - cy[i0]) * f;
          out.setX(i, X + a * Math.sin(phi));
          out.setY(i, Y + a * Math.cos(phi));
        }
        out.needsUpdate = true;
      };

      const pos = geo.attributes.position as THREE.BufferAttribute;
      bend(pos, baseY, xn);
      geo.computeVertexNormals();
      // Track the deflected bounding sphere for auto-fit framing.
      geo.computeBoundingSphere();
      if (geo.boundingSphere) {
        beamCenterRef.current.copy(geo.boundingSphere.center);
        beamCenterRef.current.x += -dimsRef.current.Ls / 2; // mesh.position.x offset
        beamRadiusRef.current = geo.boundingSphere.radius;
      }
      // Keep the invisible grab proxy bent the same way.
      const proxy = proxyRef.current;
      const pBaseY = proxyBaseYRef.current;
      const pXn = proxyXnRef.current;
      if (proxy && pBaseY && pXn) {
        bend(proxy.geometry.attributes.position as THREE.BufferAttribute, pBaseY, pXn);
      }
      const col = colorAttrRef.current;
      if (col) {
        const P = propsRef.current;
        const ratioMax = stressRatio(P.E, P.t, P.L, deltaMm, P.sigmaY);
        const halfT = dimsRef.current.halfT || 1e-6;
        const dir = Math.sign(deltaMm); // bend direction: +δ → top in tension
        for (let i = 0; i < col.count; i++) {
          // Local fiber stress: peaks at the root (1−p), linear through the
          // thickness (a/halfT), signed by which face is stretched.
          const signed = ratioMax * (1 - xn[i]) * dir * (baseY[i] / halfT);
          const c = signedStressColor(signed);
          col.setXYZ(i, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
      }
    };
    applyRef.current = applyDeflection;

    // ── Haptic / audio "feel" ──────────────────────────────────────
    const ensureAudio = () => {
      if (audioRef.current) {
        audioRef.current.ctx.resume?.();
        return;
      }
      try {
        const AC: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = 80;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioRef.current = { ctx, gain, osc };
      } catch {
        /* audio unavailable — silent fallback */
      }
    };
    const crack = () => {
      const a = audioRef.current;
      if (!a) return;
      const { ctx } = a;
      const dur = 0.18;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1100;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start();
    };
    const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    const updateFeel = (deltaMm: number) => {
      const P = propsRef.current;
      const ratio = stressRatio(P.E, P.t, P.L, deltaMm, P.sigmaY);
      const a = audioRef.current;
      if (a) {
        a.gain.gain.setTargetAtTime(Math.min(0.14, ratio * 0.12), a.ctx.currentTime, 0.02);
        a.osc.frequency.setTargetAtTime(70 + Math.min(ratio, 1.5) * 230, a.ctx.currentTime, 0.02);
      }
      const yielding = ratio >= 1;
      if (yielding && !yieldRef.current) {
        crack();
        if (canVibrate()) navigator.vibrate([0, 45, 25, 75]);
      }
      yieldRef.current = yielding;
      if (canVibrate()) {
        const now = performance.now();
        const interval = 220 - Math.min(ratio, 1.2) * 150; // more stress → faster ticks
        if (now - lastVibeRef.current > interval) {
          navigator.vibrate(6);
          lastVibeRef.current = now;
        }
      }
    };
    const stopFeel = () => {
      const a = audioRef.current;
      if (a) a.gain.gain.setTargetAtTime(0, a.ctx.currentTime, 0.08);
      yieldRef.current = false;
    };

    let raf = 0;
    let lastApplied = NaN;
    const tmpV = new THREE.Vector3();
    const animate = () => {
      const s = stateRef.current;
      pivot.rotation.y = s.yaw;
      pivot.rotation.x = s.pitch;
      // Damped spring-back to the resting (design) deflection after a release.
      if (springRef.current) {
        const target = designDeltaRef.current;
        const cur = liveDeltaRef.current;
        const norm = Math.min(1, Math.max(0, (Math.log10(Math.max(propsRef.current.E, 1e-3)) + 2) / 4.3));
        const ks = 0.12 + 0.3 * norm; // stiffer materials snap back faster
        springVelRef.current = (springVelRef.current + (target - cur) * ks) * 0.8;
        let ncur = cur + springVelRef.current;
        if (Math.abs(target - ncur) < 1e-3 && Math.abs(springVelRef.current) < 1e-3) {
          ncur = target;
          springRef.current = false;
          propsRef.current.onLiveDelta(null);
        } else {
          propsRef.current.onLiveDelta(ncur);
        }
        liveDeltaRef.current = ncur;
      }
      if (forceRef.current || liveDeltaRef.current !== lastApplied) {
        applyDeflection(liveDeltaRef.current);
        lastApplied = liveDeltaRef.current;
        forceRef.current = false;
      }
      // Auto-fit: keep the beam centered, easing the zoom so even a fully
      // curled tip stays in frame.
      tmpV.copy(beamCenterRef.current).applyEuler(pivot.rotation);
      pivot.position.set(-tmpV.x, -tmpV.y, -tmpV.z);
      const aspect = camera.aspect || 1;
      const vHalf = (camera.fov * Math.PI) / 360;
      const halfFov = Math.min(vHalf, Math.atan(Math.tan(vHalf) * aspect));
      const want = Math.max(4, (beamRadiusRef.current * 1.35) / Math.sin(halfFov));
      camDistRef.current += (want - camDistRef.current) * 0.1;
      camera.position.set(0, 0, camDistRef.current);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const wd = mount.clientWidth;
      const ht = mount.clientHeight || 320;
      camera.aspect = wd / ht;
      camera.updateProjectionMatrix();
      renderer.setSize(wd, ht);
    };
    window.addEventListener("resize", onResize);

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "grab";
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragStartY = 0;
    let dragStartDelta = 0;

    const hitsBeam = (e: PointerEvent) => {
      const target = proxyRef.current || meshRef.current;
      if (!target) return false;
      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(target).length > 0;
    };

    const down = (e: PointerEvent) => {
      const s = stateRef.current;
      // Interactive: grab the beam to bend it; miss the beam → orbit.
      if (propsRef.current.interactive && hitsBeam(e)) {
        grabbingRef.current = true;
        springRef.current = false;
        springVelRef.current = 0;
        dragStartY = e.clientY;
        dragStartDelta = liveDeltaRef.current;
        ensureAudio();
        el.style.cursor = "ns-resize";
        el.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        return;
      }
      s.dragging = true;
      s.lx = e.clientX;
      s.ly = e.clientY;
      el.style.cursor = "grabbing";
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (grabbingRef.current) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const h = rect.height || 320;
        const Lv = Math.max(propsRef.current.L, 1e-3);
        const mmPerPx = (Lv * 1.4) / h; // a full vertical swipe ≈ 1.4·L of travel
        const lim = Lv * 0.9;
        let nd = dragStartDelta + (e.clientY - dragStartY) * mmPerPx;
        nd = Math.max(-lim, Math.min(lim, nd));
        liveDeltaRef.current = nd;
        propsRef.current.onLiveDelta(nd);
        updateFeel(nd);
        return;
      }
      const s = stateRef.current;
      if (!s.dragging) return;
      e.preventDefault(); // stop the page from scrolling while orbiting
      s.yaw += (e.clientX - s.lx) * 0.01; // yaw spins freely, full 360°
      s.pitch += (e.clientY - s.ly) * 0.01;
      s.pitch = Math.max(-1.4, Math.min(1.4, s.pitch)); // clamp tilt so it can't flip over
      s.lx = e.clientX;
      s.ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (grabbingRef.current) {
        grabbingRef.current = false;
        springRef.current = true; // release → spring back to rest
        stopFeel();
        el.style.cursor = "grab";
        el.releasePointerCapture?.(e.pointerId);
        return;
      }
      stateRef.current.dragging = false;
      el.style.cursor = "grab";
      el.releasePointerCapture?.(e.pointerId);
    };
    // passive:false is required so preventDefault actually blocks scroll on touch
    el.addEventListener("pointerdown", down, { passive: false });
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
    // belt-and-suspenders: block native touch scrolling on the canvas
    const blockTouch = (e: TouchEvent) => {
      if (stateRef.current.dragging || grabbingRef.current) e.preventDefault();
    };
    el.addEventListener("touchmove", blockTouch, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointerleave", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("touchmove", blockTouch);
      try {
        audioRef.current?.ctx.close();
      } catch {
        /* ignore */
      }
      audioRef.current = null;
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  // Rebuild beam geometry whenever the cross-section / length changes.
  // Deflection + color are applied per-frame by the animation loop.
  useEffect(() => {
    const pivot = pivotRef.current;
    if (!pivot) return;

    // clear previous beam + wall
    if (meshRef.current) {
      pivot.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
    }
    if (wallRef.current) {
      pivot.remove(wallRef.current);
      wallRef.current.geometry.dispose();
      (wallRef.current.material as THREE.Material).dispose();
    }
    if (proxyRef.current) {
      pivot.remove(proxyRef.current);
      proxyRef.current.geometry.dispose();
      (proxyRef.current.material as THREE.Material).dispose();
    }

    // Normalize so the longest dim maps to a fixed view length,
    // preserving true relative proportions of L:t:w.
    const Lv = Math.max(L, 1e-3),
      tv = Math.max(t, 1e-3),
      wv = Math.max(w, 1e-3);
    const maxd = Math.max(Lv, tv, wv);
    const scale = 3.2 / maxd;
    const Ls = Lv * scale,
      ts = tv * scale,
      ws = wv * scale;

    // Beam: built flat, ROOT at local x=0, extending to +Ls.
    const SEG = 60;
    const geo = new THREE.BoxGeometry(Ls, ts, ws, SEG, 1, 1);
    geo.translate(Ls / 2, 0, 0); // shift so left face (root) is at x=0
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const baseY = new Float32Array(pos.count);
    const xn = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      baseY[i] = pos.getY(i);
      xn[i] = pos.getX(i) / Ls; // 0 at root → 1 at tip
    }
    const colorAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("color", colorAttr);

    geoRef.current = geo;
    baseYRef.current = baseY;
    xnRef.current = xn;
    colorAttrRef.current = colorAttr;
    dimsRef.current = { Lv, Ls, halfT: ts / 2 };

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.25,
      roughness: 0.55,
    });
    const mesh = new THREE.Mesh(geo, mat);
    pivot.add(mesh);
    meshRef.current = mesh;

    // Fat invisible grab proxy (raycast target only).
    const fat = Math.max(ts, ws, Ls * 0.18);
    const proxyGeo = new THREE.BoxGeometry(Ls, fat, fat, SEG, 1, 1);
    proxyGeo.translate(Ls / 2, 0, 0);
    const ppos = proxyGeo.attributes.position as THREE.BufferAttribute;
    const pBaseY = new Float32Array(ppos.count);
    const pXn = new Float32Array(ppos.count);
    for (let i = 0; i < ppos.count; i++) {
      pBaseY[i] = ppos.getY(i);
      pXn[i] = ppos.getX(i) / Ls;
    }
    const proxy = new THREE.Mesh(
      proxyGeo,
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    proxy.position.x = -Ls / 2;
    pivot.add(proxy);
    proxyRef.current = proxy;
    proxyBaseYRef.current = pBaseY;
    proxyXnRef.current = pXn;

    // Anchor wall: a slab flush against the root face (just left of x=0),
    // sized a bit larger than the beam cross-section so the beam clearly
    // emerges FROM it rather than passing through it.
    const wallThick = 0.22;
    const wallGeo = new THREE.BoxGeometry(wallThick, ts * 2.2 + 0.3, ws * 1.6 + 0.3);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a242c,
      metalness: 0.1,
      roughness: 0.95,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    pivot.add(wall);
    wallRef.current = wall;

    // Re-center the whole assembly in view: pivot holds beam(0..Ls)+wall,
    // so nudge children left by half the beam length via group offset.
    mesh.position.x = -Ls / 2;
    wall.position.x = -Ls / 2 - wallThick / 2;

    // Apply the current deflection/color to the fresh geometry right away.
    forceRef.current = true;
    applyRef.current?.(liveDeltaRef.current);
  }, [L, t, w]);

  return (
    <div>
      <div ref={mountRef} className="flexure-beam" />
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9.5,
          color: interactive ? "#6b7884" : "#46515c",
          marginTop: 6,
          textAlign: "center",
        }}
      >
        {interactive ? capBend : capRotate}
      </div>
    </div>
  );
}

// Material library: E in GPa, yield strength in MPa.
// fdm flag = anisotropic 3D-printed value (typical XY in-plane, well below across-layer).
type Material = {
  E: number;
  sigmaY: number;
  color: string;
  grp: string;
  fdm?: boolean;
  soft?: boolean;
};

const MATERIALS: Record<string, Material> = {
  // — Metals —
  "Spring Steel (1095)": { E: 205, sigmaY: 1200, color: "#9aa7b4", grp: "Metal" },
  "Ti-6Al-4V": { E: 114, sigmaY: 880, color: "#c4b59a", grp: "Metal" },
  "Aluminum 6061": { E: 68.9, sigmaY: 55, color: "#b8bcc0", grp: "Metal" }, // O temper (annealed)
  "Aluminum 6061-T6": { E: 68.9, sigmaY: 276, color: "#b8bcc0", grp: "Metal" },
  "Aluminum 7075": { E: 71.7, sigmaY: 103, color: "#b8bcc0", grp: "Metal" }, // O temper (annealed)
  "Aluminum 7075-T6": { E: 71.7, sigmaY: 503, color: "#b8bcc0", grp: "Metal" },
  // — Bulk plastics —
  "Delrin (POM)": { E: 3.1, sigmaY: 70, color: "#e6e2d8", grp: "Plastic" },
  Polypropylene: { E: 1.5, sigmaY: 35, color: "#d8e0d4", grp: "Plastic" },
  PETG: { E: 2.1, sigmaY: 50, color: "#d4dde0", grp: "Plastic" },
  // — FDM (filament, XY in-plane) —
  "PLA (FDM)": { E: 3.5, sigmaY: 50, color: "#cfe0c8", grp: "FDM", fdm: true },
  "PETG (FDM)": { E: 2.0, sigmaY: 45, color: "#cfdde0", grp: "FDM", fdm: true },
  "ABS (FDM)": { E: 2.0, sigmaY: 40, color: "#e0d4cf", grp: "FDM", fdm: true },
  "ASA (FDM)": { E: 2.0, sigmaY: 42, color: "#e0d8cf", grp: "FDM", fdm: true },
  "PC-ABS (FDM)": { E: 1.9, sigmaY: 41, color: "#d6d2e0", grp: "FDM", fdm: true },
  "Polycarbonate (FDM)": { E: 2.2, sigmaY: 57, color: "#d2dce0", grp: "FDM", fdm: true },
  "Nylon 12 / PA12 (FDM)": { E: 1.5, sigmaY: 45, color: "#dee0d2", grp: "FDM", fdm: true },
  "Nylon 12 CF (FDM)": { E: 4.0, sigmaY: 70, color: "#c4c8cc", grp: "FDM", fdm: true },
  "PP (FDM)": { E: 1.3, sigmaY: 28, color: "#d8e0d4", grp: "FDM", fdm: true },
  // — Powder-bed (MJF / SLS) —
  "PA12 (MJF)": { E: 1.7, sigmaY: 48, color: "#dee0d2", grp: "Powder-bed", fdm: true },
  "PA11 (MJF)": { E: 1.6, sigmaY: 48, color: "#dee0d2", grp: "Powder-bed", fdm: true },
  "PA12 GB (MJF, glass-filled)": { E: 2.6, sigmaY: 44, color: "#d0d4cc", grp: "Powder-bed", fdm: true },
  "PA12 (SLS)": { E: 1.65, sigmaY: 48, color: "#dee0d2", grp: "Powder-bed", fdm: true },
  "TPU/TPA (MJF, rubber-like)": {
    E: 0.08,
    sigmaY: 8,
    color: "#e0d2da",
    grp: "Powder-bed",
    fdm: true,
    soft: true,
  },
  // — Elastomers (rubber-like) —
  "TPU 95A (FDM)": { E: 0.04, sigmaY: 9, color: "#e0d2da", grp: "Elastomer", fdm: true, soft: true },
  "TPU 85A (FDM, softer)": {
    E: 0.012,
    sigmaY: 5,
    color: "#e0d2da",
    grp: "Elastomer",
    fdm: true,
    soft: true,
  },
  "TPE (FDM, soft rubber)": {
    E: 0.01,
    sigmaY: 4,
    color: "#e0d2da",
    grp: "Elastomer",
    fdm: true,
    soft: true,
  },
};

const GROUP_ORDER = ["Metal", "Plastic", "FDM", "Powder-bed", "Elastomer"];

// Pinned to the top of the material picker for quick access.
const FAVORITES = [
  "PA12 (MJF)", // Nylon 12 (MJF)
  "PC-ABS (FDM)",
  "PLA (FDM)",
  "ABS (FDM)",
  "Aluminum 6061",
  "Aluminum 6061-T6",
  "Aluminum 7075",
  "Aluminum 7075-T6",
];

// Equations behind the calculator, shown in the theory section (notes are localized).
const EQUATIONS = [
  "I = w·t³ / 12",
  "k = 3EI / L³",
  "F = k·δ",
  "σ = 3Etδ / 2L²",
  "n = σy / σ",
  "y(x) = (δ/2)·[3(x/L)² − (x/L)³]",
  "γ = 1 / ∫₀¹cos θ(p) dp",
];

// ── Localization ────────────────────────────────────────────────
type Lang = "en" | "ru";
type Strings = {
  toolkit: string;
  title: string;
  material: string;
  favorites: string;
  groups: Record<string, string>;
  matInfo: (E: number, sy: number) => string;
  aniso: string;
  soft: string;
  lengthL: string;
  thicknessT: string;
  widthW: string;
  targetDefl: string;
  mm: string;
  N: string;
  Nmm: string;
  MPa: string;
  safetyFactor: string;
  status: Record<string, string>;
  stiffnessK: string;
  forceF: string;
  maxStress: string;
  deflectedShape: string;
  interactive: string;
  bending: (v: string) => string;
  dims: (L: number, t: number, w: number) => string;
  capRotate: string;
  capBend: string;
  theoryTitle: string;
  eqNotes: string[];
  symbols: string;
  model: { lead: string; body: string };
  design: { lead: string; body: string };
  scope: { lead: string; body: string };
  short: { lead: string; body: string };
};

const STRINGS: Record<Lang, Strings> = {
  en: {
    toolkit: "COMPLIANT MECHANISM TOOLKIT",
    title: "Cantilever Flexure",
    material: "Material",
    favorites: "★ Favorites",
    groups: { Metal: "Metal", Plastic: "Plastic", FDM: "FDM", "Powder-bed": "Powder-bed", Elastomer: "Elastomer" },
    matInfo: (E, sy) => `E = ${E} GPa · σ_y = ${sy} MPa`,
    aniso:
      "⚠ Anisotropic — XY in-plane values. Strength across layer lines is far lower; orient flexures so bending stays in-plane.",
    soft: "⚠ Rubber-like — linear theory only holds for small δ/L. Treat results as a rough first cut.",
    lengthL: "Length L",
    thicknessT: "Thickness t",
    widthW: "Width w",
    targetDefl: "Target deflection δ",
    mm: "mm",
    N: "N",
    Nmm: "N/mm",
    MPa: "MPa",
    safetyFactor: "SAFETY FACTOR",
    status: { SAFE: "SAFE", MARGINAL: "MARGINAL", YIELDING: "YIELDING" },
    stiffnessK: "Stiffness k",
    forceF: "Force required F",
    maxStress: "Max stress σ",
    deflectedShape: "Deflected shape · 3D",
    interactive: "Interactive",
    bending: (v) => `● bending · δ ${v} mm`,
    dims: (L, t, w) => `L ${L} · t ${t} · w ${w} mm`,
    capRotate: "drag to rotate · proportions are true to L : t : w",
    capBend: "grab the beam to bend it · drag empty space to rotate",
    theoryTitle: "Theory & Equations",
    eqNotes: [
      "Second moment of area, rectangular section",
      "Tip stiffness of an end-loaded cantilever",
      "Force needed to reach deflection δ",
      "Peak bending stress, at the fixed root surface",
      "Safety factor against yielding",
      "Euler–Bernoulli deflected shape",
      "Large-deflection stiffening; F = k·δ·γ (γ→1 when δ/L≪1)",
    ],
    symbols:
      "E Young's modulus · I second moment of area · L length · t thickness (bending direction) · w width · δ tip deflection · σ peak stress · σy yield strength · n safety factor",
    model: {
      lead: "Model.",
      body: " A prismatic rectangular cantilever, rigidly built in at one end (the wall) and loaded by a transverse force at the free tip — Euler–Bernoulli (engineer's) beam theory. The bending moment grows linearly from zero at the tip to a maximum at the root, so the surface stress is highest where the beam meets the wall. That is where a flexure yields first. The 3D beam colors this directly: the stretched face warms toward red (tension), the opposite face cools toward blue (compression), and the neutral axis in between stays green — all most intense at the root.",
    },
    design: {
      lead: "Designing a flexure.",
      body: " You usually fix the deflection δ you need and size the geometry for it. Thinning t buys range of motion — stress scales with t while stiffness scales with t³, so a thinner blade is far more compliant and less stressed for the same δ, at the cost of load capacity and buckling resistance. Aim for a safety factor n ≥ 2 for repeated or living-hinge duty, and more where fatigue matters.",
    },
    scope: {
      lead: "Scope.",
      body: " Stiffness and stress use linear small-deflection theory, accurate for roughly δ/L ≲ 0.1; beyond that the true stress and shape diverge from these closed forms. The force readout adds a geometric-stiffening factor γ (shown when it matters) so it tracks the real load-up better at large bends, and the 3D viewer draws a length-preserving large-deflection curve that curls further than the linear numbers imply. 3D-printed values are typical in-plane figures and are anisotropic across layers — verify against your own coupons before relying on them.",
    },
    short: {
      lead: "In short:",
      body: " the harder you bend the beam, the more its tip pulls inward, shrinking the leverage of your force — so each extra millimetre of deflection costs a little more force than the last (the γ factor). For everyday flexures, where deflections are small and the safety factor stays ≥ 2, γ ≈ 1 and you can ignore it; it only shows up when you bend the beam far past its working range.",
    },
  },
  ru: {
    toolkit: "ИНСТРУМЕНТЫ ДЛЯ ПОДАТЛИВЫХ МЕХАНИЗМОВ",
    title: "Консольный упругий элемент",
    material: "Материал",
    favorites: "★ Избранное",
    groups: { Metal: "Металл", Plastic: "Пластик", FDM: "FDM", "Powder-bed": "Порошковая печать", Elastomer: "Эластомер" },
    matInfo: (E, sy) => `E = ${E} ГПа · σ_y = ${sy} МПа`,
    aniso:
      "⚠ Анизотропно — значения в плоскости XY. Прочность поперёк слоёв намного ниже; ориентируйте упругий элемент так, чтобы изгиб оставался в плоскости.",
    soft: "⚠ Резиноподобный — линейная теория верна лишь при малых δ/L. Считайте результаты грубой первой оценкой.",
    lengthL: "Длина L",
    thicknessT: "Толщина t",
    widthW: "Ширина w",
    targetDefl: "Целевой прогиб δ",
    mm: "мм",
    N: "Н",
    Nmm: "Н/мм",
    MPa: "МПа",
    safetyFactor: "ЗАПАС ПРОЧНОСТИ",
    status: { SAFE: "БЕЗОПАСНО", MARGINAL: "НА ПРЕДЕЛЕ", YIELDING: "ТЕКУЧЕСТЬ" },
    stiffnessK: "Жёсткость k",
    forceF: "Требуемая сила F",
    maxStress: "Макс. напряжение σ",
    deflectedShape: "Форма прогиба · 3D",
    interactive: "Интерактив",
    bending: (v) => `● изгиб · δ ${v} мм`,
    dims: (L, t, w) => `L ${L} · t ${t} · w ${w} мм`,
    capRotate: "тяните, чтобы вращать · пропорции точны по L : t : w",
    capBend: "схватите балку, чтобы согнуть · тяните пустое место, чтобы вращать",
    theoryTitle: "Теория и формулы",
    eqNotes: [
      "Момент инерции сечения (прямоугольник)",
      "Жёсткость на конце консоли при нагрузке на конце",
      "Сила для достижения прогиба δ",
      "Макс. изгибное напряжение у заделки (на поверхности)",
      "Запас прочности по текучести",
      "Форма прогиба по Эйлеру–Бернулли",
      "Ужесточение при больших прогибах; F = k·δ·γ (γ→1 при δ/L≪1)",
    ],
    symbols:
      "E — модуль Юнга · I — момент инерции сечения · L — длина · t — толщина (направление изгиба) · w — ширина · δ — прогиб конца · σ — макс. напряжение · σy — предел текучести · n — запас прочности",
    model: {
      lead: "Модель.",
      body: " Призматическая прямоугольная консоль, жёстко защемлённая с одного конца (стенка) и нагруженная поперечной силой на свободном конце — теория балок Эйлера–Бернулли. Изгибающий момент линейно растёт от нуля на конце до максимума у заделки, поэтому напряжение на поверхности максимально там, где балка входит в стенку. Именно там упругий элемент течёт первым. 3D-балка показывает это напрямую: растянутая грань теплеет к красному (растяжение), противоположная холодеет к синему (сжатие), а нейтральная ось между ними остаётся зелёной — и всё это сильнее всего у заделки.",
    },
    design: {
      lead: "Проектирование упругого элемента.",
      body: " Обычно задают нужный прогиб δ и подбирают под него геометрию. Уменьшение толщины t увеличивает ход: напряжение растёт пропорционально t, а жёсткость — как t³, поэтому более тонкая пластина гораздо податливее и менее напряжена при том же δ — ценой несущей способности и устойчивости. Стремитесь к запасу прочности n ≥ 2 для циклической работы или живых шарниров, и больше там, где важна усталость.",
    },
    scope: {
      lead: "Область применения.",
      body: " Жёсткость и напряжение рассчитаны по линейной теории малых прогибов, точной примерно при δ/L ≲ 0,1; за этим пределом реальные напряжение и форма расходятся с этими формулами. В значение силы добавлен геометрический коэффициент ужесточения γ (показывается, когда он значим), чтобы лучше отражать реальную нагрузку при больших изгибах, а 3D-вид рисует кривую больших прогибов с сохранением длины, которая загибается сильнее, чем предсказывают линейные числа. Значения для 3D-печати — типичные в плоскости и анизотропны поперёк слоёв; проверяйте по своим образцам перед использованием.",
    },
    short: {
      lead: "Кратко:",
      body: " чем сильнее вы гнёте балку, тем больше её конец уходит внутрь, уменьшая плечо вашей силы — поэтому каждый следующий миллиметр прогиба требует чуть больше силы, чем предыдущий (коэффициент γ). Для обычных упругих элементов, где прогибы малы и запас прочности ≥ 2, γ ≈ 1 и им можно пренебречь; он проявляется лишь когда вы гнёте балку далеко за рабочий диапазон.",
    },
  },
};

const num = (v: string, fallback = 0) => {
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
};

function Field({
  label,
  unit,
  value,
  onChange,
  step = "any",
  min,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  min?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#6b7884",
          fontFamily: "var(--mono)",
        }}
      >
        {label} <span style={{ color: "#46515c" }}>[{unit}]</span>
      </label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "#0e1419",
          border: "1px solid #1f2a33",
          borderRadius: 2,
          color: "#e8edf1",
          padding: "9px 11px",
          fontFamily: "var(--mono)",
          fontSize: 15,
          width: "100%",
          boxSizing: "border-box",
          outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#3a78c2")}
        onBlur={(e) => (e.target.style.borderColor = "#1f2a33")}
      />
    </div>
  );
}

function Readout({
  label,
  value,
  unit,
  accent,
  hint,
}: {
  label: string;
  value: string;
  unit: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div
      className="flexure-readout"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: "1px solid #141c22",
      }}
    >
      <span
        className="flexure-readout-label"
        style={{
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#6b7884",
          fontFamily: "var(--mono)",
        }}
      >
        {label}
      </span>
      <span
        className="flexure-readout-value"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 17,
          color: accent || "#e8edf1",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {value} <span style={{ fontSize: 11, color: "#46515c" }}>{unit}</span>
        {hint && <span style={{ fontSize: 10, color: "#6b7884", marginLeft: 6 }}>{hint}</span>}
      </span>
    </div>
  );
}

export default function FlexureCalc() {
  const [matKey, setMatKey] = useState(FAVORITES[0]);
  const [L, setL] = useState("40"); // mm
  const [t, setT] = useState("0.8"); // mm (bending direction)
  const [w, setW] = useState("10"); // mm
  const [delta, setDelta] = useState("4"); // mm target deflection
  const [interactive, setInteractive] = useState(false);
  const [liveDelta, setLiveDelta] = useState<number | null>(null); // mm, while bending the beam
  const [lang, setLang] = useState<Lang>("en");

  const T = STRINGS[lang];
  const mat = MATERIALS[matKey];

  // While interactively bending, the readouts follow the live deflection;
  // otherwise they reflect the design input.
  const effDelta = liveDelta != null ? liveDelta : num(delta);
  const isLive = liveDelta != null;

  const r = useMemo(() => {
    const E = mat.E * 1e9; // Pa
    const sigmaY = mat.sigmaY * 1e6; // Pa
    const Lm = num(L) / 1000; // m
    const tm = num(t) / 1000;
    const wm = num(w) / 1000;
    const dm = Math.abs(effDelta) / 1000; // bending either way produces stress

    const I = (wm * Math.pow(tm, 3)) / 12; // m^4
    const k = (3 * E * I) / Math.pow(Lm, 3); // N/m

    // Large-deflection geometric stiffening: as the tip curls inward its
    // moment arm shrinks by the horizontal foreshortening ∫cos θ, so the force
    // to hold a given deflection rises. γ ≈ 1 in the linear (δ/L ≲ 0.1) regime.
    const c = Math.max(-0.95, Math.min(0.95, effDelta / Math.max(num(L), 1e-6)));
    const gamma = 1 / Math.max(0.2, cosIntegral(c));

    const F = k * dm * gamma; // N
    const sigma = (3 * E * tm * dm) / (2 * Math.pow(Lm, 2)); // Pa
    const SF = sigma > 0 ? sigmaY / sigma : Infinity;

    return {
      k: k / 1000, // N/mm
      F, // N (incl. geometric stiffening)
      gamma,
      sigma: sigma / 1e6, // MPa
      SF,
      Lm,
      tm,
      dm,
    };
  }, [mat, L, t, w, effDelta]);

  const status =
    r.SF >= 2
      ? { c: "#4fb477", t: "SAFE" }
      : r.SF >= 1
        ? { c: "#d9a441", t: "MARGINAL" }
        : { c: "#d65c5c", t: "YIELDING" };

  return (
    <div
      className="flexure-shell"
      style={{
        ["--mono" as string]: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
        ["--sans" as string]: "'Inter', system-ui, sans-serif",
        background: "#080c10",
        minHeight: "100vh",
        color: "#e8edf1",
        fontFamily: "var(--sans)",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Header */}
        <div
          className="flexure-header"
          style={{
            borderBottom: "1px solid #1f2a33",
            paddingBottom: 14,
            marginBottom: 22,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.25em",
                color: "#3a78c2",
              }}
            >
              {T.toolkit}
            </div>
            <h1 className="flexure-title" style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {T.title}
            </h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div style={{ display: "inline-flex", border: "1px solid #1f2a33", borderRadius: 3, overflow: "hidden" }}>
              {(["en", "ru"] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    padding: "4px 9px",
                    cursor: "pointer",
                    border: "none",
                    background: lang === l ? "#3a78c2" : "#0e1419",
                    color: lang === l ? "#fff" : "#8b97a3",
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <div
              style={{
                textAlign: "right",
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "#46515c",
                lineHeight: 1.6,
              }}
            >
              <div>k = 3EI / L³</div>
              <div>σ = 3Etδ / 2L²</div>
            </div>
          </div>
        </div>

        <div className="flexure-grid">
          {/* INPUTS */}
          <div className="flexure-inputs" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label
                style={{
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#6b7884",
                  fontFamily: "var(--mono)",
                }}
              >
                {T.material}
              </label>
              <select
                value={matKey}
                onChange={(e) => setMatKey(e.target.value)}
                style={{
                  background: "#0e1419",
                  border: "1px solid #1f2a33",
                  borderRadius: 2,
                  color: "#e8edf1",
                  padding: "9px 11px",
                  fontFamily: "var(--mono)",
                  fontSize: 14,
                  outline: "none",
                }}
              >
                <optgroup label={T.favorites}>
                  {FAVORITES.map((k) => (
                    <option key={`fav-${k}`} value={k}>
                      {k}
                    </option>
                  ))}
                </optgroup>
                {GROUP_ORDER.map((g) => (
                  <optgroup key={g} label={T.groups[g]}>
                    {Object.keys(MATERIALS)
                      .filter((k) => MATERIALS[k].grp === g)
                      .map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: 2 }}>
                {T.matInfo(mat.E, mat.sigmaY)}
              </div>
              {mat.fdm && (
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9.5,
                    color: "#d9a441",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {T.aniso}
                </div>
              )}
              {mat.soft && (
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9.5,
                    color: "#d9a441",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {T.soft}
                </div>
              )}
            </div>
            <Field label={T.lengthL} unit={T.mm} value={L} onChange={setL} min="0" />
            <Field label={T.thicknessT} unit={T.mm} value={t} onChange={setT} min="0" step="0.1" />
            <Field label={T.widthW} unit={T.mm} value={w} onChange={setW} min="0" />
            <Field label={T.targetDefl} unit={T.mm} value={delta} onChange={setDelta} min="0" step="0.1" />
          </div>

          {/* OUTPUTS */}
          <div>
            <div
              style={{
                background: "#0b1015",
                border: `1px solid ${status.c}33`,
                borderRadius: 3,
                padding: "14px 16px",
                marginBottom: 16,
              }}
            >
              <div
                className="flexure-sf-head"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.15em", color: "#6b7884" }}>
                  {T.safetyFactor}
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.15em",
                    color: status.c,
                    border: `1px solid ${status.c}`,
                    borderRadius: 2,
                    padding: "2px 7px",
                  }}
                >
                  {T.status[status.t]}
                </span>
              </div>
              <div
                className="flexure-sf"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 38,
                  fontWeight: 600,
                  color: status.c,
                  marginTop: 6,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {isFinite(r.SF) ? r.SF.toFixed(2) : "∞"}
              </div>
            </div>

            <Readout label={T.stiffnessK} value={r.k.toFixed(3)} unit={T.Nmm} />
            <Readout
              label={T.forceF}
              value={r.F.toFixed(2)}
              unit={T.N}
              hint={r.gamma >= 1.02 ? `γ ${r.gamma.toFixed(2)}` : undefined}
            />
            <Readout label={T.maxStress} value={r.sigma.toFixed(1)} unit={T.MPa} accent={status.c} />
          </div>
        </div>

        {/* BEAM VISUALIZATION — 3D */}
        <div
          className="flexure-viz"
          style={{
            marginTop: 24,
            background: "#0b1015",
            border: "1px solid #141c22",
            borderRadius: 3,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#6b7884",
                }}
              >
                {T.deflectedShape}
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: isLive ? status.c : "#46515c",
                  marginTop: 2,
                }}
              >
                {isLive ? T.bending(effDelta.toFixed(1)) : T.dims(num(L), num(t), num(w))}
              </div>
            </div>
            <button
              onClick={() => {
                const nv = !interactive;
                setInteractive(nv);
                if (!nv) setLiveDelta(null); // leaving interactive → drop the live override
              }}
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: 2,
                padding: "6px 10px",
                background: interactive ? `${status.c}1f` : "#0e1419",
                border: `1px solid ${interactive ? status.c : "#1f2a33"}`,
                color: interactive ? status.c : "#8b97a3",
                whiteSpace: "nowrap",
              }}
            >
              {interactive ? `● ${T.interactive}` : T.interactive}
            </button>
          </div>
          <Beam3D
            L={num(L)}
            t={num(t)}
            w={num(w)}
            delta={num(delta)}
            interactive={interactive}
            E={mat.E}
            sigmaY={mat.sigmaY}
            onLiveDelta={setLiveDelta}
            capRotate={T.capRotate}
            capBend={T.capBend}
          />
        </div>

        {/* THEORY & EQUATIONS */}
        <div style={{ marginTop: 24, borderTop: "1px solid #1f2a33", paddingTop: 18 }}>
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#3a78c2",
              marginBottom: 12,
            }}
          >
            {T.theoryTitle}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {EQUATIONS.map((expr, i) => (
              <div
                key={expr}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid #141c22",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                    color: "#e8edf1",
                    whiteSpace: "nowrap",
                  }}
                >
                  {expr}
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "#6b7884",
                    textAlign: "right",
                  }}
                >
                  {T.eqNotes[i]}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              color: "#46515c",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            {T.symbols}
          </div>

          {[T.model, T.design, T.scope].map((para, i) => (
            <p
              key={para.lead}
              style={{
                fontFamily: "var(--sans)",
                fontSize: 12.5,
                color: "#8b97a3",
                marginTop: i === 0 ? 16 : 10,
                lineHeight: 1.7,
              }}
            >
              <strong style={{ color: "#c2ccd4" }}>{para.lead}</strong>
              {para.body}
            </p>
          ))}

          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#b9c3cc",
              marginTop: 16,
              paddingTop: 12,
              borderTop: "1px dashed #1f2a33",
              lineHeight: 1.7,
            }}
          >
            <span style={{ textDecoration: "underline", textUnderlineOffset: 3, color: "#e8edf1" }}>
              {T.short.lead}
            </span>
            {T.short.body}
          </p>
        </div>
      </div>
    </div>
  );
}
