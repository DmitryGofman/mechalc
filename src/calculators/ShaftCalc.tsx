import { useState, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Field, Select, Readout, num } from "../ui";
import { rampColor, TENSION_STOPS } from "./stressColor";
import { MATERIALS, GROUP_ORDER, FAVORITES, poissonRatio } from "./materials";
import {
  STRESS_RAISERS,
  DEFAULT_RAISER,
  RD_VALID,
  shaftResults,
  torqueFromPower,
  powerFromTorque,
  twistMagnification,
  ktsFor,
  defaultRadius,
  rdInRange,
} from "./shaftMath";
import { reportHTML, tipsHTML, type ShaftState } from "./shaftTheory";

// ── The modelled surface ────────────────────────────────────────────
// Every vertex of the shaft is defined by (radius, angle, axial station), so
// twisting it is exactly what twisting a real shaft is: rotate each
// cross-section by θ(x) and leave the section itself alone. The feature
// descriptor below is what turns the chosen stress raiser into geometry you
// can see — a keyseat cut into the surface, a shoulder to a larger diameter,
// a circlip groove — and into the local multiplier that paints the hot spot.
type Feature = {
  rAt: (s: number, ang: number) => number; // surface radius at station s (0..1)
  nomR: (s: number) => number; // nominal section radius, for the σ ∝ 1/r³ scaling
  conc: (s: number, ang: number) => number; // local concentration, 1 … Kts
};

// The stress ramp, baked to a lookup table: shading tens of thousands of
// vertices every frame is the one hot loop in this view.
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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
// Shortest signed angle from b to a.
const angDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

// The keyseat is cut into the upper-front quarter rather than top dead centre:
// at the shallow angle this view looks down from, a slot on the very top is
// foreshortened into a line, and the one feature the calculator is really about
// should be the one you can see into.
const KEY_ANGLE = 0.62;

/**
 * Geometry for the chosen feature, cut at the radius the user specified.
 * `rV` is that machined radius in view units, and `K` the Kts it produces —
 * both come from the page, so the model you see and the number you read are
 * the same feature.
 */
function buildFeature(raiserKey: string, Ro: number, Lv: number, rV: number, K: number): Feature {
  const sr = STRESS_RAISERS[raiserKey];
  const plain: Feature = { rAt: () => Ro, nomR: () => Ro, conc: () => 1 };
  if (!sr || sr.kind === "none") return plain;
  const rf = Math.max(rV, 1e-4);

  if (sr.kind === "keyseat") {
    // Standard square key: width d/4, depth d/8 (ANSI B17.1). The adjustable
    // radius is the one at the bottom corners — the corner the crack starts in.
    const depth = 0.25 * Ro;
    const hw = Math.asin(0.25); // half-angle the key width subtends
    const s0 = 0.42;
    const s1 = 0.97;
    const fade = sr.runout ? 0.1 : 0.012;
    const along = (s: number) => smooth((s - s0) / fade) * smooth((s1 - s) / fade);
    // How much of the slot's half-width the corner radius eats into.
    const corner = Math.min(0.85 * hw, rf / Math.max(Ro, 1e-6));
    return {
      nomR: () => Ro, // the section loss is already inside Kts
      rAt: (s, ang) => {
        const da = angDiff(ang, KEY_ANGLE);
        if (Math.abs(da) > hw) return Ro;
        // Ease the floor back up into the wall over the corner radius.
        const round = corner > 1e-6 ? smooth((hw - Math.abs(da)) / corner) : 1;
        const dep = depth * along(s) * round;
        if (dep <= 1e-6) return Ro;
        return Math.min(Ro, (Ro - dep) / Math.cos(da)); // flat-bottomed slot
      },
      conc: (s, ang) => {
        const da = Math.abs(angDiff(ang, KEY_ANGLE));
        if (da > 3 * hw) return 1;
        // The peak lives on the slot's bottom corners, not on its floor.
        const g = Math.exp(-Math.pow((da - hw) / (0.75 * hw), 2));
        return 1 + (K - 1) * along(s) * g;
      },
    };
  }

  if (sr.kind === "step") {
    // Shoulder down to a bearing seat: the fillet radius is the whole story,
    // and here it is drawn at the size you asked for.
    const Rbig = Ro + rf + 0.22 * Ro;
    const xs = 0.38 * Lv; // axial position of the shoulder, view units
    const rAt = (s: number) => {
      const x = s * Lv;
      if (x >= xs) return Ro;
      if (x >= xs - rf) return Ro + rf - Math.sqrt(Math.max(0, rf * rf - (xs - x) * (xs - x)));
      return Rbig;
    };
    return {
      rAt: (s) => rAt(s),
      nomR: (s) => rAt(s),
      conc: (s) => 1 + (K - 1) * Math.exp(-Math.pow((s * Lv - xs) / (0.9 * rf), 2)),
    };
  }

  // Retaining-ring groove: standard depth ≈ 0.05d, and corners as sharp as the
  // tool leaves them — which is the whole problem with it.
  const dep = 0.1 * Ro;
  const wg = Math.max(0.1 * Ro, 2.2 * rf);
  const xg = 0.62 * Lv;
  return {
    rAt: (s) => {
      const dx = Math.abs(s * Lv - xg);
      if (dx >= wg / 2) return Ro;
      // Corner radius rounds the groove's shoulders.
      return Ro - dep * smooth((wg / 2 - dx) / Math.max(rf, 1e-6));
    },
    nomR: () => Ro, // Kts is quoted on the full-diameter nominal stress
    conc: (s) => 1 + (K - 1) * Math.exp(-Math.pow((s * Lv - xg) / (0.8 * wg), 2)),
  };
}

