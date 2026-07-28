import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { Field, Select, Readout, num } from "../ui";
import { rampColor, TENSION_STOPS } from "./stressColor";
import {
  IMPACT_MATERIALS,
  IMPACT_GROUPS,
  simulate,
  ballisticLimit,
  projectileMass,
  type SimParams,
  type SimResult,
  type Shape,
} from "./impactMath";

// ── outcome presentation ────────────────────────────────────────
const OUTCOME_META: Record<
  SimResult["outcome"],
  { label: string; color: string; note: string }
> = {
  bounce: { label: "BOUNCES OFF", color: "#4fb477", note: "elastic rebound, no lasting damage" },
  dent: { label: "DENTED — STOPPED", color: "#4fb477", note: "plastic dish + crater, projectile stopped" },
  embedded: { label: "EMBEDDED — STOPPED", color: "#cf9f52", note: "projectile stuck partway through" },
  "crack-stop": { label: "CRACKED — STOPPED", color: "#cf9f52", note: "brittle sheet fractured but held" },
  "perforate-plug": { label: "PERFORATED — PLUG", color: "#d65c5c", note: "shear plug punched out ahead" },
  "perforate-petal": { label: "PERFORATED — PETALS", color: "#d65c5c", note: "membrane tore and petals folded back" },
  "perforate-hole": { label: "PERFORATED — HOLE", color: "#d65c5c", note: "tunneled straight through" },
  shatter: { label: "SHATTERED THROUGH", color: "#d65c5c", note: "brittle sheet fragmented, projectile passed" },
};

// Clamped-plate point-load mode shape and its slope (ρ = r/R).
const shapeFn = (rho: number) => {
  const r = Math.min(Math.max(rho, 1e-4), 1);
  return 1 - r * r + 2 * r * r * Math.log(r);
};
const shapeSlope = (rho: number) => {
  const r = Math.min(Math.max(rho, 1e-4), 1);
  return 4 * r * Math.log(r); // dφ/dρ
};

