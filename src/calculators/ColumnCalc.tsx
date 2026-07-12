import { useState, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Field, Select, Readout, num } from "../ui";
import { signedStressColor } from "./stressColor";
import { MATERIALS, GROUP_ORDER, FAVORITES } from "./materials";
import { END_CONDITIONS, columnResults, bowAmplitude, axialDrop } from "./columnMath";

// ── 3D column viewer ────────────────────────────────────────────
// A vertical strut between its end fixtures with a load platen on top.
// Drag empty space to orbit; in interactive mode, grab the platen and push
// DOWN to load the column. The real physics of "how buckling happens" is
// on display: the column's small initial crookedness is amplified by
// 1/(1 − P/Pcr), so it bows gently at first, then runs away sideways as the
// load approaches critical — in the exact mode shape of the chosen end
// condition — while the platen visibly drops as the centerline curls.
function Column3D({
  L,
  t,
  w,
  P,
  condKey,
  interactive,
  E,
  sigmaY,
  onLiveP,
}: {
  L: number;
  t: number;
  w: number;
  P: number;
  condKey: string;
  interactive: boolean;
  E: number;
  sigmaY: number;
  onLiveP: (n: number | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ yaw: 0.45, pitch: -0.18, dragging: false, lx: 0, ly: 0 });
  const pivotRef = useRef<THREE.Group | null>(null);

  const meshRef = useRef<THREE.Mesh | null>(null);
  const platenRef = useRef<THREE.Mesh | null>(null);
  const fixturesRef = useRef<THREE.Object3D[]>([]);
  const proxyRef = useRef<THREE.Mesh | null>(null);

  // Geometry caches for the per-frame deformation.
  const geoRef = useRef<THREE.BufferGeometry | null>(null);
  const baseXRef = useRef<Float32Array | null>(null);
  const baseYRef = useRef<Float32Array | null>(null);
  const colorAttrRef = useRef<THREE.BufferAttribute | null>(null);
  const dimsRef = useRef({ Lv: 1, Ls: 1, halfTx: 0.01, platenH: 0.2 });
  const applyRef = useRef<((p: number) => void) | null>(null);

  // Live interaction state.
  const livePRef = useRef(P);
  const designPRef = useRef(P);
  const grabbingRef = useRef(false);
  const springRef = useRef(false);
  const springVelRef = useRef(0);
  const yieldRef = useRef(false);
  const forceRef = useRef(true);
  const lastVibeRef = useRef(0);
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null>(null);

  const propsRef = useRef({ interactive, E, sigmaY, L, t, w, condKey, onLiveP });
  useEffect(() => {
    propsRef.current = { interactive, E, sigmaY, L, t, w, condKey, onLiveP };
    forceRef.current = true;
  }, [interactive, E, sigmaY, L, t, w, condKey, onLiveP]);

  useEffect(() => {
    designPRef.current = P;
    if (!grabbingRef.current && !springRef.current) {
      livePRef.current = P;
      forceRef.current = true;
    }
  }, [P]);

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1015");

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6.6);

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
    grid.position.y = -2.15;
    pivot.add(grid);

    const resultsFor = (p: number) => {
      const pr = propsRef.current;
      const cond = END_CONDITIONS[pr.condKey];
      return columnResults(pr.E * 1e9, pr.sigmaY * 1e6, pr.L / 1000, pr.t / 1000, pr.w / 1000, cond.K, p);
    };

    // Deform + color the column for load p (N).
    const applyLoad = (p: number) => {
      const geo = geoRef.current;
      const baseX = baseXRef.current;
      const baseY = baseYRef.current;
      if (!geo || !baseX || !baseY) return;
      const pr = propsRef.current;
      const cond = END_CONDITIONS[pr.condKey];
      const { Ls, halfTx, platenH } = dimsRef.current;
      const r = resultsFor(p);

      const Lm = Math.max(pr.L, 1e-3) / 1000;
      const ampM = bowAmplitude(p, r.Pcr, Lm); // metres, real scale
      const dropM = axialDrop(p, pr.E * 1e9, r.A, Lm, ampM);
      const toView = Ls / Lm;
      const ampV = ampM * toView;
      // Elastic shortening is microns — exaggerate it; geometric drop is real.
      const elasticV = ((p * Lm) / (pr.E * 1e9 * r.A || 1)) * toView * 30;
      const dropV = Math.min(elasticV + ((dropM - (p * Lm) / (pr.E * 1e9 * r.A || 1)) * toView || 0), Ls * 0.25);

      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const s = (baseY[i] + Ls / 2) / Ls; // 0 base → 1 top
        const yc = -Ls / 2 + (baseY[i] + Ls / 2) * (1 - dropV / Ls); // uniform shortening, base anchored
        pos.setY(i, yc);
        pos.setX(i, baseX[i] + ampV * cond.shape(s)); // sideways bow in the weak direction
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();

      // Color: uniform axial compression (cool blue) + bending from the bow —
      // the convex side of the bow goes into tension, the concave side deeper
      // into compression, strongest where the mode curvature peaks.
      const col = colorAttrRef.current;
      if (col) {
        const axialR = r.sigmaAx / (pr.sigmaY * 1e6);
        const tM = pr.t / 1000;
        // σ_bend(s, fiber) = E · amp · |φ''(s)|/L² · fiber
        const bendR = ((pr.E * 1e9) * ampM * (tM / 2)) / (Lm * Lm * pr.sigmaY * 1e6);
        for (let i = 0; i < col.count; i++) {
          const s = (baseY[i] + Ls / 2) / Ls;
          const fx = baseX[i] / (halfTx || 1e-6); // −1..1 across the bow direction
          const signed = -axialR + bendR * -cond.curv(s) * fx;
          const c = signedStressColor(Math.max(-1.3, Math.min(1.3, signed)));
          col.setXYZ(i, c.r, c.g, c.b);
        }
        col.needsUpdate = true;
      }

      // Platen rides the top of the column. A free top sways (and tilts)
      // with the tip; held tops stay on the axis.
      const platen = platenRef.current;
      if (platen) {
        const topY = Ls / 2 - dropV;
        platen.position.y = topY + platenH / 2;
        if (cond.top === "free") {
          platen.position.x = ampV * cond.shape(1);
          // tip slope ≈ amp·φ'(1)/L (φ' by finite difference)
          const slope = (ampV * (cond.shape(1) - cond.shape(0.995))) / (0.005 * Ls);
          platen.rotation.z = -Math.atan(slope);
        } else {
          platen.position.x = 0;
          platen.rotation.z = 0;
        }
        const proxy = proxyRef.current;
        if (proxy) {
          proxy.position.copy(platen.position);
          proxy.rotation.copy(platen.rotation);
        }
      }
    };
    applyRef.current = applyLoad;

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
        osc.frequency.value = 70;
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
      const dur = 0.2;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 700; // deeper thud: a strut letting go
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start();
    };
    const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    const updateFeel = (p: number) => {
      const ratio = p / Math.max(resultsFor(p).Pcr, 1e-9);
      const a = audioRef.current;
      if (a) {
        a.gain.gain.setTargetAtTime(Math.min(0.13, ratio * 0.11), a.ctx.currentTime, 0.02);
        a.osc.frequency.setTargetAtTime(60 + Math.min(ratio, 1.5) * 240, a.ctx.currentTime, 0.02);
      }
      const buckled = ratio >= 1;
      if (buckled && !yieldRef.current) {
        crack();
        if (canVibrate()) navigator.vibrate([0, 60, 30, 90]);
      }
      yieldRef.current = buckled;
      if (canVibrate()) {
        const now = performance.now();
        const interval = 220 - Math.min(ratio, 1.2) * 150;
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
    const animate = () => {
      const s = stateRef.current;
      pivot.rotation.y = s.yaw;
      pivot.rotation.x = s.pitch;
      if (springRef.current) {
        const target = designPRef.current;
        const cur = livePRef.current;
        springVelRef.current = (springVelRef.current + (target - cur) * 0.2) * 0.78;
        let ncur = cur + springVelRef.current;
        const tol = Math.max(1e-2, Math.abs(target) * 1e-4);
        if (Math.abs(target - ncur) < tol && Math.abs(springVelRef.current) < tol) {
          ncur = target;
          springRef.current = false;
          propsRef.current.onLiveP(null);
        } else {
          propsRef.current.onLiveP(ncur);
        }
        livePRef.current = ncur;
      }
      if (forceRef.current || livePRef.current !== lastApplied) {
        applyLoad(livePRef.current);
        lastApplied = livePRef.current;
        forceRef.current = false;
      }
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
    let dragStartP = 0;

    const hitsPlaten = (e: PointerEvent) => {
      const target = proxyRef.current;
      if (!target) return false;
      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(target).length > 0;
    };

    const down = (e: PointerEvent) => {
      const s = stateRef.current;
      if (propsRef.current.interactive && hitsPlaten(e)) {
        grabbingRef.current = true;
        springRef.current = false;
        springVelRef.current = 0;
        dragStartY = e.clientY;
        dragStartP = livePRef.current;
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
        // Full-height drag sweeps ~1.7× the critical load: enough to walk
        // through the runaway and feel the column let go.
        const Pcr = resultsFor(0).Pcr;
        const nPerPx = (Pcr * 1.7) / h;
        let np = dragStartP + (e.clientY - dragStartY) * nPerPx; // drag DOWN = push harder
        np = Math.max(0, Math.min(Pcr * 1.8, np));
        livePRef.current = np;
        propsRef.current.onLiveP(np);
        updateFeel(np);
        return;
      }
      const s = stateRef.current;
      if (!s.dragging) return;
      e.preventDefault();
      s.yaw += (e.clientX - s.lx) * 0.01;
      s.pitch += (e.clientY - s.ly) * 0.01;
      s.pitch = Math.max(-1.4, Math.min(1.4, s.pitch));
      s.lx = e.clientX;
      s.ly = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (grabbingRef.current) {
        grabbingRef.current = false;
        springRef.current = true;
        stopFeel();
        el.style.cursor = "grab";
        el.releasePointerCapture?.(e.pointerId);
        return;
      }
      stateRef.current.dragging = false;
      el.style.cursor = "grab";
      el.releasePointerCapture?.(e.pointerId);
    };
    el.addEventListener("pointerdown", down, { passive: false });
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
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

  // Rebuild the column + fixtures when geometry or the mode changes.
  useEffect(() => {
    const pivot = pivotRef.current;
    if (!pivot) return;
    const cond = END_CONDITIONS[condKey];

    for (const m of [meshRef.current, platenRef.current, proxyRef.current]) {
      if (m) {
        pivot.remove(m);
        m.traverse((o) => {
          const mm = o as THREE.Mesh;
          if (mm.geometry) mm.geometry.dispose();
          if (mm.material) (mm.material as THREE.Material).dispose();
        });
      }
    }
    for (const f of fixturesRef.current) {
      pivot.remove(f);
      f.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.geometry) mm.geometry.dispose();
        if (mm.material) (mm.material as THREE.Material).dispose();
      });
    }
    fixturesRef.current = [];

    const Lv = Math.max(L, 1e-3),
      tv = Math.max(t, 1e-3),
      wv = Math.max(w, 1e-3);
    const scale = 3.5 / Lv; // column dominates the view vertically
    const Ls = Lv * scale;
    const ts = Math.max(tv * scale, 0.05);
    const ws = Math.max(wv * scale, 0.05);

    // Column: vertical box, base at −Ls/2. Bow direction = x (thickness t).
    const SEG = 80;
    const geo = new THREE.BoxGeometry(ts, Ls, ws, 1, SEG, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const baseX = new Float32Array(pos.count);
    const baseY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      baseX[i] = pos.getX(i);
      baseY[i] = pos.getY(i);
    }
    const colorAttr = new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("color", colorAttr);

    geoRef.current = geo;
    baseXRef.current = baseX;
    baseYRef.current = baseY;
    colorAttrRef.current = colorAttr;

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.25, roughness: 0.55 }),
    );
    pivot.add(mesh);
    meshRef.current = mesh;

    // Load platen on top — the thing you grab and push.
    const platenH = 0.22;
    const platenW = Math.max(ts, ws) * 2.6 + 0.25;
    const platen = new THREE.Mesh(
      new THREE.BoxGeometry(platenW, platenH, platenW),
      new THREE.MeshStandardMaterial({ color: 0x8b97a3, metalness: 0.5, roughness: 0.45 }),
    );
    platen.position.y = Ls / 2 + platenH / 2;
    pivot.add(platen);
    platenRef.current = platen;

    dimsRef.current = { Lv, Ls, halfTx: ts / 2, platenH };

    // Fat invisible proxy around the platen (raycast grab target).
    const proxy = new THREE.Mesh(
      new THREE.BoxGeometry(platenW * 1.6, platenH * 4, platenW * 1.6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    proxy.position.copy(platen.position);
    pivot.add(proxy);
    proxyRef.current = proxy;

    // End fixtures. Fixed → clamp slab the column disappears into.
    // Pinned → knife-edge prism / pivot the end can rotate on.
    const supMat = () => new THREE.MeshStandardMaterial({ color: 0x1a242c, metalness: 0.1, roughness: 0.95 });
    const mkFixed = (y: number) => {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(ts * 3 + 0.4, 0.24, ws * 2.2 + 0.4), supMat());
      slab.position.y = y;
      pivot.add(slab);
      fixturesRef.current.push(slab);
    };
    const mkPinned = (y: number, up: boolean) => {
      const g = new THREE.Group();
      const knife = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, ws * 1.6 + 0.2, 3, 1), supMat());
      knife.rotation.x = Math.PI / 2;
      knife.rotation.y = up ? Math.PI : 0; // apex toward the column end
      knife.position.y = y + (up ? -0.13 : 0.13);
      g.add(knife);
      const base = new THREE.Mesh(new THREE.BoxGeometry(ts * 3 + 0.4, 0.1, ws * 2.2 + 0.4), supMat());
      base.position.y = y + (up ? -0.3 : 0.3);
      g.add(base);
      pivot.add(g);
      fixturesRef.current.push(g);
    };
    if (cond.base === "fixed") mkFixed(-Ls / 2 - 0.12);
    else mkPinned(-Ls / 2, true);
    // Top fixtures ride on the platen (as children) so they follow it down
    // as the column shortens — otherwise they'd float at the old height.
    if (cond.top === "fixed") {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(ts * 3 + 0.4, 0.24, ws * 2.2 + 0.4), supMat());
      slab.position.y = platenH / 2 + 0.12;
      platen.add(slab);
    } else if (cond.top === "pinned") {
      const knife = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, ws * 1.6 + 0.2, 3, 1), supMat());
      knife.rotation.x = Math.PI / 2; // apex down, toward the column end
      knife.position.y = -platenH / 2 - 0.1;
      platen.add(knife);
    }
    // free top: nothing — the platen just rides the swaying tip.

    forceRef.current = true;
    applyRef.current?.(livePRef.current);
  }, [L, t, w, condKey]);

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
        {interactive
          ? "grab the top platen and push down to load · drag empty space to rotate"
          : "drag to rotate · bow is drawn to real scale"}
      </div>
    </div>
  );
}