// The shaft mesh: outer surface, bore, and both end faces in one buffer.
// Alongside the positions we keep, per vertex, the base cross-section
// coordinates (y, z), the base normal, the axial fraction s, and a stress
// weight — so a frame update is one rotation and one ramp lookup per vertex.
type ShaftGeo = {
  geo: THREE.BufferGeometry;
  baseY: Float32Array;
  baseZ: Float32Array;
  baseNY: Float32Array;
  baseNZ: Float32Array;
  sOf: Float32Array;
  weight: Float32Array; // τ_local / τ_nominal at this vertex
};

function buildShaftGeometry(Ro: number, Ri: number, Lv: number, feat: Feature): ShaftGeo {
  const NX = 128;
  const NA = 120;
  const NR = 6; // radial rings on the end faces

  const pos: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  const baseY: number[] = [];
  const baseZ: number[] = [];
  const baseNY: number[] = [];
  const baseNZ: number[] = [];
  const sOf: number[] = [];
  const weight: number[] = [];

  const hollow = Ri > 1e-6;
  const secFactor = (s: number) => Math.pow(Ro / Math.max(feat.nomR(s), 1e-6), 3);

  // radialFrac: where this vertex sits between the axis (no shear) and the
  // surface (all of it). Surface vertices are pinned at 1 — a keyseat floor is
  // hot because of Kts, not cool because it is nearer the axis.
  //
  // The normal is assembled from its three cylindrical components: axial (nx),
  // radial (nr) and tangential (nt). The tangential one is what makes a keyseat
  // look like a cut rather than a painted stripe — without it the slot walls
  // are lit exactly like the round surface they were milled out of.
  const push = (
    x: number,
    ang: number,
    r: number,
    s: number,
    nx: number,
    nr: number,
    nt: number,
    radialFrac: number,
  ) => {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const y = r * sa;
    const z = r * ca;
    const ny = nr * sa + nt * ca;
    const nz = nr * ca - nt * sa;
    const len = Math.hypot(nx, ny, nz) || 1;
    pos.push(x, y, z);
    nrm.push(nx / len, ny / len, nz / len);
    baseY.push(y);
    baseZ.push(z);
    baseNY.push(ny / len);
    baseNZ.push(nz / len);
    sOf.push(s);
    weight.push(secFactor(s) * radialFrac * feat.conc(s, ang));
  };

  const grid = (rows: number, cols: number, start: number, flip: boolean) => {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = start + i * (cols + 1) + j;
        const b = a + 1;
        const c = a + (cols + 1);
        const d = c + 1;
        if (flip) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
  };

  // ── Outer surface ──
  const ds = 1 / NX;
  const da = (2 * Math.PI) / NA;
  let start = 0;
  for (let i = 0; i <= NX; i++) {
    const s = i / NX;
    const x = -Lv / 2 + s * Lv;
    for (let j = 0; j <= NA; j++) {
      const ang = j * da;
      const r = feat.rAt(s, ang);
      // Slopes of the machined surface: along the axis (fillets, grooves) and
      // around it (keyseat walls).
      const drdx = (feat.rAt(Math.min(1, s + ds), ang) - feat.rAt(Math.max(0, s - ds), ang)) / (2 * ds * Lv);
      const drda = (feat.rAt(s, ang + da) - feat.rAt(s, ang - da)) / (2 * da);
      push(x, ang, r, s, -drdx, 1, -drda / Math.max(r, 1e-6), 1);
    }
  }
  grid(NX, NA, start, false);

  // ── Bore ──
  if (hollow) {
    start = pos.length / 3;
    for (let i = 0; i <= NX; i++) {
      const s = i / NX;
      const x = -Lv / 2 + s * Lv;
      for (let j = 0; j <= NA; j++) {
        const ang = j * da;
        push(x, ang, Ri, s, 0, -1, 0, Math.min(1, Ri / Math.max(feat.nomR(s), 1e-6)));
      }
    }
    grid(NX, NA, start, true);
  }

  // ── End faces: the radial shear gradient, drawn where you can read it ──
  for (const s of [0, 1]) {
    const x = -Lv / 2 + s * Lv;
    const rIn = hollow ? Ri : 0;
    start = pos.length / 3;
    for (let i = 0; i <= NR; i++) {
      for (let j = 0; j <= NA; j++) {
        const ang = j * da;
        // Follow the machined outline, so a keyseat that runs off the end
        // leaves its notch in the end face too.
        const r = rIn + ((feat.rAt(s, ang) - rIn) * i) / NR;
        push(x, ang, r, s, s === 1 ? 1 : -1, 0, 0, Math.min(1, r / Math.max(feat.nomR(s), 1e-6)));
      }
    }
    grid(NR, NA, start, s === 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  const colorAttr = new THREE.BufferAttribute(new Float32Array(pos.length), 3);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("color", colorAttr);
  geo.setIndex(idx);
  (geo.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  (geo.attributes.normal as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);

  return {
    geo,
    baseY: new Float32Array(baseY),
    baseZ: new Float32Array(baseZ),
    baseNY: new Float32Array(baseNY),
    baseNZ: new Float32Array(baseNZ),
    sOf: new Float32Array(sOf),
    weight: new Float32Array(weight),
  };
}

// ── 3D shaft viewer ─────────────────────────────────────────────────
// The shaft is built into a wall at the left and carries a lever at the right.
// Push the lever's grip and the shaft winds up: every cross-section rotates in
// proportion to its distance from the wall, so the straight scribe line on the
// surface shears into a helix beside the dim line showing where it started.
// That helix IS the strain — γ = rθ/L — and the colour is the shear stress it
// implies, against the material's 0.577·σy shear yield.
function Shaft3D({
  L,
  dOut,
  dIn,
  T,
  raiserKey,
  featR,
  Kts,
  interactive,
  E,
  sigmaY,
  nu,
  onLiveT,
  snapRef,
}: {
  L: number;
  dOut: number;
  dIn: number;
  T: number;
  raiserKey: string;
  featR: number; // mm — the machined radius on the feature
  Kts: number;
  interactive: boolean;
  E: number;
  sigmaY: number;
  nu: number;
  onLiveT: (n: number | null) => void;
  /** Filled with a function that renders the scene onto paper white for print. */
  snapRef?: { current: (() => string) | null };
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  // Yaw swings the free end toward the camera so the shaded end face reads;
  // the positive pitch looks down onto the top of the shaft, which is where
  // the keyseat is cut.
  const stateRef = useRef({ yaw: -0.62, pitch: 0.4, dragging: false, lx: 0, ly: 0 });
  const pivotRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);

  const meshRef = useRef<THREE.Mesh | null>(null);
  const leverRef = useRef<THREE.Group | null>(null);
  const gripRef = useRef<THREE.Mesh | null>(null);
  const proxyRef = useRef<THREE.Mesh | null>(null);
  const wallRef = useRef<THREE.Object3D | null>(null);
  const scribeRef = useRef<THREE.Line | null>(null);
  const ghostRef = useRef<THREE.Line | null>(null);

  const shaftRef = useRef<ShaftGeo | null>(null);
  const featRef = useRef<Feature | null>(null);
  const dimsRef = useRef({ Ro: 0.3, Ri: 0, Lv: 4, reach: 1 });
  const applyRef = useRef<((t: number) => void) | null>(null);
  const fitRef = useRef<(() => void) | null>(null);

  // Live interaction state.
  const liveTRef = useRef(T);
  const designTRef = useRef(T);
  const grabbingRef = useRef(false);
  const springRef = useRef(false);
  const springVelRef = useRef(0);
  const yieldRef = useRef(false);
  const forceRef = useRef(true);
  const lastVibeRef = useRef(0);
  const audioRef = useRef<{ ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null>(null);

  const propsRef = useRef({ interactive, E, sigmaY, nu, L, dOut, dIn, raiserKey, featR, Kts, onLiveT });
  useEffect(() => {
    propsRef.current = { interactive, E, sigmaY, nu, L, dOut, dIn, raiserKey, featR, Kts, onLiveT };
    forceRef.current = true;
  }, [interactive, E, sigmaY, nu, L, dOut, dIn, raiserKey, featR, Kts, onLiveT]);

  useEffect(() => {
    designTRef.current = T;
    if (!grabbingRef.current && !springRef.current) {
      liveTRef.current = T;
      forceRef.current = true;
    }
  }, [T]);

  // One-time scene setup
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1015");

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);

    // Frame the model rather than trusting a fixed distance: a shaft is a long
    // thin thing, so what fits depends on its proportions, on the shape of the
    // canvas (anything from a wide desktop strip to a nearly square phone
    // panel) and on the pose — the end swung toward the camera is the one that
    // overflows first. For each extreme point of the model, the closest camera
    // that still keeps it inside the frustum is |px|/tan(hFov) + pz; take the
    // worst of them and add a margin.
    const corner = new THREE.Vector3();
    const rot = new THREE.Matrix4();
    const fitCamera = () => {
      const { Lv, Ro, reach } = dimsRef.current;
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
      const wall = Ro * 2.5 + 0.25;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          for (const sz of [-1, 1]) {
            consider((sx * Lv) / 2, sy * Ro, sz * Ro);
            consider(-Lv / 2 - 0.16, sy * wall, sz * wall);
          }
        }
      }
      // The lever sweeps a circle at the free end as the shaft winds up.
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        consider(Lv / 2, reach * Math.cos(a), reach * Math.sin(a));
      }

      camera.position.set(0, 0, dist * 1.08);
      camera.lookAt(0, 0, 0);
      const grid = gridRef.current;
      if (grid) {
        grid.scale.setScalar(Math.max(Lv, 1) / 9);
        grid.position.y = -(Math.max(reach, Ro * 1.8) + Ro + 0.35);
      }
    };
    fitRef.current = fitCamera;
    fitCamera();

    // preserveDrawingBuffer keeps the canvas readable after the frame is
    // presented, which is what lets the report grab a figure of the exact
    // model on screen.
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

    const resultsFor = (t: number) => {
      const pr = propsRef.current;
      return shaftResults(
        pr.E * 1e9,
        pr.sigmaY * 1e6,
        pr.nu,
        pr.dOut / 1000,
        pr.dIn / 1000,
        pr.L / 1000,
        t,
        pr.Kts,
      );
    };

    // Wind the shaft up to torque t (N·m): rotate every cross-section, re-shade
    // every vertex, and swing the lever with the end it is bolted to.
    const applyTorque = (t: number) => {
      const sg = shaftRef.current;
      if (!sg) return;
      const pr = propsRef.current;
      const r = resultsFor(t);
      const mag = twistMagnification(r.thetaYield);
      // Real twist, magnified so first yield always reads as a clear turn.
      const thetaView = Math.max(-2.8, Math.min(2.8, r.theta * mag));

      const geo = sg.geo;
      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      const nrmAttr = geo.attributes.normal as THREE.BufferAttribute;
      const colAttr = geo.attributes.color as THREE.BufferAttribute;
      const p = posAttr.array as Float32Array;
      const n = nrmAttr.array as Float32Array;
      const c = colAttr.array as Float32Array;

      const ratio = r.tauNom / Math.max(r.tauAllow, 1e-9);
      // One cos/sin per axial station, not per vertex.
      const STEPS = 257;
      const cosT = new Float32Array(STEPS);
      const sinT = new Float32Array(STEPS);
      for (let k = 0; k < STEPS; k++) {
        const a = thetaView * (k / (STEPS - 1));
        cosT[k] = Math.cos(a);
        sinT[k] = Math.sin(a);
      }

      for (let i = 0; i < sg.sOf.length; i++) {
        const k = (sg.sOf[i] * (STEPS - 1)) | 0;
        const ct = cosT[k];
        const st = sinT[k];
        const i3 = i * 3;
        p[i3 + 1] = sg.baseY[i] * ct - sg.baseZ[i] * st;
        p[i3 + 2] = sg.baseY[i] * st + sg.baseZ[i] * ct;
        n[i3 + 1] = sg.baseNY[i] * ct - sg.baseNZ[i] * st;
        n[i3 + 2] = sg.baseNY[i] * st + sg.baseNZ[i] * ct;
        const li = rampIndex(ratio * sg.weight[i]);
        c[i3] = RAMP_LUT[li];
        c[i3 + 1] = RAMP_LUT[li + 1];
        c[i3 + 2] = RAMP_LUT[li + 2];
      }
      posAttr.needsUpdate = true;
      nrmAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // Scribe line: straight when unloaded, a helix once it winds up. It has
      // to lean the same way the lever is being pushed — the surface angle is
      // measured as (sin, cos) of the section angle, which runs opposite to a
      // rotation about +x, so the twist enters here negated. Getting this sign
      // wrong makes the shaft wind up and the line spiral the other way.
      const scribe = scribeRef.current;
      const feat = featRef.current;
      const { Lv } = dimsRef.current;
      if (scribe && feat) {
        const sp = (scribe.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        const cnt = sp.length / 3;
        for (let i = 0; i < cnt; i++) {
          const s = i / (cnt - 1);
          const a = -thetaView * s;
          const rr = feat.rAt(s, 0) * 1.008;
          sp[i * 3] = -Lv / 2 + s * Lv;
          sp[i * 3 + 1] = rr * Math.sin(a);
          sp[i * 3 + 2] = rr * Math.cos(a);
        }
        (scribe.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }

      // The lever is bolted to the free end, so it turns with it (the grab
      // proxy is one of its children and follows for free).
      const lever = leverRef.current;
      if (lever) lever.rotation.x = thetaView;

      // The grip warms with the shaft it is driving, so the thing under your
      // finger tells you how hard you are pushing without looking away.
      const li = rampIndex(ratio * pr.Kts);
      const gripMat = gripRef.current?.material as THREE.MeshStandardMaterial | undefined;
      if (gripMat) {
        gripMat.color.setRGB(
          0.35 + 0.6 * RAMP_LUT[li],
          0.35 + 0.5 * RAMP_LUT[li + 1],
          0.35 + 0.5 * RAMP_LUT[li + 2],
        );
      }
    };
    applyRef.current = applyTorque;

    // ── Haptic / audio "feel" ──────────────────────────────────────
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
        osc.type = "triangle"; // a wind-up groan, not the column's buzz
        osc.frequency.value = 90;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        audioRef.current = { ctx, gain, osc };
      } catch {
        /* audio unavailable — silent fallback */
      }
    };
    const snap = () => {
      const a = audioRef.current;
      if (!a) return;
      const { ctx } = a;
      const dur = 0.16;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1600; // a shear break is brighter than a buckle
      bp.Q.value = 1.1;
      const g = ctx.createGain();
      g.gain.value = 0.3;
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start();
    };
    const canVibrate = () => typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
    const updateFeel = (t: number) => {
      const r = resultsFor(t);
      const ratio = r.tauPeak / Math.max(r.tauAllow, 1e-9);
      const a = audioRef.current;
      if (a) {
        a.gain.gain.setTargetAtTime(Math.min(0.12, ratio * 0.1), a.ctx.currentTime, 0.02);
        a.osc.frequency.setTargetAtTime(80 + Math.min(ratio, 1.5) * 260, a.ctx.currentTime, 0.02);
      }
      const yielded = ratio >= 1;
      if (yielded && !yieldRef.current) {
        snap();
        if (canVibrate()) navigator.vibrate([0, 45, 25, 70]);
      }
      yieldRef.current = yielded;
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

    // The report needs a figure of this exact model. Re-rendering it on paper
    // white beats screenshotting the dark canvas: a black rectangle is the
    // thing that ruins a printed calculation sheet.
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
      const s = stateRef.current;
      pivot.rotation.y = s.yaw;
      pivot.rotation.x = s.pitch;
      if (springRef.current) {
        const target = designTRef.current;
        const cur = liveTRef.current;
        springVelRef.current = (springVelRef.current + (target - cur) * 0.2) * 0.78;
        let ncur = cur + springVelRef.current;
        const tol = Math.max(1e-3, Math.abs(target) * 1e-4);
        if (Math.abs(target - ncur) < tol && Math.abs(springVelRef.current) < tol) {
          ncur = target;
          springRef.current = false;
          propsRef.current.onLiveT(null);
        } else {
          propsRef.current.onLiveT(ncur);
        }
        liveTRef.current = ncur;
      }
      if (forceRef.current || liveTRef.current !== lastApplied) {
        applyTorque(liveTRef.current);
        lastApplied = liveTRef.current;
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
      fitCamera();
      renderer.setSize(wd, ht);
    };
    window.addEventListener("resize", onResize);

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "grab";
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartT = 0;
    let tanPx = { x: 0, y: 1 };
    let nmPerPx = 1;

    const hitsGrip = (e: PointerEvent) => {
      const target = proxyRef.current;
      if (!target) return false;
      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(target).length > 0;
    };

    // Which way is "push the lever" on screen right now? Project the grip and a
    // point a hair along its tangential direction, and use the difference — so
    // the drag pushes the lever the way the lever actually swings, whatever
    // angle the model has been rotated to.
    const toScreen = (v: THREE.Vector3, rect: DOMRect) => {
      const p = v.clone().project(camera);
      return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
    };
    const captureTangent = (rect: DOMRect) => {
      const grip = gripRef.current;
      const lever = leverRef.current;
      if (!grip || !lever) return;
      const world = grip.getWorldPosition(new THREE.Vector3());
      const local = pivot.worldToLocal(world.clone());
      // Tangential direction of a point circling the x axis.
      const rad = Math.hypot(local.y, local.z) || 1;
      const tangent = new THREE.Vector3(0, -local.z / rad, local.y / rad).multiplyScalar(0.25);
      const ahead = pivot.localToWorld(local.clone().add(tangent));
      const a = toScreen(world, rect);
      const b = toScreen(ahead, rect);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      tanPx = { x: dx / len, y: dy / len };
      // A drag of half the canvas height sweeps a bit past yield.
      const Ty = Math.max(resultsFor(0).Tyield, 1e-6);
      nmPerPx = (Ty * 1.5) / (rect.height * 0.5);
    };

    const down = (e: PointerEvent) => {
      const s = stateRef.current;
      if (propsRef.current.interactive && hitsGrip(e)) {
        grabbingRef.current = true;
        springRef.current = false;
        springVelRef.current = 0;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartT = liveTRef.current;
        captureTangent(el.getBoundingClientRect());
        ensureAudio();
        el.style.cursor = "grabbing";
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
        const along = (e.clientX - dragStartX) * tanPx.x + (e.clientY - dragStartY) * tanPx.y;
        const Ty = Math.max(resultsFor(0).Tyield, 1e-6);
        let nt = dragStartT + along * nmPerPx;
        nt = Math.max(0, Math.min(Ty * 1.7, nt));
        liveTRef.current = nt;
        propsRef.current.onLiveT(nt);
        updateFeel(nt);
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

  // Rebuild the shaft, its wall and its lever whenever the geometry or the
  // machined feature changes.
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
    dispose(leverRef.current); // takes the grab proxy with it
    dispose(wallRef.current);
    dispose(scribeRef.current);
    dispose(ghostRef.current);

    const dOutV = Math.max(dOut, 0.01);
    const dInV = Math.max(0, Math.min(dIn, dOutV * 0.95));
    const Lmm = Math.max(L, 0.01);
    // Long shafts fill the frame lengthwise; stubby ones are capped by girth.
    const scale = Math.min(4.4 / Lmm, 1.15 / (dOutV / 2));
    const Lv = Lmm * scale;
    const Ro = (dOutV / 2) * scale;
    const Ri = (dInV / 2) * scale;

    const feat = buildFeature(raiserKey, Ro, Lv, featR * scale, Kts);
    featRef.current = feat;
    const sg = buildShaftGeometry(Ro, Ri, Lv, feat);
    shaftRef.current = sg;

    const mesh = new THREE.Mesh(
      sg.geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.35,
        roughness: 0.45,
        side: THREE.DoubleSide, // a thin tube's bore should not vanish
      }),
    );
    pivot.add(mesh);
    meshRef.current = mesh;

    // Built-in end: a wall the shaft disappears into.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a242c, metalness: 0.1, roughness: 0.95 });
    const wall = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, Ro * 5 + 0.5, Ro * 5 + 0.5), wallMat);
    plate.position.x = -Lv / 2 - 0.08;
    wall.add(plate);
    const boss = new THREE.Mesh(
      new THREE.CylinderGeometry(Ro * 1.5, Ro * 1.5, 0.22, 32),
      wallMat.clone(),
    );
    boss.rotation.z = Math.PI / 2;
    boss.position.x = -Lv / 2 + 0.11;
    wall.add(boss);
    pivot.add(wall);
    wallRef.current = wall;

    // Lever: a collar on the free end with an arm you can push.
    const lever = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x8b97a3, metalness: 0.55, roughness: 0.4 });
    const collar = new THREE.Mesh(new THREE.TorusGeometry(Ro * 1.25, Ro * 0.22, 12, 40), steel);
    collar.rotation.y = Math.PI / 2; // torus axis → x
    collar.position.x = Lv / 2 - Ro * 0.1;
    lever.add(collar);
    const armR = Math.min(Math.max(Ro * 3.0, 0.7), 2.0);
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(Ro * 0.42, armR - Ro, Math.max(Ro * 0.75, 0.06)),
      steel.clone(),
    );
    arm.position.set(Lv / 2 - Ro * 0.1, (armR + Ro) / 2, 0);
    lever.add(arm);
    const gripR = Math.min(Math.max(Ro * 0.55, 0.11), 0.4);
    const grip = new THREE.Mesh(
      new THREE.SphereGeometry(gripR, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xc2ccd4, metalness: 0.3, roughness: 0.5 }),
    );
    grip.position.set(Lv / 2 - Ro * 0.1, armR, 0);
    lever.add(grip);

    // Fat invisible grab target, riding along with the grip.
    const proxy = new THREE.Mesh(
      new THREE.SphereGeometry(gripR * 2.4, 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    proxy.position.copy(grip.position);
    lever.add(proxy);
    proxyRef.current = proxy;

    pivot.add(lever);
    leverRef.current = lever;
    gripRef.current = grip;

    // Scribe line + the ghost of where it started.
    const NL = 161;
    const mkLine = (color: number, opacity: number) => {
      const g = new THREE.BufferGeometry();
      const arr = new Float32Array(NL * 3);
      for (let i = 0; i < NL; i++) {
        const s = i / (NL - 1);
        arr[i * 3] = -Lv / 2 + s * Lv;
        arr[i * 3 + 1] = 0;
        arr[i * 3 + 2] = feat.rAt(s, 0) * 1.008;
      }
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      (g.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
      pivot.add(line);
      return line;
    };
    ghostRef.current = mkLine(0x46515c, 0.85); // where the scribe line started
    scribeRef.current = mkLine(0xf0f4f8, 1); // where it is now

    dimsRef.current = { Ro, Ri, Lv, reach: armR + gripR };
    fitRef.current?.();
    forceRef.current = true;
    applyRef.current?.(liveTRef.current);
  }, [L, dOut, dIn, raiserKey, featR, Kts]);

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
          ? "grab the lever ball and push it around · drag empty space to rotate"
          : "drag to rotate · the white scribe line shows the twist"}
      </div>
    </div>
  );
}