// ── 3D impact viewer ────────────────────────────────────────────
// A clamped circular sheet face-on to the camera axis; the projectile flies
// in from the left, the contact microseconds play back in extreme slow
// motion, the sheet colors by how close its skin is to failure, and the
// aftermath (plug, petals, fragments, rebound) plays out. Grab the
// projectile and pull it back like a slingshot to set the speed by hand.
function Impact3D({
  sim,
  shape,
  size,
  h,
  R,
  plateColor,
  projColor,
  brittle,
  epsF,
  replayKey,
  onLiveV,
  onLaunch,
}: {
  sim: SimResult;
  shape: Shape;
  size: number; // m
  h: number; // m
  R: number; // m
  plateColor: string;
  projColor: string;
  brittle: boolean;
  epsF: number;
  replayKey: number;
  onLiveV: (v: number | null) => void;
  onLaunch: (v: number) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ yaw: 0.95, pitch: -0.14, dragging: false, lx: 0, ly: 0 });
  const pivotRef = useRef<THREE.Group | null>(null);

  // Scene objects rebuilt when geometry changes.
  const plateGeoRef = useRef<THREE.BufferGeometry | null>(null);
  const plateVertsRef = useRef<{ r: number; cos: number; sin: number; side: number }[]>([]);
  const capRef = useRef<THREE.Mesh | null>(null);
  const projRef = useRef<THREE.Mesh | null>(null);
  const proxyRef = useRef<THREE.Mesh | null>(null);
  const petalsRef = useRef<THREE.Group | null>(null);
  const fragsRef = useRef<{ mesh: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3 }[]>([]);
  const fragGroupRef = useRef<THREE.Group | null>(null);
  const crackSeedRef = useRef<number[]>([]);
  const dimsRef = useRef({ scale: 1, hv: 0.08, rHoleV: 0.1, rProjV: 0.2, wAmp: 1 });

  // Playback state.
  const clockRef = useRef({ start: 0, spawned: false });
  const propsRef = useRef({ sim, shape, size, h, R, epsF, brittle, onLiveV, onLaunch });
  useEffect(() => {
    propsRef.current = { sim, shape, size, h, R, epsF, brittle, onLiveV, onLaunch };
  }, [sim, shape, size, h, R, epsF, brittle, onLiveV, onLaunch]);

  // Slingshot state.
  const grabRef = useRef({ active: false, startX: 0, pull: 0, v: 0 });

  const APPROACH = 0.5, CONTACT = 2.1, AFTER = 1.6; // playback seconds

  // Restart playback whenever the sim result or replay key changes.
  useEffect(() => {
    clockRef.current = { start: performance.now(), spawned: false };
    // Clear any fragments from the previous run.
    const fg = fragGroupRef.current;
    if (fg) {
      for (const f of fragsRef.current) {
        fg.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
      }
      fragsRef.current = [];
    }
    const pet = petalsRef.current;
    if (pet) pet.visible = false;
  }, [sim, replayKey]);

  // ── one-time scene setup ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const width = mount.clientWidth;
    const height = mount.clientHeight || 340;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1015");
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 7.2);
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

    const grid = new THREE.GridHelper(9, 18, 0x1f2a33, 0x141c22);
    grid.position.y = -2.6;
    pivot.add(grid);

    const fragGroup = new THREE.Group();
    pivot.add(fragGroup);
    fragGroupRef.current = fragGroup;

    // Spawn brittle-shatter / plug fragments once the sheet lets go.
    const spawnFragments = (exitV: number, holeR: number) => {
      const pr = propsRef.current;
      const n = pr.brittle ? 16 : 6;
      for (let i = 0; i < n; i++) {
        const s = 0.05 + Math.random() * 0.11;
        const mesh = new THREE.Mesh(
          new THREE.BoxGeometry(s * 0.4, s, s * (0.6 + Math.random() * 0.8)),
          new THREE.MeshStandardMaterial({ color: plateColor, metalness: 0.2, roughness: 0.7 }),
        );
        const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
        mesh.position.set(0.05, Math.cos(ang) * holeR * 0.7, Math.sin(ang) * holeR * 0.7);
        const spread = pr.brittle ? 0.9 : 0.45;
        fragGroup.add(mesh);
        fragsRef.current.push({
          mesh,
          v: new THREE.Vector3(
            exitV * (0.35 + Math.random() * 0.5),
            Math.cos(ang) * spread * (0.4 + Math.random()),
            Math.sin(ang) * spread * (0.4 + Math.random()),
          ),
          w: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4),
        });
      }
    };

    // Per-frame update of plate mesh + colors + cap + projectile for the
    // interpolated sim state.
    const applyState = (
      z: number,
      w0: number,
      delta: number,
      F: number,
      sPlug: number,
      broken: boolean,
      perforatedNow: boolean,
    ) => {
      const pr = propsRef.current;
      const { scale, hv, rHoleV, rProjV, wAmp } = dimsRef.current;
      const geo = plateGeoRef.current;
      if (!geo) return;
      const Rm = pr.R;
      const w0v = w0 * scale * wAmp;
      const fracThrough = Math.min(delta / pr.h, 1);

      // Plate surface: mode-shape dish + a local dimple near the hole rim.
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const col = geo.attributes.color as THREE.BufferAttribute;
      const verts = plateVertsRef.current;
      const rHoleM = rHoleV / scale;
      const dimpleR = Math.min(rHoleM * 2.5, Rm * 0.5);
      for (let i = 0; i < verts.length; i++) {
        const vt = verts[i];
        const rho = vt.r / Rm;
        let x = w0v * shapeFn(rho);
        if (vt.r < dimpleR) {
          const b = Math.cos(((vt.r - rHoleM) / Math.max(dimpleR - rHoleM, 1e-6)) * (Math.PI / 2));
          x += fracThrough * hv * 0.85 * Math.max(b, 0) * (perforatedNow ? 0 : 1);
        }
        pos.setX(i, x + vt.side * (hv / 2));

        // Stress color: membrane stretch of the dish vs the failure strain,
        // plus contact heat near the rim; cracked brittle sheets darken along
        // radial cracks.
        const slope = (w0 * Math.abs(shapeSlope(rho))) / Rm;
        let ratio = (0.5 * slope * slope) / Math.max(pr.epsF, 1e-4);
        const heat = F > 0 ? Math.min(1.2, F / Math.max(pr.sim.Fpeak, 1)) : 0;
        if (vt.r < dimpleR * 1.4) ratio = Math.max(ratio, heat * (1 - vt.r / (dimpleR * 1.6)));
        if (pr.brittle && broken) {
          const ang = Math.atan2(vt.sin, vt.cos);
          const crack = crackSeedRef.current.some((a) => Math.abs(((ang - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.07);
          const c = rampColor(TENSION_STOPS, crack ? 1.25 : Math.min(ratio, 0.45));
          col.setXYZ(i, crack ? 0.35 : c.r, crack ? 0.12 : c.g, crack ? 0.12 : c.b);
        } else {
          const c = rampColor(TENSION_STOPS, Math.max(0, Math.min(1.3, ratio)));
          col.setXYZ(i, c.r, c.g, c.b);
        }
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      geo.computeVertexNormals();

      // Cap disc (the material in front of the nose / the plug) — tinted by
      // the same stress ramp as the plate center so it reads as one sheet.
      const cap = capRef.current;
      if (cap) {
        cap.position.x = w0v + fracThrough * hv * 0.9 + sPlug * scale * 3;
        cap.visible = !(pr.brittle && broken && perforatedNow);
        const heat = F > 0 ? Math.min(1.25, F / Math.max(pr.sim.Fpeak, 1)) : fracThrough > 0 ? 0.4 : 0;
        const cc = rampColor(TENSION_STOPS, heat);
        (cap.material as THREE.MeshStandardMaterial).color.setRGB(cc.r, cc.g, cc.b);
      }

      // Projectile rides its nose position: dish (amplified) + through-
      // thickness progress at display scale.
      const proj = projRef.current;
      if (proj) {
        const noseV =
          -hv / 2 + w0v * (delta > 0 ? 1 : 0) + fracThrough * hv + Math.max(delta - pr.h, 0) * scale;
        proj.position.x = (delta > 0 ? noseV : -hv / 2 + z * scale) - rProjV;
        const proxy = proxyRef.current;
        if (proxy) proxy.position.copy(proj.position);
      }
    };

    let raf = 0;
    const animate = () => {
      const s = stateRef.current;
      pivot.rotation.y = s.yaw;
      pivot.rotation.x = s.pitch;

      const pr = propsRef.current;
      const { scale, hv, rProjV, rHoleV } = dimsRef.current;
      const frames = pr.sim.frames;
      const tEnd = frames.length ? frames[frames.length - 1].t : 1e-6;
      const last = frames[frames.length - 1];

      if (grabRef.current.active) {
        // Slingshot: ball follows the pull; plate at rest.
        applyState(0, 0, 0, 0, 0, false, false);
        const proj = projRef.current;
        if (proj) proj.position.x = -hv / 2 - rProjV - 0.15 - grabRef.current.pull;
      } else {
        const tPlay = (performance.now() - clockRef.current.start) / 1000;
        if (tPlay < APPROACH) {
          // fly in from the left
          const u = tPlay / APPROACH;
          const x0 = -3.1;
          const x1 = -hv / 2 - rProjV;
          applyState(0, 0, 0, 0, 0, false, false);
          const proj = projRef.current;
          if (proj) proj.position.x = x0 + (x1 - x0) * u * u;
        } else if (tPlay < APPROACH + CONTACT && frames.length > 1) {
          const simT = ((tPlay - APPROACH) / CONTACT) * tEnd;
          let i = 1;
          while (i < frames.length - 1 && frames[i].t < simT) i++;
          const f0 = frames[i - 1], f1 = frames[i];
          const u = f1.t > f0.t ? (simT - f0.t) / (f1.t - f0.t) : 1;
          const lerp = (a: number, b: number) => a + (b - a) * u;
          applyState(
            lerp(f0.z, f1.z),
            lerp(f0.w0, f1.w0),
            lerp(f0.delta, f1.delta),
            lerp(f0.F, f1.F),
            lerp(f0.sPlug, f1.sPlug),
            f1.broken,
            false,
          );
        } else if (last) {
          // aftermath
          const ta = tPlay - APPROACH - CONTACT;
          const r = pr.sim;
          applyState(last.z, last.w0, last.delta, 0, last.sPlug, last.broken, r.perforated);
          const proj = projRef.current;
          if (r.perforated) {
            if (!clockRef.current.spawned) {
              clockRef.current.spawned = true;
              if (pr.brittle || r.outcome === "shatter" || r.plugMass > 0) {
                spawnFragments(1.4 + 1.6 * Math.min(1, r.vr / 400), rHoleV);
              }
              const pet = petalsRef.current;
              if (pet && r.outcome === "perforate-petal") pet.visible = true;
            }
            const vVis = 1.5 + 2.2 * Math.min(1, r.vr / 500);
            if (proj) proj.position.x = -hv / 2 + last.delta * scale + Math.min(ta, AFTER) * vVis;
            const cap = capRef.current;
            if (cap && r.plugMass > 0 && !pr.brittle) {
              cap.position.x = hv / 2 + Math.min(ta, AFTER) * vVis * 0.92 + 0.05;
            } else if (cap && pr.brittle) {
              cap.visible = false;
            }
            const dtf = Math.min(ta, AFTER);
            for (const f of fragsRef.current) {
              f.mesh.position.set(0.05 + f.v.x * dtf, f.mesh.position.y + f.v.y * 0.016, f.mesh.position.z + f.v.z * 0.016);
              f.mesh.rotation.x += f.w.x * 0.016;
              f.mesh.rotation.y += f.w.y * 0.016;
            }
          } else if (r.vRebound > 0.5 && proj) {
            const vVis = 0.8 + 1.6 * Math.min(1, r.vRebound / 200);
            proj.position.x = -hv / 2 + last.delta * scale - rProjV - Math.min(ta, AFTER) * vVis;
          }
          const proxy = proxyRef.current;
          if (proxy && proj) proxy.position.copy(proj.position);
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      const wd = mount.clientWidth;
      const ht = mount.clientHeight || 340;
      camera.aspect = wd / ht;
      camera.updateProjectionMatrix();
      renderer.setSize(wd, ht);
    };
    window.addEventListener("resize", onResize);

    // ── pointer controls: orbit empty space, slingshot the projectile ──
    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "grab";
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const hitsProj = (e: PointerEvent) => {
      const target = proxyRef.current;
      if (!target) return false;
      const rect = el.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObject(target).length > 0;
    };
    const pullToV = (pull: number) => {
      const frac = Math.min(pull / 2.3, 1);
      return Math.round(10 + Math.pow(frac, 1.5) * 1200);
    };

    const down = (e: PointerEvent) => {
      if (hitsProj(e)) {
        grabRef.current = { active: true, startX: e.clientX, pull: 0.2, v: pullToV(0.2) };
        propsRef.current.onLiveV(grabRef.current.v);
        el.style.cursor = "ew-resize";
        el.setPointerCapture?.(e.pointerId);
        e.preventDefault();
        return;
      }
      const s = stateRef.current;
      s.dragging = true;
      s.lx = e.clientX;
      s.ly = e.clientY;
      el.style.cursor = "grabbing";
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (grabRef.current.active) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const pull = Math.max(0.05, Math.min(2.6, ((grabRef.current.startX - e.clientX) / rect.width) * 6.5));
        grabRef.current.pull = pull;
        grabRef.current.v = pullToV(pull);
        propsRef.current.onLiveV(grabRef.current.v);
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
      if (grabRef.current.active) {
        const v = grabRef.current.v;
        grabRef.current.active = false;
        propsRef.current.onLiveV(null);
        propsRef.current.onLaunch(v);
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
      if (stateRef.current.dragging || grabRef.current.active) e.preventDefault();
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
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── rebuild plate + projectile when geometry or materials change ──
  useEffect(() => {
    const pivot = pivotRef.current;
    if (!pivot) return;

    for (const ref of [capRef, projRef, proxyRef]) {
      const mObj = ref.current;
      if (mObj) {
        pivot.remove(mObj);
        mObj.geometry.dispose();
        (mObj.material as THREE.Material).dispose();
        ref.current = null;
      }
    }
    if (petalsRef.current) {
      pivot.remove(petalsRef.current);
      petalsRef.current.traverse((o) => {
        const mm = o as THREE.Mesh;
        if (mm.geometry) mm.geometry.dispose();
        if (mm.material) (mm.material as THREE.Material).dispose();
      });
      petalsRef.current = null;
    }
    // Remove old plate mesh (tracked via geometry ref's mesh parent).
    const oldGeo = plateGeoRef.current;
    if (oldGeo) {
      pivot.children
        .filter((c) => (c as THREE.Mesh).geometry === oldGeo)
        .forEach((c) => {
          pivot.remove(c);
          ((c as THREE.Mesh).material as THREE.Material).dispose();
        });
      oldGeo.dispose();
      plateGeoRef.current = null;
    }
    pivot.children
      .filter((c) => c.userData.clampRing)
      .forEach((c) => {
        pivot.remove(c);
        const mm = c as THREE.Mesh;
        mm.geometry.dispose();
        (mm.material as THREE.Material).dispose();
      });

    const scale = 2.2 / Math.max(R, 1e-3);
    const hv = Math.max(h * scale, 0.07);
    const holeD = sim.holeD > 0 ? sim.holeD : size;
    const rHoleV = Math.max((holeD / 2) * scale, 0.12);
    const rProjV = Math.max((size / 2) * scale, 0.1);
    // Dish deflections can be microns (armor) or centimetres (membranes):
    // amplify small ones so the motion reads, and say so in the caption.
    const wPeakV = sim.w0Peak * scale;
    const wAmp = wPeakV > 0.01 ? Math.min(Math.max(0.28 / wPeakV, 1), 40) : 1;
    dimsRef.current = { scale, hv, rHoleV, rProjV, wAmp };

    // Annular plate: rings × sectors, two layers (front & back skin).
    const NR = 22, NT = 44;
    const rIn = rHoleV / scale;
    const verts: { r: number; cos: number; sin: number; side: number }[] = [];
    const positions: number[] = [];
    const indices: number[] = [];
    for (let side = -1; side <= 1; side += 2) {
      const base = verts.length;
      for (let i = 0; i <= NR; i++) {
        const r = rIn + (R - rIn) * Math.pow(i / NR, 1.3);
        for (let j = 0; j < NT; j++) {
          const th = (j / NT) * Math.PI * 2;
          verts.push({ r, cos: Math.cos(th), sin: Math.sin(th), side });
          positions.push(side * (hv / 2), r * Math.cos(th) * scale, r * Math.sin(th) * scale);
        }
      }
      for (let i = 0; i < NR; i++) {
        for (let j = 0; j < NT; j++) {
          const a = base + i * NT + j;
          const b = base + i * NT + ((j + 1) % NT);
          const c = base + (i + 1) * NT + j;
          const dd = base + (i + 1) * NT + ((j + 1) % NT);
          if (side < 0) indices.push(a, c, b, b, c, dd);
          else indices.push(a, b, c, b, dd, c);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    const colAttr = new THREE.BufferAttribute(new Float32Array(verts.length * 3), 3);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("color", colAttr);
    geo.setIndex(indices);
    geo.computeVertexNormals();
    plateGeoRef.current = geo;
    plateVertsRef.current = verts;

    const plateMesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.55, side: THREE.DoubleSide }),
    );
    pivot.add(plateMesh);

    // Cap disc — the sheet material directly in the projectile's path.
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(rHoleV * 0.99, rHoleV * 0.99, hv, 32),
      new THREE.MeshStandardMaterial({ color: plateColor, metalness: 0.3, roughness: 0.55 }),
    );
    cap.rotation.z = Math.PI / 2;
    pivot.add(cap);
    capRef.current = cap;

    // Clamp ring (test-fixture rim) on both faces.
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.2 + 0.09, 0.09, 10, 48),
        new THREE.MeshStandardMaterial({ color: 0x1a242c, metalness: 0.1, roughness: 0.95 }),
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.x = side * (hv / 2 + 0.06);
      ring.userData.clampRing = true;
      pivot.add(ring);
    }

    // Projectile.
    const projGeo =
      shape === "sphere"
        ? new THREE.SphereGeometry(rProjV, 28, 20)
        : new THREE.BoxGeometry(rProjV * 2, rProjV * 2, rProjV * 2);
    const proj = new THREE.Mesh(
      projGeo,
      new THREE.MeshStandardMaterial({ color: projColor, metalness: 0.6, roughness: 0.35 }),
    );
    proj.position.x = -3.1;
    pivot.add(proj);
    projRef.current = proj;

    // Fat invisible grab proxy for the slingshot.
    const proxy = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(rProjV * 2.2, 0.45), 12, 8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    );
    proxy.position.copy(proj.position);
    pivot.add(proxy);
    proxyRef.current = proxy;

    // Petals: bent-back flaps around the hole, shown for petaling exits.
    const petals = new THREE.Group();
    const nPet = 6;
    for (let i = 0; i < nPet; i++) {
      const ang = (i / nPet) * Math.PI * 2;
      const flap = new THREE.Mesh(
        new THREE.BoxGeometry(rHoleV * 0.8, hv * 0.7, rHoleV * 0.55),
        new THREE.MeshStandardMaterial({ color: plateColor, metalness: 0.3, roughness: 0.6 }),
      );
      const g = new THREE.Group();
      g.rotation.x = ang; // distribute around the axis (pivot local x = plate normal)
      flap.position.set(rHoleV * 0.35, rHoleV * 1.05, 0);
      flap.rotation.z = -0.9; // folded toward the exit side
      g.add(flap);
      petals.add(g);
    }
    petals.rotation.z = Math.PI / 2;
    petals.visible = false;
    pivot.add(petals);
    petalsRef.current = petals;

    // Crack directions for brittle sheets (stable per rebuild).
    crackSeedRef.current = Array.from({ length: 7 }, (_, i) => (i / 7) * Math.PI * 2 + Math.sin(i * 13.7) * 0.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, size, h, R, plateColor, projColor, sim.holeD]);

  const amp = dimsRef.current.wAmp;
  return (
    <div>
      <div ref={mountRef} className="flexure-beam" style={{ minHeight: 340 }} />
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9.5,
          color: "#6b7884",
          marginTop: 6,
          textAlign: "center",
        }}
      >
        grab the projectile and pull left to slingshot it · drag empty space to rotate
        {amp > 1.05 ? ` · dish exaggerated ×${amp.toFixed(0)}` : ""}
      </div>
    </div>
  );
}

// Equations behind the calculator, shown in the theory section.
const EQUATIONS: Array<{ expr: string; note: string }> = [
  { expr: "F = A(δ)·(σr + ρt·v²)", note: "Poncelet / cavity-expansion local resistance" },
  { expr: "σr = ⅔σf·(1 + ln(2E/3σf))", note: "quasi-static cavity pressure ≈ 3–5·σf" },
  { expr: "F > π·d·(h−δ)·τd", note: "shear-plug initiation on the remaining ligament" },
  { expr: "ε_tip = ½(w₀ / a·ln(R/a))² > εf", note: "membrane tearing at the contact rim" },
  { expr: "σb = 3F/2πh²·[(1+ν)ln(R/a)+1] > σf", note: "brittle back-face fracture" },
  { expr: "F = 16πD/R²·w(1 + 0.443(w/h)²)", note: "plate bending + membrane (Timoshenko)" },
  { expr: "vJoin = m·v / (m + m_plug)", note: "Recht–Ipson momentum share with the plug" },
  { expr: "v_bl : vr(v_bl) = 0", note: "ballistic limit by bisection on the full model" },
];

const fmtV = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
const fmtT = (s: number) => (s >= 1e-3 ? `${(s * 1000).toFixed(2)} ms` : `${(s * 1e6).toFixed(1)} µs`);

export default function ImpactCalc() {
  const [shape, setShape] = useState<Shape>("sphere");
  const [projKey, setProjKey] = useState("Hardened steel (52100 ball)");
  const [plateKey, setPlateKey] = useState("Aluminum 6061-T6");
  const [sizeMm, setSizeMm] = useState("10");
  const [v0, setV0] = useState("150");
  const [hMm, setHMm] = useState("2");
  const [spanMm, setSpanMm] = useState("100");
  const [replayKey, setReplayKey] = useState(0);
  const [liveV, setLiveV] = useState<number | null>(null);

  const proj = IMPACT_MATERIALS[projKey];
  const plate = IMPACT_MATERIALS[plateKey];

  const params: SimParams = useMemo(
    () => ({
      shape,
      size: Math.max(num(sizeMm), 0.5) / 1000,
      proj,
      plate,
      h: Math.max(num(hMm), 0.05) / 1000,
      R: Math.max(num(spanMm), 10) / 2000,
      v0: Math.max(num(v0), 1),
    }),
    [shape, sizeMm, proj, plate, hMm, spanMm, v0],
  );

  const sim = useMemo(() => simulate(params), [params]);
  const vbl = useMemo(() => ballisticLimit(params), [params]);

  const mass = projectileMass(params);
  const E0 = sim.E0;
  const meta = OUTCOME_META[sim.outcome];
  const overLimit = !Number.isNaN(vbl) ? params.v0 / vbl : 0;
  const absorbed = E0 > 0 ? Math.max(0, 1 - (sim.Eresidual + sim.Erebound) / E0) : 0;

  const onLaunch = useCallback((v: number) => {
    setV0(String(v));
    setReplayKey((k) => k + 1);
  }, []);

  const matSelect = (label: string, value: string, onChange: (k: string) => void) => (
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
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
        {IMPACT_GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {Object.keys(IMPACT_MATERIALS)
              .filter((k) => IMPACT_MATERIALS[k].grp === g)
              .map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </div>
  );

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
          style={{ borderBottom: "1px solid #1f2a33", paddingBottom: 14, marginBottom: 22 }}
        >
          <div>
            <div
              style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.25em", color: "#3a78c2" }}
            >
              MECHCALC · IMPACT
            </div>
            <h1
              className="flexure-title"
              style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              Sheet Impact &amp; Penetration
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
            <div>F = A(δ)·(σr + ρv²)</div>
            <div>vr² ∝ v² − v_bl²</div>
          </div>
        </div>

        <div className="flexure-grid">
          {/* INPUTS */}
          <div className="flexure-inputs" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.15em",
                color: "#6b7884",
                borderBottom: "1px solid #141c22",
                paddingBottom: 4,
              }}
            >
              PROJECTILE
            </div>
            <Select
              label="Shape"
              value={shape === "sphere" ? "Sphere" : "Cube"}
              options={["Sphere", "Cube"]}
              onChange={(v) => setShape(v === "Sphere" ? "sphere" : "cube")}
            />
            {matSelect("Projectile material", projKey, setProjKey)}
            <Field
              label={shape === "sphere" ? "Diameter d" : "Side a"}
              unit="mm"
              value={sizeMm}
              onChange={setSizeMm}
              min="0.5"
              step="0.5"
            />
            <Field label="Impact velocity v₀" unit="m/s" value={v0} onChange={setV0} min="1" step="10" />
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: -8 }}>
              m = {(mass * 1000).toFixed(2)} g · KE = {E0 >= 1000 ? `${(E0 / 1000).toFixed(2)} kJ` : `${E0.toFixed(1)} J`} · p ={" "}
              {(mass * params.v0).toFixed(2)} kg·m/s
            </div>

            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.15em",
                color: "#6b7884",
                borderBottom: "1px solid #141c22",
                paddingBottom: 4,
                marginTop: 6,
              }}
            >
              SHEET / PLATE
            </div>
            {matSelect("Sheet material", plateKey, setPlateKey)}
            <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#46515c", marginTop: -8 }}>
              ρ {plate.rho} kg/m³ · E {plate.E} GPa · σy {plate.sigmaY} MPa
              {plate.brittle ? " · brittle" : ` · εf ${plate.epsF}`}
            </div>
            <Field label="Thickness h" unit="mm" value={hMm} onChange={setHMm} min="0.05" step="0.5" />
            <Field label="Free span (clamped Ø)" unit="mm" value={spanMm} onChange={setSpanMm} min="10" step="10" />
          </div>

          {/* OUTPUTS */}
          <div>
            <div
              style={{
                background: "#0b1015",
                border: `1px solid ${meta.color}33`,
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
                  VERDICT
                </span>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: meta.color,
                    border: `1px solid ${meta.color}`,
                    borderRadius: 2,
                    padding: "2px 7px",
                  }}
                >
                  {meta.label}
                </span>
              </div>
              <div
                className="flexure-sf"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 38,
                  fontWeight: 600,
                  color: meta.color,
                  marginTop: 6,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Number.isNaN(vbl) ? "> 3000" : fmtV(vbl)}
                <span style={{ fontSize: 14, color: "#6b7884" }}> m/s</span>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#6b7884" }}>
                ballistic limit v_bl ·{" "}
                {Number.isNaN(vbl)
                  ? "cannot be perforated below 3 km/s"
                  : `impact at ${(overLimit * 100).toFixed(0)}% of limit`}{" "}
                · {meta.note}
                {sim.projSoft ? " · projectile deforms on impact" : ""}
              </div>
            </div>

            {sim.perforated ? (
              <Readout
                label="Residual velocity vr"
                value={fmtV(sim.vr)}
                unit="m/s"
                accent="#d65c5c"
                hint={`exits with ${((sim.Eresidual / E0) * 100).toFixed(0)}% of KE`}
              />
            ) : (
              <Readout
                label="Rebound velocity"
                value={fmtV(sim.vRebound)}
                unit="m/s"
                hint={sim.vRebound > 0.5 ? `restitution e ≈ ${(sim.vRebound / params.v0).toFixed(2)}` : "stopped dead"}
              />
            )}
            <Readout label="Impact duration" value={fmtT(sim.tContact).split(" ")[0]} unit={fmtT(sim.tContact).split(" ")[1]} />
            <Readout
              label="Peak force"
              value={sim.Fpeak >= 1e6 ? (sim.Fpeak / 1e6).toFixed(2) : (sim.Fpeak / 1000).toFixed(1)}
              unit={sim.Fpeak >= 1e6 ? "MN" : "kN"}
              hint={`peak decel ${sim.aPeakG >= 1000 ? `${(sim.aPeakG / 1000).toFixed(0)}k` : sim.aPeakG.toFixed(0)} g`}
            />
            <Readout
              label="Peak dish w₀"
              value={(sim.w0Peak * 1000).toFixed(2)}
              unit="mm"
              hint={sim.perforated ? "" : `permanent dent ${(sim.dent * 1000).toFixed(2)} mm`}
            />
            {sim.perforated && (
              <Readout
                label="Hole diameter"
                value={(sim.holeD * 1000).toFixed(1)}
                unit="mm"
                hint={sim.plugMass > 0 ? `plug/disc ${(sim.plugMass * 1000).toFixed(2)} g` : ""}
              />
            )}
            <Readout
              label="Energy absorbed"
              value={(absorbed * 100).toFixed(0)}
              unit="%"
              accent={meta.color}
              hint={`local ${((sim.Elocal / E0) * 100).toFixed(0)}% · dish ${((sim.Eplate / E0) * 100).toFixed(0)}%`}
            />
          </div>
        </div>

        {/* 3D SIMULATION */}
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
                Impact · 3D slow motion
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: liveV != null ? "#cf9f52" : "#46515c", marginTop: 2 }}>
                {liveV != null
                  ? `● slingshot · release to fire at ${liveV} m/s`
                  : `${(sim.tContact * 1e6).toFixed(0)} µs of contact replayed over ~2 s (×${Math.max(1, Math.round(2 / Math.max(sim.tContact, 1e-6) / 1000))}k slower)`}
              </div>
            </div>
            <button
              onClick={() => setReplayKey((k) => k + 1)}
              style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: 2,
                padding: "6px 10px",
                background: `${meta.color}1f`,
                border: `1px solid ${meta.color}`,
                color: meta.color,
                whiteSpace: "nowrap",
              }}
            >
              ▶ Replay
            </button>
          </div>
          <Impact3D
            sim={sim}
            shape={shape}
            size={params.size}
            h={params.h}
            R={params.R}
            plateColor={plate.color}
            projColor={proj.color}
            brittle={!!plate.brittle}
            epsF={plate.epsF}
            replayKey={replayKey}
            onLiveV={setLiveV}
            onLaunch={onLaunch}
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
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "#e8edf1", whiteSpace: "nowrap" }}>
                  {eq.expr}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "#6b7884", textAlign: "right" }}>
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
              lineHeight: 1.8,
            }}
          >
            A contact area · δ local indentation · σr cavity resistance · σf flow stress (σy+σu)/2 · ρt
            target density · τd dynamic shear strength · h thickness · R clamped span radius · w₀ center
            dish · εf failure strain · D flexural rigidity · m_plug plug mass
          </div>

          <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "#8b97a3", marginTop: 16, lineHeight: 1.7 }}>
            <strong style={{ color: "#c2ccd4" }}>How the model works.</strong> The calculator integrates the
            impact in time — nanosecond steps through the microseconds of contact — with two coupled degrees
            of freedom: the projectile and the sheet&apos;s center, joined by a local contact force. That force
            starts as Hertzian elastic contact, then switches to the classical cavity-expansion / Poncelet
            form A·(σr + ρv²): a strength term the sheet always charges, plus an inertia term that grows with
            the square of speed and dominates at high velocity. Meanwhile the sheet itself dishes on
            Timoshenko&apos;s large-deflection curve — bending stiffness first, membrane stretching taking over
            past one thickness of deflection, capped by the rigid-plastic collapse load.
          </p>
          <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "#8b97a3", marginTop: 10, lineHeight: 1.7 }}>
            <strong style={{ color: "#c2ccd4" }}>Failure modes — who wins the race.</strong> Every step, three
            failure checks race each other. <em>Shear plugging</em>: a blunt face (any cube, or a fast sphere
            once shear localizes) drives the contact force past what the remaining ligament can carry in
            shear, and a plug pops out — the projectile and plug then share momentum Recht–Ipson style.{" "}
            <em>Membrane tearing</em>: a slow, round projectile instead stretches the dish until the strain
            at the contact rim beats the material&apos;s ductility — the sheet rips and petals fold back.{" "}
            <em>Brittle fracture</em>: ceramics and glass never yield; when the back-face bending stress
            passes the fracture strength they crack radially, keep only rubble resistance, and either arrest
            the projectile in the cracked sheet or shatter through. Whichever check fires first sets the
            failure animation you see — and below every limit the sheet simply dents, dishes or trampolines
            the projectile back.
          </p>
          <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "#8b97a3", marginTop: 10, lineHeight: 1.7 }}>
            <strong style={{ color: "#c2ccd4" }}>Material pairings.</strong> Both sides matter. A projectile
            softer than the impact pressure mushrooms — lead splats against steel, spreading its load over
            ~3× the area and making perforation much harder, which is exactly why soft bullets stop in hard
            plate. Density buys penetration: tungsten out-penetrates steel at the same size because the
            inertia term scales with projectile mass. Strain-rate hardening (Cowper–Symonds, capped at 2×)
            gives mild steel its well-known dynamic strength boost. The ballistic limit readout is found by
            bisecting the full simulation, so every one of these effects feeds it.
          </p>
          <p style={{ fontFamily: "var(--sans)", fontSize: 12.5, color: "#8b97a3", marginTop: 10, lineHeight: 1.7 }}>
            <strong style={{ color: "#c2ccd4" }}>Scope.</strong> Normal (perpendicular) impact of a compact
            projectile on a clamped circular sheet, 1–3000 m/s. The two-DOF lumping means the sheet&apos;s
            wave-dominated early response and exact petal counts are stylized; ceramic dwell, spall rings,
            oblique hits, multi-layer stacks and temperature effects are not modeled. Handbook material
            properties — real sheets scatter, so treat the ballistic limit as ±25% and test anything that
            matters. A battery-can check (steel or aluminum housing vs a dropped or thrown part) is a good
            fit; the nail-penetration abuse test is quasi-static and needs a different (slower) model.
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
            <span style={{ textDecoration: "underline", textUnderlineOffset: 3, color: "#e8edf1" }}>In short:</span>{" "}
            thin sheets die three ways — punched (plug), torn (petals) or cracked (shatter) — and which one
            you get depends on the projectile&apos;s nose, speed and both materials. Below the ballistic limit
            everything is a dent and a bounce; above it, the residual velocity climbs like √(v² − v_bl²).
            Slingshot the projectile across that limit and watch the failure mode flip.
          </p>
        </div>
      </div>
    </div>
  );
}
