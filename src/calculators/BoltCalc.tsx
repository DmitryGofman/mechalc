import { useState, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Field, Select, Readout, num } from "../ui";
import { signedStressColor } from "./stressColor";
import { THREADS, CLASSES, FRICTION, boltResults, TARGET_PRELOAD_FRACTION } from "./boltMath";
import type { ThreadSpec, BoltClass } from "./boltMath";

// ── 3D bolted-joint viewer ──────────────────────────────────────
// A hex-head screw clamping two plates with a nut, drawn to true proportions
// for the chosen thread. Drag empty space to orbit; in interactive mode, grab
// the nut and drag sideways to tighten. The gripped length of the shank —
// the part actually carrying preload — warms from green through amber to
// yield-red, the clamped plates cool toward compression-blue, and the free
// tail past the nut stays unloaded green.
function Bolt3D({
  thread,
  cls,
  K,
  grip,
  torque,
  interactive,
  onLiveTorque,
}: {
  thread: ThreadSpec;
  cls: BoltClass;
  K: number;
  grip: number;
  torque: number;
  interactive: boolean;
  onLiveTorque: (T: number | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ yaw: 0.7, pitch: -0.25, dragging: false, lx: 0, ly: 0 });
  const pivotRef = useRef<THREE.Group | null>(null);

  // Parts that get updated per-frame (colors, nut spin, shank stretch).
  const partsRef = useRef<{
    gripShank: THREE.Mesh | null;
    gripMat: THREE.MeshStandardMaterial | null;
    head: THREE.Mesh | null;
    nut: THREE.Mesh | null;
    nutMat: THREE.MeshStandardMaterial | null;
    tail: THREE.Group | null;
    plateMats: THREE.MeshStandardMaterial[];
    proxy: THREE.Mesh | null;
    // view-space layout for the stretch animation
    gripBottomY: number;
    gripLen: number;
    headH: number;
  }>({
    gripShank: null,
    gripMat: null,
    head: null,
    nut: null,
    nutMat: null,
    tail: null,
    plateMats: [],
    proxy: null,
    gripBottomY: 0,
    gripLen: 1,
    headH: 0.2,
  });

  // Live interaction state, driven outside React for smoothness.
  const liveTorqueRef = useRef(torque);
  const designTorqueRef = useRef(torque);
  const grabbingRef = useRef(false);
  const springRef = useRef(false);
  const springVelRef = useRef(0);
  const yieldRef = useRef(false);
  const forceRef = useRef(true);
  const lastVibeRef = useRef(0);
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null>(null);

  // Latest props, readable from the long-lived animation/pointer closures.
  const propsRef = useRef({ thread, cls, K, grip, interactive, onLiveTorque });
  useEffect(() => {
    propsRef.current = { thread, cls, K, grip, interactive, onLiveTorque };
    forceRef.current = true; // recolor on material/friction change
  }, [thread, cls, K, grip, interactive, onLiveTorque]);

  // Keep the resting torque in sync with the design input.
  useEffect(() => {
    designTorqueRef.current = torque;
    if (!grabbingRef.current && !springRef.current) {
      liveTorqueRef.current = torque;
      forceRef.current = true;
    }
  }, [torque]);

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1015");

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 6.4);

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
    grid.position.y = -2.1;
    pivot.add(grid);

    // Stress state for the current live torque, shared by color + feel.
    const utilFor = (T: number) => {
      const P = propsRef.current;
      return boltResults(P.thread, P.cls, P.K, T, P.grip).util;
    };

    // Apply torque-dependent visuals: shank color, plate compression tint,
    // nut spin, and an exaggerated elastic stretch of the gripped length.
    const applyTorque = (T: number) => {
      const parts = partsRef.current;
      const P = propsRef.current;
      const r = boltResults(P.thread, P.cls, P.K, T, P.grip);
      const util = r.util;

      if (parts.gripMat) {
        const c = signedStressColor(Math.min(util, 1.3));
        parts.gripMat.color.setRGB(c.r, c.g, c.b);
        // hot bolts glow slightly so yielding is unmistakable
        parts.gripMat.emissive.setRGB(c.r, c.g, c.b);
        parts.gripMat.emissiveIntensity = Math.max(0, util - 0.9) * 0.5;
      }
      // Clamped plates take the mirror image of the load: compression.
      const squeeze = Math.min(util, 1.2);
      for (const m of parts.plateMats) {
        const c = signedStressColor(-squeeze * 0.9);
        m.color.setRGB(0.13 + c.r * 0.25, 0.16 + c.g * 0.25, 0.2 + c.b * 0.45);
      }
      if (parts.nutMat) {
        const c = signedStressColor(Math.min(util * 0.55, 1.3)); // nut sees part of the load
        parts.nutMat.color.setRGB(0.35 + c.r * 0.35, 0.38 + c.g * 0.35, 0.42 + c.b * 0.35);
      }
      // Nut spin: a fraction of a turn, scaled with preload for feel.
      const angle = Math.min(util, 1.4) * Math.PI * 0.85;
      if (parts.nut) parts.nut.rotation.y = -angle;

      // Elastic stretch of the gripped length, exaggerated to be visible.
      const strain = r.sigma / (P.cls.E * 1e9 || 1); // ~0.3% at proof
      const stretch = Math.min(parts.gripLen * (strain * 45), parts.gripLen * 0.16);
      if (parts.gripShank) {
        const s = 1 + stretch / parts.gripLen;
        parts.gripShank.scale.y = s;
        parts.gripShank.position.y = parts.gripBottomY + (s * parts.gripLen) / 2;
      }
      if (parts.head) {
        parts.head.position.y = parts.gripBottomY + parts.gripLen + stretch + parts.headH / 2;
      }
    };

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
        osc.frequency.value = 60;
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
      bp.frequency.value = 900;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start();
    };
    const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    const updateFeel = (T: number) => {
      const util = utilFor(T);
      const a = audioRef.current;
      if (a) {
        // creaking wrench: pitch climbs with load
        a.gain.gain.setTargetAtTime(Math.min(0.13, util * 0.11), a.ctx.currentTime, 0.02);
        a.osc.frequency.setTargetAtTime(55 + Math.min(util, 1.5) * 260, a.ctx.currentTime, 0.02);
      }
      const yielding = util >= 1;
      if (yielding && !yieldRef.current) {
        crack();
        if (canVibrate()) navigator.vibrate([0, 45, 25, 75]);
      }
      yieldRef.current = yielding;
      if (canVibrate()) {
        const now = performance.now();
        const interval = 220 - Math.min(util, 1.2) * 150; // ratchet ticks speed up with load
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
      // Damped spring-back to the design torque after a release.
      if (springRef.current) {
        const target = designTorqueRef.current;
        const cur = liveTorqueRef.current;
        springVelRef.current = (springVelRef.current + (target - cur) * 0.22) * 0.78;
        let ncur = cur + springVelRef.current;
        const tol = Math.max(1e-3, Math.abs(target) * 1e-4);
        if (Math.abs(target - ncur) < tol && Math.abs(springVelRef.current) < tol) {
          ncur = target;
          springRef.current = false;
          propsRef.current.onLiveTorque(null);
        } else {
          propsRef.current.onLiveTorque(ncur);
        }
        liveTorqueRef.current = ncur;
      }
      if (forceRef.current || liveTorqueRef.current !== lastApplied) {
        applyTorque(liveTorqueRef.current);
        lastApplied = liveTorqueRef.current;
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
    let dragStartX = 0;
    let dragStartTorque = 0;

    const hitsNut = (e: PointerEvent) => {
      const target = partsRef.current.proxy;
      if (!target) return false;
      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(target).length > 0;
    };

    const down = (e: PointerEvent) => {
      const s = stateRef.current;
      // Interactive: grab the nut to tighten; miss the nut → orbit.
      if (propsRef.current.interactive && hitsNut(e)) {
        grabbingRef.current = true;
        springRef.current = false;
        springVelRef.current = 0;
        dragStartX = e.clientX;
        dragStartTorque = liveTorqueRef.current;
        ensureAudio();
        el.style.cursor = "ew-resize";
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
        const wpx = rect.width || 480;
        const P = propsRef.current;
        // Full-width drag sweeps ~2.2× the recommended torque — enough to
        // walk the joint well past proof and feel it let go.
        const Trec = boltResults(P.thread, P.cls, P.K, 0, P.grip).Trec;
        const nmPerPx = (Trec * 2.2) / wpx;
        let nt = dragStartTorque + (e.clientX - dragStartX) * nmPerPx;
        nt = Math.max(0, Math.min(Trec * 3, nt));
        liveTorqueRef.current = nt;
        propsRef.current.onLiveTorque(nt);
        updateFeel(nt);
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
        springRef.current = true; // release the wrench → settle back to the design torque
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

  // (Re)build the joint whenever thread size or grip length changes.
  // Torque-dependent visuals are applied per-frame by the animation loop.
  useEffect(() => {
    const pivot = pivotRef.current;
    if (!pivot) return;
    const parts = partsRef.current;

    // Clear the previous assembly.
    const old = pivot.getObjectByName("joint");
    if (old) {
      pivot.remove(old);
      old.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    }

    const joint = new THREE.Group();
    joint.name = "joint";
    pivot.add(joint);

    // Real proportions (mm), then normalized so the assembly is ~3.4 tall.
    const d = Math.max(thread.d, 0.5);
    const p = Math.max(thread.p, 0.1);
    const gripMm = Math.max(grip, d * 0.6);
    const headH = 0.7 * d;
    const nutH = 0.8 * d;
    const tailMm = 0.8 * d + 2.5 * p;
    const totalMm = headH + gripMm + nutH + tailMm;
    const scale = 3.4 / totalMm;

    const hexR = (1.5 * d * scale) / Math.sqrt(3) * 1.155; // across-flats 1.5d → circumradius
    const r = 0.5 * d * scale;
    const gripV = gripMm * scale;
    const headV = headH * scale;
    const nutV = nutH * scale;
    const tailV = tailMm * scale;
    const plateW = Math.min(2.6 * d, gripMm * 2 + 1.5 * d) * scale;

    const topY = (headV + gripV + nutV + tailV) / 2;
    const gripTopY = topY - headV;
    const gripBottomY = gripTopY - gripV;
    const nutCenterY = gripBottomY - nutV / 2;
    const tailTopY = gripBottomY - nutV;

    const steel = { metalness: 0.55, roughness: 0.42 };

    // Head: hex prism + a thin washer face.
    const headMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, ...steel });
    const head = new THREE.Mesh(new THREE.CylinderGeometry(hexR, hexR, headV, 6), headMat);
    head.position.y = gripTopY + headV / 2;
    joint.add(head);

    // Gripped shank — the loaded length; its color carries the stress story.
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x4fb477, metalness: 0.35, roughness: 0.5 });
    const gripShank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, gripV, 32), gripMat);
    gripShank.position.y = gripBottomY + gripV / 2;
    joint.add(gripShank);

    // Clamped plates (two halves of the grip stack), drawn translucent so the
    // loaded shank inside — the star of the show — stays visible.
    const plateMats: THREE.MeshStandardMaterial[] = [];
    const mkPlate = (h: number, cy: number, tone: number) => {
      const m = new THREE.MeshStandardMaterial({
        color: tone,
        metalness: 0.15,
        roughness: 0.85,
        transparent: true,
        opacity: 0.42,
      });
      plateMats.push(m);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, h, plateW), m);
      plate.position.y = cy;
      joint.add(plate);
    };
    const g1 = gripV * 0.5;
    mkPlate(g1 - gripV * 0.015, gripTopY - g1 / 2, 0x27313b);
    mkPlate(g1 - gripV * 0.015, gripBottomY + g1 / 2, 0x1f2831);

    // Nut: hex prism, spins as you tighten.
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x8b97a3, ...steel });
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(hexR * 0.98, hexR * 0.98, nutV, 6), nutMat);
    nut.position.y = nutCenterY;
    joint.add(nut);

    // Free tail below the nut: minor-diameter core + helical thread ridge.
    // This part carries no preload, so it stays neutral — a visible contrast
    // with the loaded grip above.
    const tail = new THREE.Group();
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x77848f, ...steel });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, tailV, 24), tailMat);
    core.position.y = tailTopY - tailV / 2;
    tail.add(core);
    const turns = Math.max(2, tailMm / p);
    const helixPts: THREE.Vector3[] = [];
    const NPTS = Math.ceil(turns * 24);
    for (let i = 0; i <= NPTS; i++) {
      const f = i / NPTS;
      const a = f * turns * Math.PI * 2;
      helixPts.push(new THREE.Vector3(Math.cos(a) * r * 0.95, tailTopY - f * tailV, Math.sin(a) * r * 0.95));
    }
    const helix = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helixPts), NPTS, Math.max(0.012, r * 0.14), 6),
      tailMat,
    );
    tail.add(helix);
    joint.add(tail);

    // Fat invisible grab proxy around the nut (raycast target only).
    const proxy = new THREE.Mesh(
      new THREE.CylinderGeometry(hexR * 2.2, hexR * 2.2, nutV * 2.6, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    proxy.position.y = nutCenterY;
    joint.add(proxy);

    // Center the assembly vertically in view.
    joint.position.y = 0;

    parts.gripShank = gripShank;
    parts.gripMat = gripMat;
    parts.head = head;
    parts.nut = nut;
    parts.nutMat = nutMat;
    parts.tail = tail;
    parts.plateMats = plateMats;
    parts.proxy = proxy;
    parts.gripBottomY = gripBottomY;
    parts.gripLen = gripV;
    parts.headH = headV;

    forceRef.current = true;
  }, [thread, grip]);

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
          ? "grab the nut and drag sideways to tighten · drag empty space to rotate"
          : "drag to rotate · proportions are true to the thread size"}
      </div>
    </div>
  );
}