// Equations behind the calculator, shown in the theory tab.
const EQUATIONS: Array<{ expr: string; note: string }> = [
  { expr: "τ = T·c / J = 16T / πd³", note: "Surface shear stress (solid shaft)" },
  { expr: "J = π(d⁴ − dᵢ⁴) / 32", note: "Polar second moment — hollow or solid" },
  { expr: "τmax = Kts · T·c / J", note: "Keyseat, fillet or groove multiplies it" },
  { expr: "Kts = Kref·(r/d ÷ ref)^−0.238", note: "…and the radius you cut sets Kts" },
  { expr: "τallow = 0.577 · σy", note: "Distortion-energy shear yield" },
  { expr: "θ = T·L / G·J,  G = E / 2(1+ν)", note: "Angle of twist and the modulus it works on" },
  { expr: "kt = G·J / L", note: "Torsional stiffness, N·m per radian" },
  { expr: "T = 9549 · P[kW] / n[rpm]", note: "Power ⇄ torque at shaft speed" },
  { expr: "n = τallow / τmax", note: "Safety factor against shear yield" },
];

type Tab = "model" | "theory" | "tips";
const TABS: [Tab, string][] = [
  ["model", "Model"],
  ["theory", "Theory & report"],
  ["tips", "Design tips"],
];