// Equations behind the calculator, shown in the theory section.
const EQUATIONS: Array<{ expr: string; note: string }> = [
  { expr: "Pcr = π²EI / (KL)²", note: "Euler critical load; K from the end condition" },
  { expr: "K = 0.5 · 0.7 · 1.0 · 2.0", note: "fixed-fixed · fixed-pinned · pinned-pinned · flagpole" },
  { expr: "λ = KL / r,  r = √(I/A)", note: "Slenderness ratio on the weak axis" },
  { expr: "λt = √(2π²E / σy)", note: "Euler ↔ Johnson transition slenderness" },
  { expr: "Pcr = A·σy·[1 − σy·λ² / (4π²E)]", note: "Johnson parabola — short/intermediate columns" },
  { expr: "a = a₀ / (1 − P/Pcr)", note: "Imperfection amplification: how buckling happens" },
  { expr: "n = Pcr / P", note: "Safety factor against buckling" },
];

export default function ColumnCalc() {
  const [matKey, setMatKey] = useState("Aluminum 6061-T6");
  const [condKey, setCondKey] = useState("Pinned – pinned (K = 1.0)");
  const [L, setL] = useState("150"); // mm
  const [t, setT] = useState("2"); // mm (weak direction)
  const [w, setW] = useState("10"); // mm
  const [P, setP] = useState("100"); // N applied load
  const [interactive, setInteractive] = useState(true);
  const [liveP, setLiveP] = useState<number | null>(null);

  const mat = MATERIALS[matKey];
  const cond = END_CONDITIONS[condKey];

  const effP = liveP != null ? liveP : num(P);
  const isLive = liveP != null;

  const r = useMemo(
    () => columnResults(mat.E * 1e9, mat.sigmaY * 1e6, num(L) / 1000, num(t) / 1000, num(w) / 1000, cond.K, effP),
    [mat, L, t, w, cond, effP],
  );
  const amp = bowAmplitude(effP, r.Pcr, num(L) / 1000);

  const status =
    r.SF >= 2
      ? { c: "#4fb477", t: "SAFE" }
      : r.SF >= 1
        ? { c: "#d9a441", t: "MARGINAL" }
        : { c: "#d65c5c", t: "BUCKLED" };

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
              MECHCALC · STRUCTURES
            </div>
            <h1 className="flexure-title" style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Column Buckling
            </h1>
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
            <div>Pcr = π²EI / (KL)²</div>
            <div>a = a₀ / (1 − P/Pcr)</div>
          </div>
        </div>

        <div className="flexure-grid">
          {/* INPUTS */}
          <div className="flexure-inputs" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Select label="Buckling mode (end condition)" value={condKey} onChange={setCondKey} options={Object.keys(END_CONDITIONS)} />
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: -8 }}>
              effective length KL = {(cond.K * num(L)).toFixed(0)} mm
            </div>

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
                Material
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
                <optgroup label="★ Favorites">
                  {FAVORITES.map((k) => (
                    <option key={`fav-${k}`} value={k}>
                      {k}
                    </option>
                  ))}
                </optgroup>
                {GROUP_ORDER.map((g) => (
                  <optgroup key={g} label={g}>
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
                E = {mat.E} GPa · σ_y = {mat.sigmaY} MPa
              </div>
            </div>

            <Field label="Length L" unit="mm" value={L} onChange={setL} min="0" />
            <Field label="Thickness t (weak axis)" unit="mm" value={t} onChange={setT} min="0" step="0.1" />
            <Field label="Width w" unit="mm" value={w} onChange={setW} min="0" />
            <Field label="Applied load P" unit="N" value={P} onChange={setP} min="0" step="5" />
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
                  BUCKLING SF
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
                  {status.t}
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
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#6b7884" }}>
                P vs critical load Pcr
              </div>
            </div>

            <Readout
              label="Critical load Pcr"
              value={r.Pcr >= 10000 ? (r.Pcr / 1000).toFixed(2) : r.Pcr.toFixed(1)}
              unit={r.Pcr >= 10000 ? "kN" : "N"}
              accent={status.c}
              hint={r.regime === "euler" ? "Euler" : "Johnson"}
            />
            <Readout
              label="Slenderness λ"
              value={r.lambda.toFixed(0)}
              unit=""
              hint={`λt ${r.lambdaT.toFixed(0)} → ${r.regime === "euler" ? "elastic (Euler)" : "inelastic (Johnson)"}`}
            />
            <Readout label="Axial stress P/A" value={(r.sigmaAx / 1e6).toFixed(1)} unit="MPa" hint={`crush SF ${isFinite(r.nCrush) ? r.nCrush.toFixed(1) : "∞"}`} />
            <Readout
              label="Bow amplitude a"
              value={(amp * 1000).toFixed(2)}
              unit="mm"
              accent={r.SF < 1 ? "#d65c5c" : undefined}
              hint={`a₀ ${((num(L) / 300)).toFixed(2)} mm grows ×${(amp / (num(L) / 300 / 1000)).toFixed(1)}`}
            />
          </div>
        </div>

        {/* COLUMN VISUALIZATION — 3D */}
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
                Buckling · 3D
              </div>
              <div
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10,
                  color: isLive ? status.c : "#46515c",
                  marginTop: 2,
                }}
              >
                {isLive
                  ? `● loading · P ${effP.toFixed(0)} N · ${(100 * effP / r.Pcr).toFixed(0)}% of Pcr · bow ${(amp * 1000).toFixed(1)} mm`
                  : `${condKey.split(" (")[0]} · L ${num(L)} · ${num(t)}×${num(w)} mm`}
              </div>
            </div>
            <button
              onClick={() => {
                const nv = !interactive;
                setInteractive(nv);
                if (!nv) setLiveP(null);
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
              {interactive ? "● Interactive" : "Interactive"}
            </button>
          </div>
          <Column3D
            L={num(L)}
            t={num(t)}
            w={num(w)}
            P={num(P)}
            condKey={condKey}
            interactive={interactive}
            E={mat.E}
            sigmaY={mat.sigmaY}
            onLiveP={setLiveP}
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
            Theory &amp; Equations
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {EQUATIONS.map((eq) => (
              <div
                key={eq.expr}
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
                  {eq.expr}
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    color: "#6b7884",
                    textAlign: "right",
                  }}
                >
                  {eq.note}
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
            E Young&apos;s modulus · I weak-axis second moment · A area · L length · K effective-length
            factor · r radius of gyration · λ slenderness · σy yield · a₀ initial bow · n safety factor
          </div>

          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#8b97a3",
              marginTop: 16,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#c2ccd4" }}>How buckling happens.</strong> A column doesn&apos;t fail
            by snapping at a stress limit — it fails by geometry. Because no column is perfectly straight,
            the axial load works on its tiny initial bow a₀ and amplifies it by 1/(1 − P/Pcr). At half the
            critical load the bow has merely doubled; at 90% it&apos;s ×10; at Pcr the amplification
            diverges and the column runs away sideways in its mode shape. That&apos;s exactly what the 3D
            column does as you push the platen — quiet, then creeping, then gone. The bent shape adds
            bending stress on top of the uniform compression (watch the convex side warm toward tension),
            which is what finally yields the material mid-collapse.
          </p>
          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#8b97a3",
              marginTop: 10,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#c2ccd4" }}>Buckling modes.</strong> The end fixtures set the mode
            shape and, through the effective length KL, the critical load. Holding both ends with pins
            gives the half-sine baseline (K = 1). Welding both ends into walls forces an S-curve with quiet
            inflection points — effectively half the length, 4× the load capacity (K = 0.5). A flagpole,
            fixed at the base and free at the top, sways as a quarter-wave — it buckles at a quarter of the
            pinned load (K = 2). Fixed-pinned sits between (K ≈ 0.7, ~2× the pinned capacity). Note the
            column always buckles about its <em>weak</em> axis: the calculator uses min(I) automatically.
          </p>
          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#8b97a3",
              marginTop: 10,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#c2ccd4" }}>Euler vs Johnson.</strong> Euler&apos;s formula is purely
            elastic and only governs slender columns (λ &gt; λt). Short and intermediate columns yield in
            compression before elastic buckling can develop — the Johnson parabola blends smoothly from
            crushing (A·σy at λ = 0) to Euler at the transition. The readouts show λ, λt, and which regime
            governs your inputs.
          </p>
          <p
            style={{
              fontFamily: "var(--sans)",
              fontSize: 12.5,
              color: "#8b97a3",
              marginTop: 10,
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: "#c2ccd4" }}>Scope.</strong> Prismatic rectangular section, concentric
            axial load, classical idealized end conditions — real bolted or welded ends land between the K
            values, so bracket. The imperfection a₀ = L/300 is a typical straightness tolerance; real
            columns scatter around the amplification curve (design codes knock Pcr down accordingly —
            treat n ≥ 2 as a floor). Eccentric loads, initial curvature beyond a₀, and local/torsional
            buckling of thin-walled sections are not modeled.
          </p>

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
              In short:
            </span>{" "}
            buckling is a stiffness failure, not a strength failure — a slender column lets go long before
            its material is in trouble, and it always picks the weak axis and the easiest mode your end
            fixtures allow. Push the platen slowly and watch for the runaway: everything before ~70% of Pcr
            looks deceptively calm. That calm is why buckling surprises people, and why the safety factor
            here should stay generous.
          </p>
        </div>
      </div>
    </div>
  );
}
