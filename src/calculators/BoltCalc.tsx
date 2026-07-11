import { useState, useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { Field, Select, Readout, num } from "../ui";
import { signedStressColor } from "./stressColor";
import {
  THREADS,
  CLASSES,
  FRICTION,
  PLATE_MATERIALS,
  jointResults,
  TARGET_PRELOAD_FRACTION,
  DW_RATIO,
} from "./boltMath";
import type { ThreadSpec, BoltClass, PlateMaterial, JointResults } from "./boltMath";

// How much the (real, micron-scale) elastic deflections are exaggerated in
// the 3D view so you can see the bolt stretch and the plates squash.
const VIEW_EXAG = 40;

// ── 3D bolted-joint viewer ──────────────────────────────────────
// A hex-head screw clamping two plates (each with its own material) with a
// nut. Drag empty space to orbit; in interactive mode, grab the nut and drag
// sideways to tighten. Mechanically honest kinematics: the head stays seated
// (it only sinks as the plates compress), and the bolt's elongation appears
// where it really does — the free end grows out below the nut. Inside the
// translucent plates, Shigley's 30° pressure cones show where the clamp
// force actually flows.
function Bolt3D({
  thread,
  cls,
  K,
  t1,
  m1,
  t2,
  m2,
  Pext,
  torque,
  interactive,
  onLiveTorque,
}: {
  thread: ThreadSpec;
  cls: BoltClass;
  K: number;
  t1: number;
  m1: PlateMaterial;
  t2: number;
  m2: PlateMaterial;
  Pext: number;
  torque: number;
  interactive: boolean;
  onLiveTorque: (T: number | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ yaw: 0.7, pitch: -0.25, dragging: false, lx: 0, ly: 0 });
  const pivotRef = useRef<THREE.Group | null>(null);

  // Parts updated per-frame (colors, nut spin, stretch/squash, torque arrow).
  const partsRef = useRef<{
    gripShank: THREE.Mesh | null;
    gripMat: THREE.MeshStandardMaterial | null;
    head: THREE.Mesh | null;
    nut: THREE.Mesh | null;
    nutMat: THREE.MeshStandardMaterial | null;
    tail: THREE.Group | null;
    plateGroup: THREE.Group | null;
    plateMats: THREE.MeshStandardMaterial[];
    plateTones: THREE.Color[];
    coneMat: THREE.MeshBasicMaterial | null;
    arcGroup: THREE.Group | null;
    arcMat: THREE.MeshBasicMaterial | null;
    proxy: THREE.Mesh | null;
    // view-space layout
    gripBottomY: number;
    gripLen: number;
    headH: number;
    scale: number; // view units per mm
  }>({
    gripShank: null,
    gripMat: null,
    head: null,
    nut: null,
    nutMat: null,
    tail: null,
    plateGroup: null,
    plateMats: [],
    plateTones: [],
    coneMat: null,
    arcGroup: null,
    arcMat: null,
    proxy: null,
    gripBottomY: 0,
    gripLen: 1,
    headH: 0.2,
    scale: 0.1,
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
  const propsRef = useRef({ thread, cls, K, t1, m1, t2, m2, Pext, interactive, onLiveTorque });
  useEffect(() => {
    propsRef.current = { thread, cls, K, t1, m1, t2, m2, Pext, interactive, onLiveTorque };
    forceRef.current = true; // recolor on material/friction change
  }, [thread, cls, K, t1, m1, t2, m2, Pext, interactive, onLiveTorque]);

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

    // Joint state for the current live torque — one call feeds color + feel.
    const resultsFor = (T: number): JointResults => {
      const P = propsRef.current;
      return jointResults(P.thread, P.cls, P.K, T, P.t1, P.m1, P.t2, P.m2, P.Pext);
    };

    // Apply torque-dependent visuals with the correct kinematics:
    //  · nut and bottom plate face are the fixed datum (the nut is seated);
    //  · plates squash by the member compression — the head RIDES DOWN with
    //    the top face (it never lifts);
    //  · the bolt's stretch appears as the free tail growing below the nut.
    const applyTorque = (T: number) => {
      const parts = partsRef.current;
      const r = resultsFor(T);
      const util = r.util;

      if (parts.gripMat) {
        const c = signedStressColor(Math.min(util, 1.3));
        parts.gripMat.color.setRGB(c.r, c.g, c.b);
        // hot bolts glow slightly so yielding is unmistakable
        parts.gripMat.emissive.setRGB(c.r, c.g, c.b);
        parts.gripMat.emissiveIntensity = Math.max(0, util - 0.9) * 0.5;
      }
      // Plates: each keeps its material tone, cooled toward compression-blue
      // with clamp — and pushed toward warning-red if its bearing limit is
      // exceeded (crushing under the head/nut).
      const squeezeTint = Math.min(util, 1.2) * 0.45;
      const bearOver = [1 / Math.max(r.nBear1, 1e-6), 1 / Math.max(r.nBear2, 1e-6)];
      parts.plateMats.forEach((m, i) => {
        const tone = parts.plateTones[i];
        if (!tone) return;
        const cc = signedStressColor(-Math.min(util, 1.2));
        let cr = tone.r * (1 - squeezeTint) + cc.r * squeezeTint;
        let cg = tone.g * (1 - squeezeTint) + cc.g * squeezeTint;
        let cb = tone.b * (1 - squeezeTint) + cc.b * squeezeTint;
        const over = Math.min(Math.max(bearOver[i] - 1, 0), 1); // >pG → blend red
        cr = cr * (1 - over) + 0.8 * over;
        cg = cg * (1 - over) + 0.2 * over;
        cb = cb * (1 - over) + 0.2 * over;
        m.color.setRGB(cr, cg, cb);
      });
      // Pressure cones fade in with clamp force.
      if (parts.coneMat) {
        parts.coneMat.opacity = 0.06 + Math.min(util, 1) * 0.3;
      }
      if (parts.nutMat) {
        const c = signedStressColor(Math.min(util * 0.55, 1.3)); // nut sees part of the load
        parts.nutMat.color.setRGB(0.35 + c.r * 0.35, 0.38 + c.g * 0.35, 0.42 + c.b * 0.35);
      }

      // Nut spin: a fraction of a turn, scaled with preload for feel.
      const angle = Math.min(util, 1.4) * Math.PI * 0.85;
      if (parts.nut) parts.nut.rotation.y = -angle;
      if (parts.arcGroup) parts.arcGroup.rotation.y = -angle;
      if (parts.arcMat) {
        const Trec = r.Trec || 1;
        const engaged = grabbingRef.current || springRef.current;
        parts.arcMat.opacity = Math.min(1, Math.abs(T) / Trec) * (engaged ? 0.9 : 0.3);
      }

      // Deflections (real metres → view units, exaggerated, capped).
      const s = parts.scale * 1000; // view units per metre
      const stretchV = Math.min(r.dL * s * VIEW_EXAG, parts.gripLen * 0.12);
      const squashV = Math.min(r.dLm * s * VIEW_EXAG, parts.gripLen * 0.1);

      // Plates squash down onto the fixed nut face…
      if (parts.plateGroup) parts.plateGroup.scale.y = 1 - squashV / parts.gripLen;
      // …the head rides DOWN with the top plate face (never up)…
      if (parts.head) {
        parts.head.position.y = parts.gripBottomY + (parts.gripLen - squashV) + parts.headH / 2;
      }
      if (parts.gripShank) {
        const len = parts.gripLen - squashV;
        parts.gripShank.scale.y = len / parts.gripLen;
        parts.gripShank.position.y = parts.gripBottomY + len / 2;
      }
      // …and the bolt's elongation shows where it really appears: the free
      // end grows out below the nut as the nut advances along the thread.
      if (parts.tail) parts.tail.position.y = -stretchV;
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
      const util = resultsFor(T).util;
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
        // Full-width drag sweeps ~2.2× the recommended torque — enough to
        // walk the joint well past proof and feel it let go.
        const Trec = resultsFor(0).Trec;
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

  // (Re)build the joint whenever thread size or the plate stack changes.
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
    const t1Mm = Math.max(t1, d * 0.3);
    const t2Mm = Math.max(t2, d * 0.3);
    const gripMm = t1Mm + t2Mm;
    const headH = 0.7 * d;
    const nutH = 0.8 * d;
    const tailMm = 0.8 * d + 2.5 * p;
    const totalMm = headH + gripMm + nutH + tailMm;
    const scale = 3.4 / totalMm;

    const hexR = ((1.5 * d * scale) / Math.sqrt(3)) * 1.155; // across-flats 1.5d → circumradius
    const r = 0.5 * d * scale;
    const gripV = gripMm * scale;
    const headV = headH * scale;
    const nutV = nutH * scale;
    const tailV = tailMm * scale;
    const plateW = Math.min(2.9 * d, gripMm * 2 + 1.5 * d) * scale;

    const topY = (headV + gripV + nutV + tailV) / 2;
    const gripTopY = topY - headV;
    const gripBottomY = gripTopY - gripV;
    const nutCenterY = gripBottomY - nutV / 2;

    const steel = { metalness: 0.55, roughness: 0.42 };

    // Head: hex prism, seated on the top plate.
    const headMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b4, ...steel });
    const head = new THREE.Mesh(new THREE.CylinderGeometry(hexR, hexR, headV, 6), headMat);
    head.position.y = gripTopY + headV / 2;
    joint.add(head);

    // Gripped shank — the loaded length; its color carries the stress story.
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x4fb477, metalness: 0.35, roughness: 0.5 });
    const gripShank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, gripV, 32), gripMat);
    gripShank.position.y = gripBottomY + gripV / 2;
    joint.add(gripShank);

    // Clamped plates in a group anchored at the NUT FACE (its bottom), so
    // compression squashes the stack downward onto the seated nut — the
    // physically correct datum. Each plate keeps its own material tone and
    // true thickness; both stay translucent so the loaded shank and the
    // pressure cones inside stay visible.
    const plateGroup = new THREE.Group();
    plateGroup.position.y = gripBottomY;
    joint.add(plateGroup);
    const plateMats: THREE.MeshStandardMaterial[] = [];
    const plateTones: THREE.Color[] = [];
    const t1V = t1Mm * scale;
    const t2V = t2Mm * scale;
    const mkPlate = (h: number, cy: number, tone: string) => {
      const m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(tone),
        metalness: 0.15,
        roughness: 0.85,
        transparent: true,
        opacity: 0.42,
      });
      plateMats.push(m);
      plateTones.push(new THREE.Color(tone));
      const plate = new THREE.Mesh(new THREE.BoxGeometry(plateW, h - gripV * 0.012, plateW), m);
      plate.position.y = cy;
      plateGroup.add(plate);
    };
    // order matters: index 0 = plate 1 (top, head side), 1 = plate 2 (bottom)
    mkPlate(t1V, t2V + t1V / 2, m1.tone);
    mkPlate(t2V, t2V / 2, m2.tone);

    // Shigley pressure cones: clamp force spreads at 30° from under the head
    // to the grip midplane, then contracts to the nut face. Drawn as two
    // translucent frusta inside the plates (they squash with the group).
    const dwV = DW_RATIO * d * scale;
    const DmidV = Math.min(dwV + gripMm * Math.tan(Math.PI / 6) * scale, plateW * 0.92);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x3a78c2,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const coneTop = new THREE.Mesh(new THREE.CylinderGeometry(dwV / 2, DmidV / 2, gripV / 2, 32, 1, true), coneMat);
    coneTop.position.y = gripV * 0.75;
    plateGroup.add(coneTop);
    const coneBot = new THREE.Mesh(new THREE.CylinderGeometry(DmidV / 2, dwV / 2, gripV / 2, 32, 1, true), coneMat);
    coneBot.position.y = gripV * 0.25;
    plateGroup.add(coneBot);

    // Nut: hex prism, seated — it stays put and only spins.
    const nutMat = new THREE.MeshStandardMaterial({ color: 0x8b97a3, ...steel });
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(hexR * 0.98, hexR * 0.98, nutV, 6), nutMat);
    nut.position.y = nutCenterY;
    joint.add(nut);

    // Applied-torque arrow: an amber arc that wraps the nut while you
    // tighten, spinning with it — the visual for T itself, not just stress.
    const arcGroup = new THREE.Group();
    arcGroup.position.y = nutCenterY;
    const arcMat = new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0 });
    const arcR = hexR * 1.8;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(arcR, Math.max(0.02, hexR * 0.07), 8, 48, Math.PI * 1.5), arcMat);
    const arcEnd = Math.PI * 1.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(Math.max(0.05, hexR * 0.2), Math.max(0.12, hexR * 0.45), 12), arcMat);
    tip.position.set(Math.cos(arcEnd) * arcR, Math.sin(arcEnd) * arcR, 0);
    tip.rotation.z = arcEnd; // point along the tightening direction
    arc.add(tip);
    arc.rotation.x = Math.PI / 2; // lie flat around the nut
    arcGroup.add(arc);
    joint.add(arcGroup);

    // Free tail below the nut: minor-diameter core + helical thread ridge.
    // It carries no preload (stays neutral green) and is the part that grows
    // downward as the bolt stretches. The geometry extends UP through the
    // opaque nut to the grip, so when the tail slides down the junction stays
    // hidden inside the nut — the thread emerges from it like a real bolt.
    const tail = new THREE.Group();
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x77848f, ...steel });
    const tailFullV = tailV + nutV; // visible tail + the length buried in the nut
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, tailFullV, 24), tailMat);
    core.position.y = gripBottomY - tailFullV / 2;
    tail.add(core);
    const turns = Math.max(2, (tailMm + nutH) / p);
    const helixPts: THREE.Vector3[] = [];
    const NPTS = Math.ceil(turns * 24);
    for (let i = 0; i <= NPTS; i++) {
      const f = i / NPTS;
      const a = f * turns * Math.PI * 2;
      helixPts.push(new THREE.Vector3(Math.cos(a) * r * 0.95, gripBottomY - f * tailFullV, Math.sin(a) * r * 0.95));
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

    parts.gripShank = gripShank;
    parts.gripMat = gripMat;
    parts.head = head;
    parts.nut = nut;
    parts.nutMat = nutMat;
    parts.tail = tail;
    parts.plateGroup = plateGroup;
    parts.plateMats = plateMats;
    parts.plateTones = plateTones;
    parts.coneMat = coneMat;
    parts.arcGroup = arcGroup;
    parts.arcMat = arcMat;
    parts.proxy = proxy;
    parts.gripBottomY = gripBottomY;
    parts.gripLen = gripV;
    parts.headH = headV;
    parts.scale = scale;

    forceRef.current = true;
  }, [thread, t1, t2, m1, m2]);

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
  { expr: "σ = F / As", note: "Direct tensile stress on the stress area As" },
  { expr: "τ = 16·Tth / (π·ds³),  Tth ≈ 0.5·T", note: "Torsion from thread friction while torquing" },
  { expr: "σred = √(σ² + 3τ²)", note: "Reduced (von Mises) stress during tightening — VDI 2230" },
  { expr: "n = Sp / σred", note: "Safety factor against proof strength" },
  { expr: "kb = E·As / L", note: "Bolt as a tension spring over the grip" },
  { expr: "km = f(30° cone frusta)", note: "Member stiffness — Shigley pressure-cone stack" },
  { expr: "C = kb / (kb + km)", note: "Stiffness ratio: bolt's share of external load" },
  { expr: "Fb = Fi + C·P,  Fm = Fi − (1−C)·P", note: "Load sharing: bolt force & remaining clamp" },
  { expr: "Psep = Fi / (1 − C)", note: "External load at which the joint separates" },
  { expr: "p = F / [π(dw² − dh²)/4]", note: "Bearing pressure under head/nut vs plate limit pG" },
];