const MONO = "var(--mono)";

export default function ShaftCalc() {
  const [matKey, setMatKey] = useState("Steel 1045 (cold drawn)");
  const [raiserKey, setRaiserKey] = useState(DEFAULT_RAISER);
  const [hollow, setHollow] = useState("Solid");
  const [dOut, setDOut] = useState("25"); // mm
  const [dIn, setDIn] = useState("15"); // mm
  const [L, setL] = useState("100"); // mm
  const [drive, setDrive] = useState("Torque");
  const [Tin, setTin] = useState("120"); // N·m
  const [kW, setKW] = useState("5.5"); // kW
  const [rpm, setRpm] = useState("1450");
  // The machined radius on the feature, in mm. Null means "follow the
  // handbook" — the standard radius its Kts is quoted at, which tracks the
  // diameter until you take the wheel.
  const [featRIn, setFeatRIn] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("model");
  const [interactive, setInteractive] = useState(true);
  const [liveT, setLiveT] = useState<number | null>(null);
  const [printDoc, setPrintDoc] = useState<{ brief: boolean; img: string } | null>(null);
  const snapRef = useRef<(() => string) | null>(null);

  const mat = MATERIALS[matKey];
  const nu = poissonRatio(mat);
  const raiser = STRESS_RAISERS[raiserKey];
  const isHollow = hollow !== "Solid";
  const bore = isHollow ? num(dIn) : 0;
  const dMM = num(dOut);

  // Radius, r/d and the Kts it implies — one chain, so the model you drag and
  // the number you read can never disagree.
  const featR = featRIn != null ? num(featRIn) : defaultRadius(raiser, dMM);
  const rd = dMM > 0 ? featR / dMM : 0;
  const Kts = ktsFor(raiser, rd);
  const hasRadius = !!raiser.rdRef;
  const radiusOdd = hasRadius && !rdInRange(rd);

  // Either the torque is given, or it comes from the power the shaft carries.
  const designT = drive === "Torque" ? num(Tin) : torqueFromPower(num(kW) * 1000, num(rpm));
  const effT = liveT != null ? liveT : designT;
  const isLive = liveT != null;

  const r = useMemo(
    () =>
      shaftResults(mat.E * 1e9, mat.sigmaY * 1e6, nu, dMM / 1000, bore / 1000, num(L) / 1000, effT, Kts),
    [mat, nu, dMM, bore, L, effT, Kts],
  );
  const power = powerFromTorque(effT, num(rpm));
  const mag = twistMagnification(r.thetaYield);

  const status =
    r.SF >= 2
      ? { c: "#4fb477", t: "SAFE" }
      : r.SF >= 1
        ? { c: "#d9a441", t: "MARGINAL" }
        : { c: "#d65c5c", t: "YIELDING" };
  const twistTight = r.twistUtil > 1;

  // Everything the long-form pages need, in one bundle.
  const state: ShaftState = {
    matKey,
    E: mat.E,
    sigmaY: mat.sigmaY,
    nu,
    dOut: dMM,
    dIn: bore,
    L: num(L),
    hollow: isHollow,
    T: designT,
    rpm: num(rpm),
    raiserKey,
    raiser,
    featR,
    Kts,
    r,
  };

  // Printing renders a document of its own rather than re-skinning the live
  // page: inline dark backgrounds beat any @media print rule, and re-skinning
  // is what turns an exported calculation sheet into black slabs.
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
    // Two frames: one to mount the print document, one to lay it out.
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
              MECHCALC · DRIVETRAIN
            </div>
            <h1
              className="flexure-title"
              style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              Shaft in Torsion
            </h1>
          </div>
          <div style={{ textAlign: "right", fontFamily: MONO, fontSize: 10, color: "#46515c", lineHeight: 1.6 }}>
            <div>τ = 16T / πd³</div>
            <div>θ = TL / GJ</div>
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
                <div style={{ ...hint, marginTop: 2 }}>
                  G = {(r.G / 1e9).toFixed(1)} GPa (E {mat.E} · ν {nu.toFixed(2)}) · τ_allow{" "}
                  {(r.tauAllow / 1e6).toFixed(0)} MPa
                </div>
              </div>

              <Select label="Section" value={hollow} onChange={setHollow} options={["Solid", "Hollow (tube)"]} />
              <Field label="Outer diameter d" unit="mm" value={dOut} onChange={setDOut} min="0" step="1" />
              {isHollow && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <Field label="Bore dᵢ" unit="mm" value={dIn} onChange={setDIn} min="0" step="1" />
                  <div style={hint}>
                    wall {((dMM - bore) / 2).toFixed(1)} mm · {(100 * r.AFrac).toFixed(0)}% of the metal for{" "}
                    {(100 * r.JFrac).toFixed(0)}% of J
                  </div>
                </div>
              )}
              <Field label="Length L" unit="mm" value={L} onChange={setL} min="0" step="10" />

              <Select label="Drive input" value={drive} onChange={setDrive} options={["Torque", "Power & speed"]} />
              {drive === "Torque" ? (
                <Field label="Torque T" unit="N·m" value={Tin} onChange={setTin} min="0" step="5" />
              ) : (
                <Field label="Power P" unit="kW" value={kW} onChange={setKW} min="0" step="0.5" />
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Field label="Shaft speed n" unit="rpm" value={rpm} onChange={setRpm} min="0" step="50" />
                <div style={hint}>
                  {drive === "Torque"
                    ? `carries ${(power / 1000).toFixed(2)} kW at this speed`
                    : `→ T = ${designT.toFixed(1)} N·m`}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <Select
                  label="Stress raiser"
                  value={raiserKey}
                  onChange={(k) => {
                    setRaiserKey(k);
                    setFeatRIn(null); // back to that feature's standard radius
                  }}
                  options={Object.keys(STRESS_RAISERS)}
                />
                <div style={hint}>{raiser.note}</div>
              </div>

              {/* The radius is the design. Slider + box, because you want to
                  sweep it and you also want to type the one on the drawing. */}
              {hasRadius && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Field
                    label={raiser.rLabel ?? "Feature radius r"}
                    unit="mm"
                    value={featRIn ?? featR.toFixed(2)}
                    onChange={setFeatRIn}
                    min="0"
                    step="0.05"
                  />
                  <input
                    type="range"
                    min={Math.max(0.01, 0.004 * dMM)}
                    max={Math.max(0.05, 0.32 * dMM)}
                    step={Math.max(0.01, dMM / 500)}
                    value={featR}
                    aria-label={raiser.rLabel ?? "Feature radius"}
                    onChange={(e) => setFeatRIn(e.target.value)}
                    style={{ width: "100%", accentColor: status.c, minWidth: 0 }}
                  />
                  <div style={hint}>
                    r/d = {rd.toFixed(3)} → <span style={{ color: status.c }}>Kts = {Kts.toFixed(2)}</span>
                    {featRIn != null && (
                      <>
                        {" · "}
                        <button
                          className="linkish"
                          onClick={() => setFeatRIn(null)}
                          style={{ font: "inherit", color: "#3a78c2" }}
                        >
                          standard ({defaultRadius(raiser, dMM).toFixed(2)} mm)
                        </button>
                      </>
                    )}
                  </div>
                  {radiusOdd && (
                    <div style={{ ...hint, color: "#d9a441" }}>
                      outside r/d {RD_VALID[0]}–{RD_VALID[1]} — extrapolated, treat as a trend
                    </div>
                  )}
                </div>
              )}
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
                    TORSION SF
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
                  {isFinite(r.SF) ? r.SF.toFixed(2) : "∞"}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: "#6b7884" }}>peak shear vs 0.577·σy</div>
              </div>

              <Readout
                label="Peak shear τmax"
                value={(r.tauPeak / 1e6).toFixed(1)}
                unit="MPa"
                accent={status.c}
                hint={`nominal ${(r.tauNom / 1e6).toFixed(1)} × Kts ${Kts.toFixed(2)}`}
              />
              <Readout
                label="Torque capacity"
                value={r.Tyield >= 1000 ? (r.Tyield / 1000).toFixed(2) : r.Tyield.toFixed(1)}
                unit={r.Tyield >= 1000 ? "kN·m" : "N·m"}
                hint={`at SF 1 · ${(powerFromTorque(r.Tyield, num(rpm)) / 1000).toFixed(1)} kW here`}
              />
              <Readout
                label="Angle of twist θ"
                value={Math.abs(r.thetaDeg).toFixed(2)}
                unit="°"
                accent={twistTight ? "#d9a441" : undefined}
                hint={`${Math.abs(r.degPerM).toFixed(2)} °/m · ${twistTight ? "over" : "under"} the 1°/20d limit, ${r.twistLimitDeg.toFixed(2)}°`}
              />
              <Readout
                label="Torsional stiffness"
                value={r.ktDeg >= 1000 ? (r.ktDeg / 1000).toFixed(2) : r.ktDeg.toFixed(1)}
                unit={r.ktDeg >= 1000 ? "kN·m/°" : "N·m/°"}
                hint={`GJ = ${(r.G * r.J).toFixed(0)} N·m²`}
              />
              <Readout
                label="Polar moment J"
                value={(r.J * 1e12).toFixed(0)}
                unit="mm⁴"
                hint={
                  isHollow
                    ? `${(100 * r.JFrac).toFixed(0)}% of solid, ${(100 * r.AFrac).toFixed(0)}% of the metal`
                    : `Zp ${(r.Zp * 1e9).toFixed(0)} mm³`
                }
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
                  Wind-up · 3D
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: isLive ? status.c : "#46515c", marginTop: 2 }}>
                  {isLive
                    ? `● winding · T ${effT.toFixed(0)} N·m · ${((100 * r.tauPeak) / r.tauAllow).toFixed(0)}% of shear yield · θ ${Math.abs(r.thetaDeg).toFixed(2)}°`
                    : `${isHollow ? `Ø${dMM}×Ø${bore}` : `Ø${dMM}`} × ${num(L)} mm · twist shown ×${mag < 2 ? mag.toFixed(1) : mag.toFixed(0)}`}
                </div>
              </div>
              <button
                onClick={() => {
                  const nv = !interactive;
                  setInteractive(nv);
                  if (!nv) setLiveT(null);
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
            <Shaft3D
              L={num(L)}
              dOut={dMM}
              dIn={bore}
              T={designT}
              raiserKey={raiserKey}
              featR={featR}
              Kts={Kts}
              interactive={interactive}
              E={mat.E}
              sigmaY={mat.sigmaY}
              nu={nu}
              onLiveT={setLiveT}
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
            T torque · J polar second moment · c outer radius · Zp J/c · G shear modulus · ν Poisson&apos;s ratio ·
            θ angle of twist · Kts torsional stress-concentration factor · n safety factor
          </div>

          <div dangerouslySetInnerHTML={{ __html: reportHTML(state) }} />

          <p className="calc-note">
            <strong>In short:</strong> torsional capacity scales with the cube of the diameter, so a 26% bigger
            shaft is twice as strong — but only if you don&apos;t cut a keyway into it. Size it on the feature,
            not the section, check the wind-up before you sign off, and if weight matters, bore the middle out:
            it was never doing any work.
          </p>
        </div>

        {/* ── DESIGN TIPS ───────────────────────────────────────────── */}
        <div className={`tabpane${tab === "tips" ? " on" : ""}`}>
          <div className="theory" dangerouslySetInnerHTML={{ __html: tipsHTML(state) }} />
        </div>

        {/* The print document. Mounted only while printing, and the only thing
            @media print lets through on this page. */}
        {printDoc && (
          <div className={`calc-print ${printDoc.brief ? "brief" : "full"}`}>
            <div className="ph">
              <h1>Shaft in Torsion — {printDoc.brief ? "bench sheet" : "design calculation"}</h1>
              <div className="meta">
                {isHollow ? `Ø${dMM} × Ø${bore} bore` : `Ø${dMM} solid`} × {num(L)} mm · {matKey} · {raiserKey}
                {hasRadius ? ` r ${featR.toFixed(2)} mm (r/d ${rd.toFixed(3)})` : ""}
                <br />
                T = {designT.toFixed(1)} N·m at {num(rpm)} rpm = {(powerFromTorque(designT, num(rpm)) / 1000).toFixed(2)} kW
                {" · "}MechCalc — design check, not a substitute for full analysis
              </div>
            </div>

            <div className="headline" style={{ borderColor: r.SF >= 1 ? "#0a6b3d" : "#a01d1d" }}>
              <span className="n" style={{ color: r.SF >= 1 ? "#0a6b3d" : "#a01d1d" }}>
                n = {isFinite(r.SF) ? r.SF.toFixed(2) : "∞"}
              </span>
              <span className="w">
                τmax {(r.tauPeak / 1e6).toFixed(1)} MPa vs {(r.tauAllow / 1e6).toFixed(0)} MPa allowable ·
                capacity {r.Tyield.toFixed(1)} N·m · twist {Math.abs(r.thetaDeg).toFixed(2)}° (limit{" "}
                {r.twistLimitDeg.toFixed(2)}°)
              </span>
            </div>

            {printDoc.img && (
              <figure className="fig">
                <img src={printDoc.img} alt="3D view of the shaft, coloured by shear stress" />
                <figcaption>
                  The shaft as modelled, shaded by shear stress against 0.577·σy. The hot band sits at the{" "}
                  {raiser.kind === "none" ? "surface" : raiserKey.toLowerCase()}; the end face carries the radial
                  τ ∝ r gradient. Twist shown ×{mag < 2 ? mag.toFixed(1) : mag.toFixed(0)}.
                </figcaption>
              </figure>
            )}

            <h2>Section &amp; loading</h2>
            <table className="rep">
              <tbody>
                <tr>
                  <td>Polar second moment J</td>
                  <td className="v">{(r.J * 1e12).toFixed(0)} mm⁴</td>
                </tr>
                <tr>
                  <td>Section modulus Zp</td>
                  <td className="v">{(r.Zp * 1e9).toFixed(0)} mm³</td>
                </tr>
                <tr>
                  <td>Shear modulus G</td>
                  <td className="v">{(r.G / 1e9).toFixed(1)} GPa</td>
                </tr>
                <tr>
                  <td>Nominal surface shear</td>
                  <td className="v">{(r.tauNom / 1e6).toFixed(1)} MPa</td>
                </tr>
                <tr className="hi">
                  <td>Peak shear, Kts {Kts.toFixed(2)}</td>
                  <td className="v">{(r.tauPeak / 1e6).toFixed(1)} MPa</td>
                </tr>
                <tr>
                  <td>Torsional stiffness</td>
                  <td className="v">{r.ktDeg.toFixed(1)} N·m/°</td>
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
              Static torque only — no bending, no combined stress, no fatigue. Kts is a first-iteration estimate
              interpolated from Shigley Table 7-1 anchors, not a Peterson chart lookup. Material values are typical
              reference figures; verify before production use.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
