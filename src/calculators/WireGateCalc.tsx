import { useState, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Field, Readout, num } from "../ui";
import { rampColor, TENSION_STOPS } from "./stressColor";
import { MATERIALS, GROUP_ORDER, FAVORITES } from "./materials";
import {
  wireGateResults,
  spreadMagnification,
  spreadShape,
  momentFraction,
  C_VALID_MIN,
} from "./wireGateMath";
import { reportHTML, tipsHTML, type WireGateState } from "./wireGateTheory";

// The stress ramp, baked to a lookup table — same trick as the shaft viewer:
// shading thousands of vertices per frame is the one hot loop here.
const RAMP_MAX = 1.3;
const RAMP_N = 256;
const RAMP_LUT = (() => {
  const arr = new Float32Array(RAMP_N * 3);
  for (let i = 0; i < RAMP_N; i++) {
    const c = rampColor(TENSION_STOPS, (i / (RAMP_N - 1)) * RAMP_MAX);
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  return arr;
})();
const rampIndex = (ratio: number) => {
  const i = ((ratio / RAMP_MAX) * (RAMP_N - 1)) | 0;
  return (i < 0 ? 0 : i > RAMP_N - 1 ? RAMP_N - 1 : i) * 3;
};

// ── The wire path ───────────────────────────────────────────────────
// The centreline of the formed wire, in millimetres, exactly as the inputs
// describe it: nose U-bend at x = 0 spanning z = ±w/2, legs running in −x to
// their tangs, a quarter-circle bend turning each end down (−y) into the pin
// that seats in the body. Every station carries which member it belongs to and
// how far along it sits, so the swing, the spread bow and the stress paint all
// come from the same math the readouts use.
type Member = "tang1" | "bend1" | "leg1" | "ubend" | "leg2" | "bend2" | "tang2";
type Station = { p: [number, number, number]; member: Member; xi: number };

function buildPath(L1: number, L2: number, w: number, rb: number, tangL: number): Station[] {
  const st: Station[] = [];
  const zT = w / 2;
  const zB = -w / 2;
  const push = (p: [number, number, number], member: Member, xi: number) => st.push({ p, member, xi });

  const N_TANG = 6;
  const N_BEND = 8;
  const N_LEG = 46;
  const N_U = 32;

  // tang 1 — the pivot pin, from its buried tip up to the bend, at z = +w/2
  for (let i = 0; i <= N_TANG; i++) {
    const t = i / N_TANG;
    push([-L1 - rb, -rb - tangL * (1 - t), zT], "tang1", 1 - t);
  }
  // tang bend 1: quarter circle from heading +y into heading +x
  for (let i = 1; i <= N_BEND; i++) {
    const t = (i / N_BEND) * (Math.PI / 2);
    push([-L1 - rb * Math.cos(t), -rb + rb * Math.sin(t), zT], "bend1", i / N_BEND);
  }
  // leg 1: tang → nose
  for (let i = 1; i <= N_LEG; i++) {
    const xi = i / N_LEG;
    push([-L1 + L1 * xi, 0, zT], "leg1", xi);
  }
  // U-bend nose: semicircle in the xz plane through the apex at x = +w/2
  for (let i = 1; i <= N_U; i++) {
    const t = (i / N_U) * Math.PI;
    push([(w / 2) * Math.sin(t), 0, (w / 2) * Math.cos(t)], "ubend", i / N_U);
  }
  // leg 2: nose → tang
  for (let i = 1; i <= N_LEG; i++) {
    const xi = 1 - i / N_LEG;
    push([-L2 + L2 * xi, 0, zB], "leg2", xi);
  }
  // tang bend 2
  for (let i = 1; i <= N_BEND; i++) {
    const t = (i / N_BEND) * (Math.PI / 2);
    push([-L2 - rb * Math.sin(t), -rb + rb * Math.cos(t), zB], "bend2", i / N_BEND);
  }
  // tang 2 — the offset pin, down into its hole
  for (let i = 1; i <= N_TANG; i++) {
    const t = i / N_TANG;
    push([-L2 - rb, -rb - tangL * t, zB], "tang2", t);
  }
  return st;
}

// In-plane spread bow, as a fraction of δ/2 toward the loop centreline:
// zero at the apex (symmetry midpoint), full at the pinned tangs. `xi` runs
// anchor→nose on legs, 0→1 across the U-bend.
function bowFraction(member: Member, xi: number, L: number, R: number): number {
  const arm = L + R;
  switch (member) {
    case "leg1":
    case "leg2":
      return spreadShape(((1 - xi) * L + R) / arm);
    case "ubend": {
      // distance from the apex along the arc, a small fraction of the arm
      const t = (Math.abs(xi - 0.5) * Math.PI * R) / arm;
      return spreadShape(t);
    }
    default:
      return 1; // tangs and their bends ride with the leg root
  }
}

// Stress ratio (vs allowable) at a station: with pinned, moment-free ends the
// moment is F·x from each pin — zero at the tangs, maximum at the U-bend,
// where the curved-wire factor Ki applies. σi is each side's apex-approach
// stress at the current spread; both come straight from the math module.
function stressRatio(
  member: Member,
  xi: number,
  s1: number,
  s2: number,
  L1: number,
  L2: number,
  R: number,
  Ki: number,
  allow: number,
): number {
  switch (member) {
    case "leg1":
      return (s1 * momentFraction(xi * L1, L1 + R)) / allow;
    case "leg2":
      return (s2 * momentFraction(xi * L2, L2 + R)) / allow;
    case "ubend": {
      const fromPin1 = L1 + xi * Math.PI * R;
      const fromPin2 = L2 + (1 - xi) * Math.PI * R;
      const f1 = momentFraction(fromPin1, L1 + R) * s1;
      const f2 = momentFraction(fromPin2, L2 + R) * s2;
      return (Ki * Math.max(f1, f2)) / allow;
    }
    case "bend1":
    case "tang1":
      return 0.02; // the pins are moment-free — that is the whole point
    case "bend2":
    case "tang2":
      return 0.02;
  }
}

type WireGeo = {
  geo: THREE.BufferGeometry;
  stations: Station[];
  ringN: number;
};

// Swept-tube topology once; positions, normals and colours are refilled every
// frame by the deflection pass (rotation-minimising frames walked along the
// deflected centreline).
function buildWireGeometry(stations: Station[], ringN: number): WireGeo {
  const S = stations.length;
  const pos = new Float32Array(S * ringN * 3);
  const nrm = new Float32Array(S * ringN * 3);
  const col = new Float32Array(S * ringN * 3);
  const idx: number[] = [];
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < ringN; j++) {
      const a = i * ringN + j;
      const b = i * ringN + ((j + 1) % ringN);
      const c = (i + 1) * ringN + j;
      const d = (i + 1) * ringN + ((j + 1) % ringN);
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  return { geo, stations, ringN };
}

const TABS: [string, string][] = [
  ["model", "Model"],
  ["theory", "Theory & report"],
  ["tips", "Design tips"],
];

const MONO = "var(--mono)";

// ── 3D wire-gate viewer ─────────────────────────────────────────────
// The formed wire exactly as dimensioned, pins buried in the body block.
// Grab the nose and swing it: the gate rotates about the long-leg pin at true
// scale, the offset pin drags the loop into its spread bow, and the colour
// runs pin-cool to apex-hot — the U-bend is where the stress lives. Release
// and the preload snaps it back onto its stop.
function WireGate3D({
  d,
  L1,
  L2,
  w,
  a,
  delta0,
  g,
  E,
  sigmaY,
  interactive,
  onLiveG,
  snapRef,
}: {
  d: number; // mm
  L1: number;
  L2: number;
  w: number;
  a: number;
  delta0: number;
  g: number;
  E: number; // GPa
  sigmaY: number; // MPa
  interactive: boolean;
  onLiveG: (mm: number | null) => void;
  snapRef?: { current: (() => string) | null };
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ yaw: -0.7, pitch: 0.52, dragging: false, lx: 0, ly: 0 });
  const pivotRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const meshRef = useRef<THREE.Mesh | null>(null);
  const wireGeoRef = useRef<WireGeo | null>(null);
  const proxyRef = useRef<THREE.Mesh | null>(null);
  const staticsRef = useRef<THREE.Group | null>(null);
  const ghostRef = useRef<THREE.Line | null>(null);

  // view transform: mm → view units, recentered, plus the model's half-extents
  // in view space so the camera can frame exactly what is there
  const xformRef = useRef({
    sc: 0.1,
    cx: 0,
    cy: 0,
    mag: 1,
    hx: 3,
    hy: 1.5,
    hz: 1.5,
    phiCap: 0.3, // how far the drag may swing, rad
    pivotX: -30, // pivot pin position, mm
    pivotZ: 4,
  });
  const applyRef = useRef<((phi: number) => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);

  // live swing angle in radians; rest is closed (φ = 0)
  const livePhiRef = useRef(0);
  const grabbingRef = useRef(false);
  const springRef = useRef(false);
  const springVelRef = useRef(0);
  const yieldRef = useRef(false);
  const forceRef = useRef(true);
  const lastVibeRef = useRef(0);
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null>(null);

  const propsRef = useRef({ d, L1, L2, w, a, delta0, g, E, sigmaY, interactive, onLiveG });
  useEffect(() => {
    propsRef.current = { d, L1, L2, w, a, delta0, g, E, sigmaY, interactive, onLiveG };
    forceRef.current = true;
  }, [d, L1, L2, w, a, delta0, g, E, sigmaY, interactive, onLiveG]);

  const resultsAtG = (gMM: number) => {
    const pr = propsRef.current;
    return wireGateResults(
      pr.E * 1e9,
      pr.sigmaY * 1e6,
      pr.d / 1000,
      pr.L1 / 1000,
      pr.L2 / 1000,
      pr.w / 1000,
      pr.a / 1000,
      pr.delta0 / 1000,
      gMM / 1000,
    );
  };

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1015");
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);

    const corner = new THREE.Vector3();
    const rot = new THREE.Matrix4();
    const fitCamera = () => {
      const vHalf = (camera.fov * Math.PI) / 360;
      const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
      const tanV = Math.tan(vHalf);
      const tanH = Math.tan(hHalf);
      rot.makeRotationFromEuler(new THREE.Euler(stateRef.current.pitch, stateRef.current.yaw, 0));
      let dist = 0;
      const consider = (x: number, y: number, z: number) => {
        corner.set(x, y, z).applyMatrix4(rot);
        dist = Math.max(dist, Math.abs(corner.x) / tanH + corner.z, Math.abs(corner.y) / tanV + corner.z);
      };
      const b = xformRef.current;
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) for (const sz of [-1, 1]) consider(sx * b.hx, sy * b.hy, sz * b.hz);
      camera.position.set(0, 0, dist * 1.08);
      camera.lookAt(0, 0, 0);
      const grid = gridRef.current;
      if (grid) {
        grid.scale.setScalar(Math.max(b.hx, 1) / 4.2);
        grid.position.y = -b.hy - 0.25;
      }
    };
    fitRef.current = fitCamera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(3, 6, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3a78c2, 0.45);
    rim.position.set(-5, 1, -4);
    scene.add(rim);

    const pivot = new THREE.Group();
    scene.add(pivot);
    pivotRef.current = pivot;

    const grid = new THREE.GridHelper(9, 18, 0x1f2a33, 0x141c22);
    pivot.add(grid);
    gridRef.current = grid;

    // Swing the gate to angle φ: rigid rotation about the pivot pin (true
    // scale), the spread bow the offset pin forces (exaggerated ×mag), and the
    // stress paint — all from the same math the readouts print.
    const T = new THREE.Vector3();
    const N = new THREE.Vector3();
    const B = new THREE.Vector3();
    const applyPhi = (phi: number) => {
      const wg = wireGeoRef.current;
      if (!wg) return;
      const pr = propsRef.current;
      const { sc, cx, cy, mag, pivotX, pivotZ } = xformRef.current;
      const R = pr.w / 2;
      const arm = Math.max(pr.L1, pr.L2) + R;
      const r = resultsAtG(phi * arm);
      const deltaMM = r.delta * 1000;
      const s1 = r.sigma1 / 1e6;
      const s2 = r.sigma2 / 1e6;
      const allow = Math.max(pr.sigmaY, 1e-9);

      const S = wg.stations.length;
      const ringN = wg.ringN;
      const rw = (pr.d / 2) * sc;
      const posA = wg.geo.attributes.position as THREE.BufferAttribute;
      const nrmA = wg.geo.attributes.normal as THREE.BufferAttribute;
      const colA = wg.geo.attributes.color as THREE.BufferAttribute;
      const P = posA.array as Float32Array;
      const Nr = nrmA.array as Float32Array;
      const C = colA.array as Float32Array;

      const cph = Math.cos(phi);
      const sph = Math.sin(phi);
      const bow = (deltaMM / 2) * mag;

      // deflected centreline in view space
      const cl = new Float32Array(S * 3);
      for (let i = 0; i < S; i++) {
        const st = wg.stations[i];
        let x = st.p[0];
        const y = st.p[1];
        let z = st.p[2];
        // spread bow: both sides squeezed toward the loop centreline,
        // nothing at the apex, full at the pins
        const side = st.member === "leg1" || st.member === "bend1" || st.member === "tang1"
          ? -1
          : st.member === "leg2" || st.member === "bend2" || st.member === "tang2"
            ? 1
            : st.xi < 0.5
              ? -1
              : 1;
        const L = side < 0 ? pr.L1 : pr.L2;
        z += side * bow * bowFraction(st.member, st.xi, L, R);
        // rigid swing about the pivot pin (tangs stay in their holes: the
        // pivot pin spins in place, the offset pin's residual is what the bow
        // just absorbed — shown to first order)
        if (st.member !== "tang1" && st.member !== "tang2") {
          const dx = x - pivotX;
          const dz = z - pivotZ;
          x = pivotX + dx * cph - dz * sph;
          z = pivotZ + dx * sph + dz * cph;
        }
        cl[i * 3] = (x - cx) * sc;
        cl[i * 3 + 1] = (y - cy) * sc;
        cl[i * 3 + 2] = z * sc;
      }

      // walk the frames
      let nx = 1;
      let ny = 0;
      let nz = 0;
      for (let i = 0; i < S; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(S - 1, i + 1);
        T.set(cl[i1 * 3] - cl[i0 * 3], cl[i1 * 3 + 1] - cl[i0 * 3 + 1], cl[i1 * 3 + 2] - cl[i0 * 3 + 2]).normalize();
        const dot = nx * T.x + ny * T.y + nz * T.z;
        N.set(nx - dot * T.x, ny - dot * T.y, nz - dot * T.z);
        if (N.lengthSq() < 1e-10) N.set(T.y, T.z, T.x);
        N.normalize();
        nx = N.x;
        ny = N.y;
        nz = N.z;
        B.crossVectors(T, N);

        const st = wg.stations[i];
        const ratio = stressRatio(st.member, st.xi, s1, s2, pr.L1, pr.L2, R, r.Ki, allow);
        const li = rampIndex(ratio);
        const cr = RAMP_LUT[li];
        const cg = RAMP_LUT[li + 1];
        const cb = RAMP_LUT[li + 2];

        for (let j = 0; j < ringN; j++) {
          const ang = (j / ringN) * 2 * Math.PI;
          const ca = Math.cos(ang);
          const sa = Math.sin(ang);
          const ox = N.x * ca + B.x * sa;
          const oy = N.y * ca + B.y * sa;
          const oz = N.z * ca + B.z * sa;
          const vi = (i * ringN + j) * 3;
          P[vi] = cl[i * 3] + rw * ox;
          P[vi + 1] = cl[i * 3 + 1] + rw * oy;
          P[vi + 2] = cl[i * 3 + 2] + rw * oz;
          Nr[vi] = ox;
          Nr[vi + 1] = oy;
          Nr[vi + 2] = oz;
          C[vi] = cr;
          C[vi + 1] = cg;
          C[vi + 2] = cb;
        }
      }
      posA.needsUpdate = true;
      nrmA.needsUpdate = true;
      colA.needsUpdate = true;

      // the grab proxy rides the swinging nose apex
      const proxy = proxyRef.current;
      if (proxy) {
        const ax = pr.w / 2;
        const dx = ax - pivotX;
        const dz = 0 - pivotZ;
        proxy.position.set(
          (pivotX + dx * cph - dz * sph - cx) * sc,
          (0 - cy) * sc,
          (pivotZ + dx * sph + dz * cph) * sc,
        );
      }
    };
    applyRef.current = applyPhi;

    // ── feel: a rising hum with load, a crack at yield ──
    const ensureAudio = () => {
      if (audioRef.current) {
        audioRef.current.ctx.resume?.();
        return;
      }
      try {
        const AC: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const osc = ctx.createOscillator();
        osc.type = "sine"; // a wire sings higher and cleaner than a shaft groans
        osc.frequency.value = 220;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioRef.current = { ctx, gain, osc };
      } catch {
        /* audio unavailable — silent fallback */
      }
    };
    const snapSound = () => {
      const au = audioRef.current;
      if (!au) return;
      try {
        const { ctx } = au;
        const dur = 0.12;
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const dd = buf.getChannelData(0);
        for (let i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / dd.length, 3);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 2400; // thin wire breaks bright
        bp.Q.value = 1.2;
        const gn = ctx.createGain();
        gn.gain.value = 0.28;
        src.connect(bp);
        bp.connect(gn);
        gn.connect(ctx.destination);
        src.start();
      } catch {
        /* ignore */
      }
    };
    const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    const updateFeel = (phi: number) => {
      const pr = propsRef.current;
      const arm = Math.max(pr.L1, pr.L2) + pr.w / 2;
      const r = resultsAtG(phi * arm);
      const ratio = r.sigmaPeak / Math.max(pr.sigmaY * 1e6, 1);
      const au = audioRef.current;
      if (au) {
        au.gain.gain.setTargetAtTime(Math.min(0.1, ratio * 0.09), au.ctx.currentTime, 0.02);
        au.osc.frequency.setTargetAtTime(180 + Math.min(ratio, 1.4) * 420, au.ctx.currentTime, 0.02);
      }
      const yielded = ratio >= 1;
      if (yielded && !yieldRef.current) {
        snapSound();
        if (canVibrate()) navigator.vibrate([0, 40, 20, 60]);
      }
      yieldRef.current = yielded;
      if (canVibrate()) {
        const now = performance.now();
        const interval = 220 - Math.min(ratio, 1.2) * 150;
        if (now - lastVibeRef.current > interval) {
          navigator.vibrate(5);
          lastVibeRef.current = now;
        }
      }
    };
    const stopFeel = () => {
      const au = audioRef.current;
      if (au) au.gain.gain.setTargetAtTime(0, au.ctx.currentTime, 0.08);
      yieldRef.current = false;
    };

    if (snapRef) {
      snapRef.current = () => {
        const dpr = renderer.getPixelRatio();
        scene.background = new THREE.Color("#ffffff");
        renderer.setPixelRatio(2);
        renderer.render(scene, camera);
        const url = renderer.domElement.toDataURL("image/png");
        scene.background = new THREE.Color("#0b1015");
        renderer.setPixelRatio(dpr);
        renderer.render(scene, camera);
        return url;
      };
    }

    let raf = 0;
    let lastApplied = NaN;
    const animate = () => {
      const st = stateRef.current;
      pivot.rotation.y = st.yaw;
      pivot.rotation.x = st.pitch;
      if (springRef.current) {
        const cur = livePhiRef.current;
        springVelRef.current = (springVelRef.current - cur * 0.22) * 0.76;
        let ncur = cur + springVelRef.current;
        if (Math.abs(ncur) < 2e-4 && Math.abs(springVelRef.current) < 2e-4) {
          ncur = 0;
          springRef.current = false;
          propsRef.current.onLiveG(null);
        } else {
          const arm = Math.max(propsRef.current.L1, propsRef.current.L2) + propsRef.current.w / 2;
          propsRef.current.onLiveG(ncur * arm);
        }
        livePhiRef.current = ncur;
      }
      if (forceRef.current || livePhiRef.current !== lastApplied) {
        applyPhi(livePhiRef.current);
        lastApplied = livePhiRef.current;
        forceRef.current = false;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const wd = mount.clientWidth;
      const ht = mount.clientHeight || 320;
      // A resize while the mount is display:none (printing hides the app)
      // reads 0 wide; letting that into camera.aspect makes every later
      // projection degenerate and the canvas permanently black.
      if (wd < 2) return;
      camera.aspect = wd / ht;
      camera.updateProjectionMatrix();
      fitCamera();
      renderer.setSize(wd, ht);
    };
    window.addEventListener("resize", onResize);

    const el = renderer.domElement;
    // A lost WebGL context (low GPU memory, driver reset) otherwise leaves the
    // canvas permanently black; preventDefault opts in to restoration, and the
    // restore handler forces the next frame to repaint everything.
    const onCtxLost = (e: Event) => e.preventDefault();
    const onCtxRestored = () => {
      forceRef.current = true;
    };
    el.addEventListener("webglcontextlost", onCtxLost);
    el.addEventListener("webglcontextrestored", onCtxRestored);
    el.style.touchAction = "none";
    el.style.cursor = "grab";
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartPhi = 0;
    let dirPx = { x: 0, y: 1 };
    let radPerPx = 0.002;

    const hitsGrip = (e: PointerEvent) => {
      const target = proxyRef.current;
      if (!target) return false;
      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(target).length > 0;
    };

    // Which way does the nose swing on screen right now? Project the nose and
    // a point a hair along its swing tangent, take the screen difference.
    const toScreen = (v: THREE.Vector3, rect: DOMRect) => {
      const p = v.clone().project(camera);
      return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
    };
    const captureDir = (rect: DOMRect) => {
      const proxy = proxyRef.current;
      if (!proxy) return;
      const { sc, cx, pivotX, pivotZ } = xformRef.current;
      const world = proxy.getWorldPosition(new THREE.Vector3());
      const local = pivot.worldToLocal(world.clone());
      // swing tangent: perpendicular to the pivot→nose arm, in the loop plane
      const rx = local.x - (pivotX - cx) * sc;
      const rz = local.z - pivotZ * sc;
      const len = Math.hypot(rx, rz) || 1;
      const tangent = new THREE.Vector3(-rz / len, 0, rx / len).multiplyScalar(0.3);
      const ahead = pivot.localToWorld(local.clone().add(tangent));
      const pA = toScreen(world, rect);
      const pB = toScreen(ahead, rect);
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const dLen = Math.hypot(dx, dy) || 1;
      dirPx = { x: dx / dLen, y: dy / dLen };
      // Half the canvas height sweeps the full allowed swing.
      radPerPx = xformRef.current.phiCap / (rect.height * 0.5);
    };

    const down = (e: PointerEvent) => {
      const st = stateRef.current;
      if (propsRef.current.interactive && hitsGrip(e)) {
        grabbingRef.current = true;
        springRef.current = false;
        springVelRef.current = 0;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartPhi = livePhiRef.current;
        captureDir(el.getBoundingClientRect());
        ensureAudio();
        el.style.cursor = "grabbing";
        el.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        return;
      }
      st.dragging = true;
      st.lx = e.clientX;
      st.ly = e.clientY;
      el.style.cursor = "grabbing";
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (grabbingRef.current) {
        e.preventDefault();
        const along = (e.clientX - dragStartX) * dirPx.x + (e.clientY - dragStartY) * dirPx.y;
        let nphi = dragStartPhi + along * radPerPx;
        nphi = Math.max(0, Math.min(xformRef.current.phiCap, nphi));
        livePhiRef.current = nphi;
        const arm = Math.max(propsRef.current.L1, propsRef.current.L2) + propsRef.current.w / 2;
        propsRef.current.onLiveG(nphi * arm);
        updateFeel(nphi);
        return;
      }
      const st = stateRef.current;
      if (!st.dragging) return;
      e.preventDefault();
      st.yaw += (e.clientX - st.lx) * 0.01;
      st.pitch += (e.clientY - st.ly) * 0.01;
      st.pitch = Math.max(-1.4, Math.min(1.4, st.pitch));
      st.lx = e.clientX;
      st.ly = e.clientY;
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
    const blockTouch = (ev: TouchEvent) => {
      if (stateRef.current.dragging || grabbingRef.current) ev.preventDefault();
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
      el.removeEventListener("webglcontextlost", onCtxLost);
      el.removeEventListener("webglcontextrestored", onCtxRestored);
      try {
        audioRef.current?.ctx.close();
      } catch {
        /* ignore */
      }
      audioRef.current = null;
      if (snapRef) snapRef.current = null;
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  // Rebuild the wire, its body block and ghost whenever geometry changes.
  useEffect(() => {
    const pivot = pivotRef.current;
    if (!pivot) return;

    const dispose = (o: THREE.Object3D | null) => {
      if (!o) return;
      pivot.remove(o);
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) (m.material as THREE.Material).dispose();
      });
    };
    dispose(meshRef.current);
    dispose(staticsRef.current);
    dispose(ghostRef.current);
    if (proxyRef.current) {
      pivot.remove(proxyRef.current);
      proxyRef.current.geometry.dispose();
      (proxyRef.current.material as THREE.Material).dispose();
      proxyRef.current = null;
    }

    const dV = Math.max(d, 0.2);
    const L1v = Math.max(L1, 2);
    const L2v = Math.max(L2, 2);
    const wV = Math.max(w, dV * 2);
    const rbV = Math.max(1.2 * dV, 1.5);
    const tangL = Math.max(3, 2 * dV);
    const Lmax = Math.max(L1v, L2v);
    const R = wV / 2;
    const arm = Lmax + R;

    const r0 = wireGateResults(
      E * 1e9,
      sigmaY * 1e6,
      dV / 1000,
      L1v / 1000,
      L2v / 1000,
      wV / 1000,
      Math.max(a, 1) / 1000,
      Math.max(delta0, 0) / 1000,
      Math.max(g, 0) / 1000,
    );
    const mag = spreadMagnification(r0.deltaYield, wV / 1000);
    // The drag may swing a bit past yield — capped so the nose can't sweep
    // through the body when the budget is unreachable.
    const phiCap = Math.min(
      0.55,
      isFinite(r0.gYield) ? (1.3 * r0.gYield * 1000) / arm : (2.5 * Math.max(g, 2)) / arm,
    );

    // mm → view: normalise the long dimension, recentre on the true bounding
    // box, including the arc the nose sweeps at full allowed swing.
    const sc = 6.6 / (Lmax + rbV + wV / 2 + 2);
    const sweep = arm * Math.sin(phiCap) + wV / 2;
    const minX = -Lmax - rbV - dV;
    const maxX = wV / 2 + dV;
    const minY = -(rbV + tangL) - dV;
    const cx = (minX + maxX) / 2;
    const cy = minY / 2;
    xformRef.current = {
      sc,
      cx,
      cy,
      mag,
      hx: ((maxX - minX) / 2 + 1.5) * sc,
      hy: (-minY / 2 + 1.5) * sc,
      hz: (Math.max(wV / 2 + (r0.deltaYield * 1000 * mag) / 2, sweep) + 2.5) * sc,
      phiCap,
      pivotX: -L1v - rbV,
      pivotZ: wV / 2,
    };

    const stations = buildPath(L1v, L2v, wV, rbV, tangL);
    const wg = buildWireGeometry(stations, 12);
    wireGeoRef.current = wg;

    const mesh = new THREE.Mesh(
      wg.geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.4,
        roughness: 0.42,
        side: THREE.DoubleSide, // frame winding varies along the swept tube
      }),
    );
    pivot.add(mesh);
    meshRef.current = mesh;

    // body block both pins bury themselves in, with a boss at each hole
    const statics = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a242c, metalness: 0.1, roughness: 0.95 });
    const px1 = -L1v - rbV;
    const px2 = -L2v - rbV;
    const bodyW = (Math.abs(px1 - px2) + 10) * sc;
    const bodyX = ((px1 + px2) / 2 - cx) * sc;
    const bodyTopY = (-rbV - tangL * 0.45 - cy) * sc;
    const bodyH = tangL * 1.6 * sc;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, (wV + 8) * sc), bodyMat);
    body.position.set(bodyX, bodyTopY - bodyH / 2, 0);
    statics.add(body);
    for (const [hx, hz] of [
      [px1, wV / 2],
      [px2, -wV / 2],
    ]) {
      const boss = new THREE.Mesh(new THREE.CylinderGeometry(dV * 1.4 * sc, dV * 1.4 * sc, 1.2 * sc, 16), bodyMat.clone());
      boss.position.set((hx - cx) * sc, bodyTopY + 0.6 * sc, hz * sc);
      statics.add(boss);
    }
    pivot.add(statics);
    staticsRef.current = statics;

    // ghost: the closed position, so the swing reads against something
    const ghostPts: THREE.Vector3[] = [];
    for (const st of stations) {
      if (st.member === "tang1" || st.member === "tang2") continue;
      ghostPts.push(new THREE.Vector3((st.p[0] - cx) * sc, (st.p[1] - cy) * sc, st.p[2] * sc));
    }
    const ghost = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ghostPts),
      new THREE.LineBasicMaterial({ color: 0x46515c, transparent: true, opacity: 0.85 }),
    );
    pivot.add(ghost);
    ghostRef.current = ghost;

    // fat invisible grab target at the nose
    const proxy = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(dV * 3.2 * sc, 0.22), 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    pivot.add(proxy);
    proxyRef.current = proxy;

    fitRef.current?.();
    forceRef.current = true;
    applyRef.current?.(livePhiRef.current);
  }, [d, L1, L2, w, a, delta0, g, E, sigmaY]);

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
          ? "grab the gate nose and swing it open · drag empty space to rotate the view"
          : "drag to rotate · the grey line is the closed position"}
      </div>
    </div>
  );
}