const SectionLabel = ({ t }: { t: string }) => (
  <div
    style={{
      fontFamily: "var(--mono)",
      fontSize: 10,
      letterSpacing: "0.18em",
      textTransform: "uppercase",
      color: "#3a78c2",
      margin: "18px 0 2px",
    }}
  >
    {t}
  </div>
);

const fmtSF = (n: number) => (isFinite(n) ? n.toFixed(2) : "∞");

export default function BoltCalc() {
  const [threadKey, setThreadKey] = useState("M6");
  const [classKey, setClassKey] = useState("8.8 (medium-carbon, Q&T)");
  const [fricKey, setFricKey] = useState("Dry steel, plain (K ≈ 0.20)");
  const [mat1Key, setMat1Key] = useState("Aluminum 6061-T6");
  const [t1, setT1] = useState("8"); // mm — top plate (under the head)
  const [mat2Key, setMat2Key] = useState("Mild steel (S235)");
  const [t2, setT2] = useState("12"); // mm — bottom plate (at the nut)
  const [Pext, setPext] = useState("500"); // N external working load
  const [torque, setTorque] = useState("6"); // N·m
  const [interactive, setInteractive] = useState(true);
  const [liveTorque, setLiveTorque] = useState<number | null>(null); // N·m, while tightening

  const thread = THREADS[threadKey];
  const cls = CLASSES[classKey];
  const K = FRICTION[fricKey];
  const m1 = PLATE_MATERIALS[mat1Key];
  const m2 = PLATE_MATERIALS[mat2Key];

  // While interactively tightening, the readouts follow the live torque;
  // otherwise they reflect the design input.
  const effTorque = liveTorque != null ? liveTorque : num(torque);
  const isLive = liveTorque != null;

  const r = useMemo(
    () => jointResults(thread, cls, K, effTorque, num(t1), m1, num(t2), m2, num(Pext)),
    [thread, cls, K, effTorque, t1, m1, t2, m2, Pext],
  );

  const status =
    r.SF >= 1.25
      ? { c: "#4fb477", t: "SAFE" }
      : r.SF >= 1
        ? { c: "#d9a441", t: "MARGINAL" }
        : { c: "#d65c5c", t: "YIELDING" };

  // Joint-level warnings at the current state.
  const warnings: Array<{ msg: string; c: string }> = [];
  if (r.Fm <= 0) warnings.push({ msg: "joint separates — clamp force is gone at this load", c: "#d65c5c" });
  else if (r.nSep < 1.5 && isFinite(r.nSep))
    warnings.push({ msg: `separation margin is thin (n = ${r.nSep.toFixed(2)})`, c: "#d9a441" });
  if (r.nBear1 < 1) warnings.push({ msg: `plate 1 crushes under the head (p > pG ${m1.pG} MPa) — use a washer`, c: "#d65c5c" });
  if (r.nBear2 < 1) warnings.push({ msg: `plate 2 crushes under the nut (p > pG ${m2.pG} MPa) — use a washer`, c: "#d65c5c" });

  const kN = (n: number) => (n / 1000).toFixed(2);

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
            <div>Fb = Fi + C·P</div>
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
              {cls.note && <div style={{ color: "#d9a441", marginTop: 3, lineHeight: 1.5 }}>⚠ {cls.note}</div>}
            </div>

            <Select label="Lubrication / finish" value={fricKey} onChange={setFricKey} options={Object.keys(FRICTION)} />

            <Select label="Plate 1 — top, under head" value={mat1Key} onChange={setMat1Key} options={Object.keys(PLATE_MATERIALS)} />
            <Field label="Plate 1 thickness" unit="mm" value={t1} onChange={setT1} min="0" step="0.5" />
            <Select label="Plate 2 — bottom, at nut" value={mat2Key} onChange={setMat2Key} options={Object.keys(PLATE_MATERIALS)} />
            <Field label="Plate 2 thickness" unit="mm" value={t2} onChange={setT2} min="0" step="0.5" />
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: -8 }}>
              grip L = {(num(t1) + num(t2)).toFixed(1)} mm · E₁ {m1.E} · E₂ {m2.E} GPa
            </div>

            <Field label="External load P (tensile)" unit="N" value={Pext} onChange={setPext} min="0" step="50" />
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
                marginBottom: 6,
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
                {fmtSF(r.SF)}
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#6b7884" }}>
                σred vs proof strength, while torquing
              </div>
              {warnings.map((w) => (
                <div
                  key={w.msg}
                  style={{ fontFamily: "var(--mono)", fontSize: 10, color: w.c, marginTop: 6, lineHeight: 1.5 }}
                >
                  ⚠ {w.msg}
                </div>
              ))}
            </div>

            <SectionLabel t="Tightening" />
            <Readout label="Preload Fi" value={kN(r.F)} unit="kN" />
            <Readout label="Tension σ" value={(r.sigma / 1e6).toFixed(0)} unit="MPa" />
            <Readout label="Torsion τ" value={(r.tau / 1e6).toFixed(0)} unit="MPa" />
            <Readout label="Reduced σred (vM)" value={(r.vm / 1e6).toFixed(0)} unit="MPa" accent={status.c} />
            <Readout label="Bolt stretch ΔL" value={(r.dL * 1e6).toFixed(1)} unit="µm" />
            <Readout label="Plates squash δm" value={(r.dLm * 1e6).toFixed(1)} unit="µm" />

            <SectionLabel t="Joint · clamped sandwich" />
            <Readout
              label="Stiffness ratio C"
              value={r.C.toFixed(3)}
              unit=""
              hint={`kb ${(r.kb / 1e6).toFixed(0)} / km ${isFinite(r.km) ? (r.km / 1e6).toFixed(0) : "∞"} kN/mm ÷1000`}
            />
            <Readout label="Bolt force @ P" value={kN(r.Fb)} unit="kN" />
            <Readout
              label="Clamp left @ P"
              value={kN(Math.max(r.Fm, 0))}
              unit="kN"
              accent={r.Fm <= 0 ? "#d65c5c" : undefined}
              hint={r.Fm <= 0 ? "separated" : undefined}
            />
            <Readout
              label="Separation SF"
              value={fmtSF(r.nSep)}
              unit=""
              accent={r.nSep < 1 ? "#d65c5c" : r.nSep < 1.5 ? "#d9a441" : undefined}
            />
            <Readout label="Interface pressure" value={(r.pInt / 1e6).toFixed(1)} unit="MPa" hint={`cone Ø ${r.DiMm.toFixed(1)} mm`} />
            <Readout
              label="Bearing p head/nut"
              value={(r.pHead / 1e6).toFixed(0)}
              unit="MPa"
              accent={Math.min(r.nBear1, r.nBear2) < 1 ? "#d65c5c" : undefined}
              hint={`SF ${fmtSF(r.nBear1)} / ${fmtSF(r.nBear2)}`}
            />
            <Readout
              label="Working σ (after relax)"
              value={(r.sigmaWork / 1e6).toFixed(0)}
              unit="MPa"
              hint={`n vs yield ${fmtSF(r.nYieldWork)}`}
            />
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
                  ? `● tightening`
                  : `${threadKey} · class ${classKey.split(" ")[0]} · ${mat1Key.split(" ")[0]} + ${mat2Key.split(" ")[0]}`}
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
          {/* Live HUD: torque and the forces it creates, pinned over the canvas */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 12,
                zIndex: 2,
                pointerEvents: "none",
                fontFamily: "var(--mono)",
                fontSize: 10.5,
                lineHeight: 1.75,
                color: isLive ? "#e8edf1" : "#6b7884",
                textShadow: "0 1px 3px #000",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <div>
                T <span style={{ color: "#d9a441" }}>{effTorque.toFixed(1)}</span> N·m
              </div>
              <div>
                Fi <span style={{ color: status.c }}>{kN(r.F)}</span> kN preload
              </div>
              <div>
                clamp <span style={{ color: r.Fm <= 0 ? "#d65c5c" : "#3aa0c2" }}>{kN(Math.max(r.Fm, 0))}</span> kN @ P
              </div>
              <div>
                σred <span style={{ color: status.c }}>{(r.util * 100).toFixed(0)}%</span> of Sp
              </div>
            </div>
            <Bolt3D
              thread={thread}
              cls={cls}
              K={K}
              t1={num(t1)}
              m1={m1}
              t2={num(t2)}
              m2={m2}
              Pext={num(Pext)}
              torque={num(torque)}
              interactive={interactive}
              onLiveTorque={setLiveTorque}
            />
          </div>
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
            T torque · K nut factor · d nominal Ø · Fi preload · As stress area · Sp/Sy proof/yield · kb/km
            bolt/member stiffness · C stiffness ratio · P external load · Fm clamp force · dw washer-face Ø ·
            dh hole Ø · pG permissible surface pressure
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
            <strong style={{ color: "#c2ccd4" }}>Tightening.</strong> The wrench torque drives the nut down
            the thread incline, converting twist into axial preload Fi that clamps the plates. While the
            wrench is on, thread friction also twists the shank, so the tightening check combines tension
            and torsion into the <em>reduced stress</em> σred = √(σ² + 3τ²) — this von Mises form is the
            standard bolted-joint method (VDI 2230; Shigley reaches the same numbers by capping preload at
            ~75–90% of proof). That torsion largely dissipates once the wrench is released, which is why the
            calculator also reports the milder <em>working stress</em> — pure tension including the bolt's
            share of the external load — checked against yield.
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
            <strong style={{ color: "#c2ccd4" }}>The clamped sandwich.</strong> The joint is two springs in
            parallel: the bolt (stiffness kb) stretched by Fi, and the plate stack (km) compressed by the
            same Fi. The clamp force doesn&apos;t flow uniformly through the plates — it spreads in ~30°
            pressure cones from under the head to mid-grip and back to the nut (drawn in blue in the 3D
            view), which is what the frustum stiffness model captures. Each plate&apos;s material enters
            through its modulus: swap a steel plate for aluminum or POM and km drops, shifting the stiffness
            ratio C = kb/(kb+km). When an external load P pulls the joint, the bolt only feels C·P extra —
            the rest simply unloads the plates. Stiff plates (small C) are why preloaded joints survive
            fatigue: the bolt barely notices the load cycles. But the clamp erodes by (1−C)·P, and at Psep
            the plates separate — after that the bolt takes everything, and the joint hammers itself apart.
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
            <strong style={{ color: "#c2ccd4" }}>Soft materials & bearing.</strong> The head and nut press
            on small annular faces, and soft plate materials crush there long before the bolt is in danger:
            the calculator checks that surface pressure against each material&apos;s permissible pressure pG
            (VDI-style values). If a plate flags red — typical for plastics and soft aluminum at steel-bolt
            torques — use washers to spread the load, or drop the preload target. Embedding (surfaces
            flattening over time) also costs proportionally more preload in soft, short joints.
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
            <strong style={{ color: "#c2ccd4" }}>Scope.</strong> Nut-factor torque model (K scatters ±25%
            between real joints — lubricate for consistency); fully-threaded fastener for kb; Shigley 30°
            cone frusta for km; concentric, purely tensile external load. Not modeled: shear/eccentric
            loading, embedding and creep relaxation, fatigue life, thread stripping, gaskets. The 3D view
            exaggerates the micron-scale stretch and squash ~{VIEW_EXAG}× so you can see them; the
            kinematics are true — the head only sinks with plate compression, and elongation emerges below
            the nut.
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
            a bolted joint is a pre-stretched bolt fighting pre-squashed plates. Tighten until the bolt
            carries a healthy fraction of proof (checked with torsion included, von Mises), and make the
            plates as stiff as you can — then external loads mostly just relax the plates instead of working
            the bolt. Watch the two clamped materials: they set how the load is shared, when the joint
            separates, and whether anything crushes under the head.
          </p>
        </div>
      </div>
    </div>
  );
}