// Equations behind the calculator, shown in the theory section.
const EQUATIONS: Array<{ expr: string; note: string }> = [
  { expr: "F = T / (K·d)", note: "Preload from tightening torque — nut-factor form" },
  { expr: "As = (π/4)·((d₂+d₃)/2)²", note: "Tensile stress area (tabulated, ISO 898-1)" },
  { expr: "σ = F / As", note: "Direct tensile stress in the shank" },
  { expr: "τ = 16·Tth / (π·ds³),  Tth ≈ 0.5·T", note: "Torsion from thread friction while torquing" },
  { expr: "σvm = √(σ² + 3τ²)", note: "Combined stress during tightening" },
  { expr: "n = Sp / σvm", note: "Safety factor against proof strength" },
  { expr: "ΔL = F·L / (E·As)", note: "Elastic stretch of the bolt over the grip" },
];

export default function BoltCalc() {
  const [threadKey, setThreadKey] = useState("M6");
  const [classKey, setClassKey] = useState("8.8 (medium-carbon, Q&T)");
  const [fricKey, setFricKey] = useState("Dry steel, plain (K ≈ 0.20)");
  const [grip, setGrip] = useState("20"); // mm clamped stack
  const [torque, setTorque] = useState("6"); // N·m
  const [interactive, setInteractive] = useState(true);
  const [liveTorque, setLiveTorque] = useState<number | null>(null); // N·m, while tightening

  const thread = THREADS[threadKey];
  const cls = CLASSES[classKey];
  const K = FRICTION[fricKey];

  // While interactively tightening, the readouts follow the live torque;
  // otherwise they reflect the design input.
  const effTorque = liveTorque != null ? liveTorque : num(torque);
  const isLive = liveTorque != null;

  const r = useMemo(() => boltResults(thread, cls, K, effTorque, num(grip)), [thread, cls, K, effTorque, grip]);

  const status =
    r.SF >= 1.25
      ? { c: "#4fb477", t: "SAFE" }
      : r.SF >= 1
        ? { c: "#d9a441", t: "MARGINAL" }
        : { c: "#d65c5c", t: "YIELDING" };

  const preloadStr = r.F >= 10000 ? (r.F / 1000).toFixed(2) : r.F >= 1000 ? (r.F / 1000).toFixed(3) : r.F.toFixed(1);
  const preloadUnit = r.F >= 1000 ? "kN" : "N";

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
              MECHCALC · FASTENERS
            </div>
            <h1 className="flexure-title" style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              Bolted Joint — Screw Strength
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
            <div>F = T / K·d</div>
            <div>σvm = √(σ² + 3τ²)</div>
          </div>
        </div>

        <div className="flexure-grid">
          {/* INPUTS */}
          <div className="flexure-inputs" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Select label="Thread (ISO metric coarse)" value={threadKey} onChange={setThreadKey}>
              {Object.keys(THREADS).map((k) => (
                <option key={k} value={k}>
                  {k} × {THREADS[k].p}
                </option>
              ))}
            </Select>
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: -8 }}>
              d = {thread.d} mm · As = {thread.As} mm²
            </div>

            <Select label="Property class" value={classKey} onChange={setClassKey} options={Object.keys(CLASSES)} />
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: -8 }}>
              Sp = {cls.sp} · Sy = {cls.sy} · Su = {cls.su} MPa
              {cls.note && (
                <div style={{ color: "#d9a441", marginTop: 3, lineHeight: 1.5 }}>⚠ {cls.note}</div>
              )}
            </div>

            <Select label="Lubrication / finish" value={fricKey} onChange={setFricKey} options={Object.keys(FRICTION)} />

            <Field label="Grip length L" unit="mm" value={grip} onChange={setGrip} min="0" />
            <Field label="Tightening torque T" unit="N·m" value={torque} onChange={setTorque} min="0" step="0.1" />
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: -8, lineHeight: 1.6 }}>
              recommended ≈ {r.Trec.toFixed(r.Trec < 10 ? 1 : 0)} N·m
              <br />
              (preload at {Math.round(TARGET_PRELOAD_FRACTION * 100)}% of proof)
            </div>
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
                  SAFETY FACTOR
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
                vs proof strength, while torquing
              </div>
            </div>

            <Readout label="Preload F" value={preloadStr} unit={preloadUnit} />
            <Readout label="Tension σ" value={(r.sigma / 1e6).toFixed(0)} unit="MPa" />
            <Readout label="Torsion τ" value={(r.tau / 1e6).toFixed(0)} unit="MPa" />
            <Readout label="von Mises σvm" value={(r.vm / 1e6).toFixed(0)} unit="MPa" accent={status.c} />
            <Readout
              label="Proof utilization"
              value={(r.util * 100).toFixed(0)}
              unit="%"
              accent={r.util > 1 ? "#d65c5c" : undefined}
            />
            <Readout label="Bolt stretch ΔL" value={(r.dL * 1e6).toFixed(1)} unit="µm" />
          </div>
        </div>

        {/* JOINT VISUALIZATION — 3D */}
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
                Bolted joint · 3D
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
                  ? `● tightening · T ${effTorque.toFixed(1)} N·m · F ${(r.F / 1000).toFixed(2)} kN`
                  : `${threadKey} · class ${classKey.split(" ")[0]} · grip ${num(grip)} mm`}
              </div>
            </div>
            <button
              onClick={() => {
                const nv = !interactive;
                setInteractive(nv);
                if (!nv) setLiveTorque(null); // leaving interactive → drop the live override
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
          <Bolt3D
            thread={thread}
            cls={cls}
            K={K}
            grip={num(grip)}
            torque={num(torque)}
            interactive={interactive}
            onLiveTorque={setLiveTorque}
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
            T torque · K nut factor · d nominal diameter · F preload · As tensile stress area · Sp proof
            strength · σ tension · τ torsion · ΔL stretch · L grip length · n safety factor
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
            <strong style={{ color: "#c2ccd4" }}>Model.</strong> Tightening a screw is stretching it: the
            wrench torque drives the nut down the thread incline, and the incline converts that twist into
            axial tension — the preload that clamps the plates together. Only the gripped length between
            head and nut carries this tension; the free tail past the nut is unloaded. The 3D joint shows
            this directly: the loaded shank warms from green through amber toward yield-red, the clamped
            plates cool toward compression-blue, and the tail stays green. Most of your torque never
            becomes preload — roughly half is spent on under-head friction and much of the rest on thread
            friction, which is why the nut factor K dominates the answer.
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
            <strong style={{ color: "#c2ccd4" }}>Designing a joint.</strong> A well-designed joint runs the
            bolt hard: target a preload of 60–75% of proof strength so the clamped parts never separate and
            the bolt sees almost none of the service load fluctuation (good for fatigue). While torquing,
            thread friction also twists the shank, so the combined von Mises stress is what to check — that
            torsion largely relaxes once the wrench is released. Use the recommended torque as a starting
            point, and remember K scatters ±25% between nominally identical joints; lubricate for
            consistency, not just lower torque.
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
            <strong style={{ color: "#c2ccd4" }}>Scope.</strong> This is the short-form nut-factor model
            (T = K·F·d) with the standard ~50% thread-torque split for torsion. It does not model external
            working loads, joint-stiffness load sharing, embedding relaxation, thread stripping, or
            fatigue — all of which matter in critical joints. Nut and plate threads are assumed strong
            enough that the bolt shank governs (true for a steel nut of standard height on a matching
            class bolt).
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
            a screw is a spring you pre-stretch on purpose. Torque it until the shank carries a healthy
            fraction of its proof strength, and the joint stays clamped no matter what rattles it — but
            since friction eats most of the torque and varies from bolt to bolt, treat the torque number as
            an estimate of preload, not a measurement of it.
          </p>
        </div>
      </div>
    </div>
  );
}