// Equations behind the calculator, shown in the theory tab.
const EQUATIONS: Array<{ expr: string; note: string }> = [
  { expr: "I = πd⁴/64", note: "Round-wire second moment" },
  { expr: "δ/F = [L³/3 + πRL²/2 + 2LR² + πR³/4]/EI", note: "Side compliance — pinned end, Castigliano" },
  { expr: "k = 1/(δ₁/F + δ₂/F)", note: "Loop spread rate: the halves in series" },
  { expr: "φ = g/(L+R) · s = 2a·sin(φ/2)", note: "Swing becomes spread through the pin offset a" },
  { expr: "F_pin = k·(δ₀+s) · T = F_pin·a·cos(φ/2)", note: "Pin force and the torque your thumb fights" },
  { expr: "σ = F_pin·(L+R)·c / I", note: "Moment zero at the pins, maximum at the U-bend" },
  { expr: "Ki = (4C²−C−1)/4C(C−1), C = w/d", note: "Curved-wire inner fibre at the U-bend" },
  { expr: "δ_y = σ_allow·I / Ki·(L+R)·c·k", note: "The spread budget — all the flex the wire has" },
];

export default function WireGateCalc() {
  const [matKey, setMatKey] = useState("Music Wire (ASTM A228)");
  const [dIn, setDIn] = useState("2"); // mm
  const [L1In, setL1In] = useState("30");
  const [L2In, setL2In] = useState("26");
  const [wIn, setWIn] = useState("8");
  const [aIn, setAIn] = useState("20");
  const [d0In, setD0In] = useState("1.0");
  const [gIn, setGIn] = useState("5");
  const [tab, setTab] = useState("model");
  const [interactive, setInteractive] = useState(true);
  const [liveG, setLiveG] = useState<number | null>(null);
  const [printDoc, setPrintDoc] = useState<{ brief: boolean; img: string } | null>(null);
  const snapRef = useRef<(() => string) | null>(null);

  const mat = MATERIALS[matKey];
  const dMM = Math.max(num(dIn), 0.1);
  const L1 = num(L1In);
  const L2 = num(L2In);
  const wU = num(wIn);
  const aPin = num(aIn);
  const delta0 = num(d0In);
  const gOpen = num(gIn);

  // Design state: closed on preload, opened to g.
  const r = useMemo(
    () =>
      wireGateResults(
        mat.E * 1e9,
        mat.sigmaY * 1e6,
        dMM / 1000,
        L1 / 1000,
        L2 / 1000,
        wU / 1000,
        aPin / 1000,
        delta0 / 1000,
        gOpen / 1000,
      ),
    [mat, dMM, L1, L2, wU, aPin, delta0, gOpen],
  );

  // While swinging, the stress readouts follow the finger.
  const isLive = liveG != null;
  const rEff = useMemo(
    () =>
      isLive
        ? wireGateResults(
            mat.E * 1e9,
            mat.sigmaY * 1e6,
            dMM / 1000,
            L1 / 1000,
            L2 / 1000,
            wU / 1000,
            aPin / 1000,
            delta0 / 1000,
            (liveG as number) / 1000,
          )
        : r,
    [isLive, liveG, mat, dMM, L1, L2, wU, aPin, delta0, r],
  );

  const mag = spreadMagnification(r.deltaYield, Math.max(wU, 1) / 1000);
  const tightBend = r.C < C_VALID_MIN;
  const bigSwing = r.phiMax > 0.5;

  const status =
    rEff.SF >= 1.5
      ? { c: "#4fb477", t: "SAFE" }
      : rEff.SF >= 1
        ? { c: "#d9a441", t: "MARGINAL" }
        : { c: "#d65c5c", t: "YIELDING" };

  const state: WireGateState = {
    matKey,
    E: mat.E,
    sigmaY: mat.sigmaY,
    d: dMM,
    L1,
    L2,
    w: wU,
    a: aPin,
    delta0,
    g: gOpen,
    r,
  };

  const exportPDF = (brief: boolean) => setPrintDoc({ brief, img: snapRef.current?.() ?? "" });
  useEffect(() => {
    if (!printDoc) return;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setPrintDoc(null);
      }
    };
    window.addEventListener("afterprint", finish);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        setTimeout(finish, 700);
      }),
    );
    return () => {
      window.removeEventListener("afterprint", finish);
      cancelAnimationFrame(raf);
    };
  }, [printDoc]);

  const lab = {
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "#6b7884",
    fontFamily: MONO,
  };
  const hint = { fontFamily: MONO, fontSize: 10, color: "#46515c", lineHeight: 1.6 };
  const btn = {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
    cursor: "pointer",
    borderRadius: 2,
    padding: "7px 11px",
    background: "#0e1419",
    border: "1px solid #1f2a33",
    color: "#8b97a3",
  };

  return (
    <div
      className="flexure-shell"
      style={{
        ["--mono" as string]: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
        ["--sans" as string]: "'Inter', system-ui, sans-serif",
        minHeight: "100vh",
        color: "#e8edf1",
        fontFamily: "var(--sans)",
      }}
    >
      <div className="calc-page" style={{ maxWidth: 760, margin: "0 auto" }}>
        {/* Header */}
        <div
          className="flexure-header"
          style={{ borderBottom: "1px solid #1f2a33", paddingBottom: 14, marginBottom: 4 }}
        >
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.25em", color: "#3a78c2" }}>
              MECHCALC · SPRINGS
            </div>
            <h1
              className="flexure-title"
              style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              Wire-Gate Clip Spring
            </h1>
          </div>
          <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 10, color: "#46515c", lineHeight: 1.6 }}>
            <div>s = 2a·sin(φ/2)</div>
            <div>σ = F(L+R)c / I</div>
          </div>
        </div>

        <div className="tabbar" role="tablist">
          {TABS.map(([k, t]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={`tabbtn${tab === k ? " on" : ""}`}
              onClick={() => setTab(k)}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── MODEL ─────────────────────────────────────────────────── */}
        <div className={`tabpane${tab === "model" ? " on" : ""}`}>
          <div className="flexure-grid" style={{ marginTop: 14 }}>
            {/* INPUTS */}
            <div className="flexure-inputs" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={lab}>Material</label>
                <select
                  value={matKey}
                  onChange={(e) => setMatKey(e.target.value)}
                  style={{
                    background: "#0e1419",
                    border: "1px solid #1f2a33",
                    borderRadius: 2,
                    color: "#e8edf1",
                    padding: "9px 11px",
                    fontFamily: MONO,
                    fontSize: 14,
                    outline: "none",
                  }}
                >
                  <optgroup label="★ Spring wire">
                    {["Music Wire (ASTM A228)", "Stainless 302/304 (spring wire)", "Spring Steel (1095)"].map(
                      (k) => (
                        <option key={`fav-${k}`} value={k}>
                          {k}
                        </option>
                      ),
                    )}
                  </optgroup>
                  <optgroup label="★ Favorites">
                    {FAVORITES.map((k) => (
                      <option key={`fav2-${k}`} value={k}>
                        {k}
                      </option>
                    ))}
                  </optgroup>
                  {GROUP_ORDER.map((gr) => (
                    <optgroup key={gr} label={gr}>
                      {Object.keys(MATERIALS)
                        .filter((k) => MATERIALS[k].grp === gr)
                        .map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <div style={{ ...hint, marginTop: 2 }}>
                  E = {mat.E} GPa · σ_allow {mat.sigmaY} MPa
                  {mat.grp === "Metal" ? " (typical at ~2 mm wire)" : " — an unusual choice for a wire form"}
                </div>
              </div>

              <Field label="Wire diameter d" unit="mm" value={dIn} onChange={setDIn} min="0.1" step="0.1" />
              <Field label="Long leg L₁ (pivot side)" unit="mm" value={L1In} onChange={setL1In} min="1" step="1" />
              <Field label="Short leg L₂" unit="mm" value={L2In} onChange={setL2In} min="1" step="1" />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Field label="U-bend width w" unit="mm" value={wIn} onChange={setWIn} min="1" step="0.5" />
                <div style={hint}>
                  C = w/d = {r.C.toFixed(2)} →{" "}
                  <span style={{ color: tightBend ? "#d9a441" : status.c }}>Ki = {r.Ki.toFixed(3)}</span>
                  {tightBend && ` · below C = ${C_VALID_MIN}, tighter than spring practice`}
                </div>
              </div>

              {/* The crank. Swinging the gate only stresses the wire because
                  the second pin is offset — this is the force knob. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Field label="Pin separation a" unit="mm" value={aIn} onChange={setAIn} min="1" step="1" />
                <input
                  type="range"
                  min={2}
                  max={Math.max(10, Math.round(L1 * 1.2))}
                  step={1}
                  value={aPin}
                  aria-label="Pin separation"
                  onChange={(e) => setAIn(e.target.value)}
                  style={{ width: "100%", accentColor: status.c, minWidth: 0 }}
                />
                <div style={hint}>
                  the crank: distance pivot pin → offset pin · turns swing into spread, multiplies closing
                  torque
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Field label="Assembly preload δ₀" unit="mm" value={d0In} onChange={setD0In} min="0" step="0.1" />
                <div style={hint}>
                  offset-hole spread built in at assembly — snaps the gate shut at {r.Fnose0.toFixed(1)} N
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Field label="Nose opening g" unit="mm" value={gIn} onChange={setGIn} min="0" step="0.5" />
                <div style={hint}>
                  how far the gate must open · swing {((r.phiMax * 180) / Math.PI).toFixed(1)}° → spread +
                  {(r.s * 1000).toFixed(2)} mm
                </div>
                {bigSwing && (
                  <div style={{ ...hint, color: "#d9a441" }}>
                    swing {((r.phiMax * 180) / Math.PI).toFixed(0)}° — beyond small-swing kinematics, treat as
                    a trend
                  </div>
                )}
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
                  <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.15em", color: "#6b7884" }}>
                    {isLive ? "LIVE SF" : "GATE SPRING SF"}
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
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
                    fontFamily: MONO,
                    fontSize: 38,
                    fontWeight: 600,
                    color: status.c,
                    marginTop: 6,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {isFinite(rEff.SF) ? rEff.SF.toFixed(2) : "∞"}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: "#6b7884" }}>
                  Ki·σ at the U-bend vs σ_allow{isLive ? " — following your swing" : " at full open"}
                </div>
              </div>

              <Readout
                label="Loop spread rate k"
                value={(r.k / 1000).toFixed(2)}
                unit="N/mm"
                hint="pinned ends — the whole wire flexes"
              />
              <Readout
                label="Closed force"
                value={r.Fnose0.toFixed(1)}
                unit="N"
                hint={`at the nose · pin force ${r.Fpin0.toFixed(1)} N · torque ${(r.T0 * 1000).toFixed(0)} N·mm`}
              />
              <Readout
                label={isLive ? "Live opening force" : "Full-open force"}
                value={rEff.FnoseOpen.toFixed(1)}
                unit="N"
                accent={isLive ? status.c : undefined}
                hint={
                  isLive
                    ? `at g ${(liveG as number).toFixed(1)} mm · pin ${rEff.FpinOpen.toFixed(1)} N`
                    : `thumb feel at g = ${gOpen.toFixed(1)} mm · pin ${r.FpinOpen.toFixed(1)} N`
                }
              />
              <Readout
                label="Peak stress"
                value={(rEff.sigmaPeak / 1e6).toFixed(0)}
                unit="MPa"
                accent={status.c}
                hint={`U-bend apex, side ${r.hotSide} arm · Ki ${r.Ki.toFixed(2)} on ${(Math.max(rEff.sigma1, rEff.sigma2) / 1e6).toFixed(0)} MPa`}
              />
              <Readout
                label="Spread budget δ_y"
                value={(r.deltaYield * 1000).toFixed(2)}
                unit="mm"
                accent={r.budgetUsed > 0.85 ? "#d9a441" : undefined}
                hint={`${(100 * r.budgetUsed).toFixed(0)}% used · bends open past g = ${isFinite(r.gYield) ? (r.gYield * 1000).toFixed(1) + " mm" : "reach"}`}
              />
            </div>
          </div>

          {/* 3D */}
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
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#6b7884",
                  }}
                >
                  Gate swing · 3D
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: isLive ? status.c : "#46515c", marginTop: 2 }}>
                  {isLive
                    ? `● swinging · g ${(liveG as number).toFixed(1)} mm · F ${rEff.FnoseOpen.toFixed(1)} N · ${((100 * rEff.sigmaPeak) / (mat.sigmaY * 1e6)).toFixed(0)}% of yield`
                    : `Ø${dMM} wire · legs ${L1}/${L2} · swing ×1 · spread bow shown ×${mag < 2 ? mag.toFixed(1) : mag.toFixed(0)}`}
                </div>
              </div>
              <button
                onClick={() => {
                  const nv = !interactive;
                  setInteractive(nv);
                  if (!nv) setLiveG(null);
                }}
                style={{
                  ...btn,
                  background: interactive ? `${status.c}1f` : "#0e1419",
                  border: `1px solid ${interactive ? status.c : "#1f2a33"}`,
                  color: interactive ? status.c : "#8b97a3",
                  whiteSpace: "nowrap",
                }}
              >
                {interactive ? "● Interactive" : "Interactive"}
              </button>
            </div>
            <WireGate3D
              d={dMM}
              L1={L1}
              L2={L2}
              w={wU}
              a={aPin}
              delta0={delta0}
              g={gOpen}
              E={mat.E}
              sigmaY={mat.sigmaY}
              interactive={interactive}
              onLiveG={setLiveG}
              snapRef={snapRef}
            />
          </div>
        </div>

        {/* ── THEORY & REPORT ───────────────────────────────────────── */}
        <div className={`tabpane${tab === "theory" ? " on" : ""}`}>
          <div className="btnrow">
            <button style={btn} onClick={() => exportPDF(true)}>
              ⇩ One-page summary
            </button>
            <button style={btn} onClick={() => exportPDF(false)}>
              ⇩ Full report
            </button>
            <span style={{ ...hint, flex: 1 }}>opens your browser&apos;s print dialog — choose “Save as PDF”</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 16 }}>
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
                <span style={{ fontFamily: MONO, fontSize: 13, color: "#e8edf1", whiteSpace: "nowrap" }}>
                  {eq.expr}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: "#6b7884", textAlign: "right" }}>
                  {eq.note}
                </span>
              </div>
            ))}
          </div>
          <div style={{ ...hint, marginTop: 10 }}>
            d wire diameter · L₁ L₂ leg lengths, tang bend → nose · R = w/2 U-bend radius · a pin separation ·
            δ₀ assembly preload spread · g nose opening · φ swing angle · C bend index · Ki curved-wire factor
            · n safety factor
          </div>

          <div dangerouslySetInnerHTML={{ __html: reportHTML(state) }} />

          <p className="calc-note">
            <strong>In short:</strong> the pins rotate freely, so the wire's ends carry no moment — the gate's
            swing is rigid, and only the spread the offset pin forces (δ₀ at assembly, 2a·sin(φ/2) on
            opening) ever flexes the loop. That spread is absorbed by the whole wire and checked at the
            U-bend. Buy closing force with the crank a, buy travel with leg length, keep C = w/d ≥ 3, and know
            the opening that bends it before someone finds it for you.
          </p>
        </div>

        {/* ── DESIGN TIPS ───────────────────────────────────────────── */}
        <div className={`tabpane${tab === "tips" ? " on" : ""}`}>
          <div className="theory" dangerouslySetInnerHTML={{ __html: tipsHTML(state) }} />
        </div>

        {/* The print document — mounted only while printing. */}
        {printDoc && (
          <div className={`calc-print ${printDoc.brief ? "brief" : "full"}`}>
            <div className="ph">
              <h1>Wire-Gate Clip Spring — {printDoc.brief ? "bench sheet" : "design calculation"}</h1>
              <div className="meta">
                Ø{dMM} mm wire · legs {L1}/{L2} mm · U-bend {wU} mm · pins {aPin} mm apart · {matKey}
                <br />
                δ₀ {delta0} mm + opening {gOpen} mm ({((r.phiMax * 180) / Math.PI).toFixed(1)}°) · closed{" "}
                {r.Fnose0.toFixed(1)} N → open {r.FnoseOpen.toFixed(1)} N at the nose
                {" · "}MechCalc — design check, not a substitute for full analysis
              </div>
            </div>

            <div className="headline" style={{ borderColor: r.SF >= 1 ? "#0a6b3d" : "#a01d1d" }}>
              <span className="n" style={{ color: r.SF >= 1 ? "#0a6b3d" : "#a01d1d" }}>
                n = {isFinite(r.SF) ? r.SF.toFixed(2) : "∞"}
              </span>
              <span className="w">
                Ki·σ {(r.sigmaPeak / 1e6).toFixed(0)} MPa vs {mat.sigmaY} MPa allowable · rate{" "}
                {(r.k / 1000).toFixed(2)} N/mm · budget {(r.deltaYield * 1000).toFixed(2)} mm (
                {(100 * r.budgetUsed).toFixed(0)}% used)
              </span>
            </div>

            {printDoc.img && (
              <figure className="fig">
                <img src={printDoc.img} alt="3D view of the wire gate, coloured by bending stress" />
                <figcaption>
                  The formed wire as modelled, painted by bending stress against σ_allow — cool at the
                  moment-free pins, hottest at the U-bend. Swing at true scale; spread bow shown ×
                  {mag < 2 ? mag.toFixed(1) : mag.toFixed(0)}.
                </figcaption>
              </figure>
            )}

            <h2>Spring &amp; loading</h2>
            <table className="rep">
              <tbody>
                <tr>
                  <td>Wire second moment I</td>
                  <td className="v">{(r.I * 1e12).toFixed(3)} mm⁴</td>
                </tr>
                <tr>
                  <td>Loop spread rate k</td>
                  <td className="v">{(r.k / 1000).toFixed(2)} N/mm</td>
                </tr>
                <tr>
                  <td>Swing at full open</td>
                  <td className="v">
                    {((r.phiMax * 180) / Math.PI).toFixed(1)}° → spread {(r.delta * 1000).toFixed(2)} mm
                  </td>
                </tr>
                <tr>
                  <td>Closed / open force at the nose</td>
                  <td className="v">
                    {r.Fnose0.toFixed(1)} / {r.FnoseOpen.toFixed(1)} N
                  </td>
                </tr>
                <tr>
                  <td>Bend index C · Ki</td>
                  <td className="v">
                    {r.C.toFixed(2)} · {r.Ki.toFixed(3)}
                  </td>
                </tr>
                <tr className="hi">
                  <td>Peak stress at the U-bend</td>
                  <td className="v">{(r.sigmaPeak / 1e6).toFixed(0)} MPa</td>
                </tr>
                <tr>
                  <td>Spread budget δ_y · used</td>
                  <td className="v">
                    {(r.deltaYield * 1000).toFixed(2)} mm · {(100 * r.budgetUsed).toFixed(0)}%
                  </td>
                </tr>
                <tr>
                  <td>Opening that bends it</td>
                  <td className="v">{isFinite(r.gYield) ? (r.gYield * 1000).toFixed(1) + " mm" : "beyond reach"}</td>
                </tr>
              </tbody>
            </table>

            <h2>Equations used</h2>
            <div className="eqs">
              {EQUATIONS.map((e) => (
                <div key={e.expr}>
                  {e.expr} <span style={{ color: "#666" }}>— {e.note}</span>
                </div>
              ))}
            </div>

            {!printDoc.brief && (
              <>
                <div className="sec brk">Worked calculation</div>
                <div dangerouslySetInnerHTML={{ __html: reportHTML(state) }} />
                <div className="sec brk">Design tips</div>
                <div className="theory" dangerouslySetInnerHTML={{ __html: tipsHTML(state) }} />
              </>
            )}

            <div className="foot">
              Static first-yield check on an idealised gate: frictionless pins, in-plane bending only,
              small-swing kinematics, no fatigue — a real gate is a fatigue part, keep working stress well
              under the static allowable for cyclic duty. The swing-to-spread chord is a worst case; measure
              δ₀ and the real spread on the part when it matters. Wire strength is typical at ~2 mm (size
              effect Sut = A/d^m applies). Not a strength rating for the hook or carabiner body. Material
              values are typical reference figures; verify before production use.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
