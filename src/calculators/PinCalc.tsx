import { useEffect, useMemo, useRef, useState } from "react";
import * as PM from "./pinMath";
import { buildScene, drawScene } from "./pinScene";
import type { View } from "./scene3d";
import { reportHTML, summaryHTML } from "./pinReport";
import { figuresHTML } from "./pinDiagrams";
import { Field, Select } from "../ui";

// Pin & Bolt Shear Joint — a pin or bolt carrying a transverse load through
// two flanges (lap, single shear) or three (clevis, double shear).
// Answers the bench question: does this joint hold, and what gives way first?

const M = "var(--mono)";
const f = PM.fmt;
const n2 = (v: number) => (isFinite(v) ? v.toFixed(2) : "∞");
const kN = (v: number) => (isFinite(v) ? `${f(v / 1000, 2)} kN` : "∞");

type Tab = "model" | "modes" | "report" | "theory";

// A hard ceiling on the load, in newtons. 10 MN is far past anything a pin
// joint of these dimensions can be, and it is a backstop against a typo or a
// runaway feedback loop putting an absurd number on screen.
const F_CEILING = 1e7;

export default function PinCalc() {
  const [inp, setInp] = useState<PM.PinInput>(PM.defaults);
  const [tab, setTab] = useState<Tab>("model");
  const [ex, setEx] = useState(40);
  const [explode, setExplode] = useState(0);
  const [stressMode, setStressMode] = useState(true);
  const [forces, setForces] = useState(true);
  const [spin, setSpin] = useState(false);
  // Non-null only while an export is in flight: it carries which document to
  // build and the 3D snapshot to embed in it.
  const [printDoc, setPrintDoc] = useState<{ brief: boolean; img: string } | null>(null);

  const set = <K extends keyof PM.PinInput>(k: K, v: PM.PinInput[K]) => setInp((s) => ({ ...s, [k]: v }));

  const res = useMemo(() => PM.solve(inp), [inp]);

  // Slider range, in N. Scaled to the load that matters — the load the JOINT
  // fails at — not to the strongest mode in the table. Those differ wildly:
  // a PLA pin in steel flanges fails around 0.8 kN while the net section is
  // still good for 80, so ranging on the biggest rung squeezed everything
  // interesting into the first 1% of the slider and made a weak pin impossible
  // to dial in. At 2.2× capacity, failure always sits just under halfway and a
  // steel joint and a printed one get the same feel.
  const fmax = useMemo(() => {
    const cap = isFinite(res.Fcap) && res.Fcap > 0 ? res.Fcap : 1000;
    // Never below the load actually applied: switching to a weaker material
    // shrinks capacity but does not change what you asked the joint to carry,
    // and a thumb pinned at max while the readout says something else is a lie.
    //
    // Take F STRAIGHT — no headroom multiplier. With the thumb at max, F is
    // exactly fmax, so any factor above 1 makes the range demand a bigger
    // range: every pointer event ratchets it up a ladder step and holding the
    // thumb at the end runs the load to absurdity within a second. Taking F
    // as-is is a fixed point — the round-up returns the same step it was
    // given — so the range can grow to admit a load but never grow itself.
    const raw = Math.min(Math.max(2.2 * cap, inp.F), F_CEILING);
    // Round up to a human number, on a fine enough ladder that the round-up
    // never pushes failure far off the middle of the travel.
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * mag >= raw) ?? 10;
    return Math.min(Math.max(100, step * mag), F_CEILING);
  }, [res.Fcap, inp.F]);
  const fstep = useMemo(() => Math.max(1, Math.round(fmax / 500)), [fmax]);

  // The load that lands exactly on the design safety factor — what "how hard
  // may I actually work this joint" means.
  const Ftarget = res.Fcap / Math.max(inp.SFt, 1e-9);

  const cvRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ yaw: -0.55, pitch: -0.38, dist: 5.2 });
  const handlesRef = useRef<number[][]>([]);
  const dragRef = useRef<{ mode: "orbit" | "pull" | null; x: number; y: number; ly: number; f0: number }>({
    mode: null, x: 0, y: 0, ly: 0, f0: 0,
  });
  const liveRef = useRef({ inp, res, ex, explode, stressMode, forces, spin });
  liveRef.current = { inp, res, ex, explode, stressMode, forces, spin };

  // One animation loop for the whole viewer.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cv = cvRef.current;
      const L = liveRef.current;
      if (cv && cv.offsetParent) {
        if (L.spin) viewRef.current.yaw += 0.006;
        const scene = buildScene(L.inp, L.res, {
          ex: L.ex, explode: L.explode, stressMode: L.stressMode, forces: L.forces,
        });
        handlesRef.current = drawScene(cv, scene, viewRef.current, 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Ease the exploded view instead of snapping, so the stack visibly comes
  // apart and you can see which plate is which.
  const explodeTarget = useRef(0);
  useEffect(() => {
    let raf = 0;
    const step = () => {
      setExplode((e) => {
        const t = explodeTarget.current;
        return Math.abs(e - t) < 0.008 ? t : e + (t - e) * 0.22;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current;
    if (!cv) return;
    cv.setPointerCapture(ev.pointerId);
    const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    // Grabbing the loaded flange pulls it; anywhere else orbits the view.
    const hit = handlesRef.current.some((h) => Math.hypot(h[0] - x, h[1] - y) < 26);
    dragRef.current = { mode: hit ? "pull" : "orbit", x: ev.clientX, y, ly: ev.clientY, f0: inp.F };
  };
  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.mode) return;
    if (d.mode === "pull") {
      const rect = cvRef.current!.getBoundingClientRect();
      // Drag up = pull harder; the whole range spans about 260 px of travel.
      const dy = d.y - (ev.clientY - rect.top);
      set("F", Math.max(0, Math.min(fmax, d.f0 + (dy / 260) * fmax)));
    } else {
      viewRef.current.yaw += (ev.clientX - d.x) * 0.008;
      viewRef.current.pitch = Math.max(-1.25, Math.min(1.0, viewRef.current.pitch + (ev.clientY - d.ly) * 0.006));
      d.x = ev.clientX;
      d.ly = ev.clientY;
    }
  };
  const onUp = () => { dragRef.current.mode = null; };

  // ── Report snapshot ──────────────────────────────────────────────────────
  // The viewer's canvas is sized to its layout box and the screen's pixel
  // ratio, so lifting it straight into a document gives a picture that is soft
  // the moment it is printed. Render the same scene again offscreen, at print
  // density, on paper white.
  const snapshot = (brief: boolean): string => {
    const cv = document.createElement("canvas");
    const scene = buildScene(inp, res, { ex, explode, stressMode, forces });
    drawScene(cv, scene, { ...viewRef.current }, 1, {
      width: 1100, height: brief ? 460 : 700, scale: 2, background: "#ffffff", settle: true,
    });
    return cv.toDataURL("image/png");
  };

  // Printing renders a document of its own rather than re-skinning the live UI:
  // an inline dark background beats any @media print rule without !important,
  // which is what turns exported PDFs into black slabs.
  const exportPDF = (brief: boolean) => setPrintDoc({ brief, img: snapshot(brief) });

  useEffect(() => {
    if (!printDoc) return;
    let done = false;
    const finish = () => { if (!done) { done = true; setPrintDoc(null); } };
    // Chrome blocks inside print(); Safari returns immediately, so afterprint
    // is the signal the document may be torn down. The timeout is a backstop
    // for browsers that never fire it.
    window.addEventListener("afterprint", finish);
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
      setTimeout(finish, 1500);
    }));
    return () => { window.removeEventListener("afterprint", finish); cancelAnimationFrame(raf); };
  }, [printDoc]);

  const vc = res.holds ? (res.meetsTarget ? "#4fb477" : "#cf9f52") : "#d65c5c";
  const verdict = res.holds ? (res.meetsTarget ? "JOINT HOLDS" : "HOLDS — UNDER TARGET SF") : "JOINT FAILS";
  const used = inp.F > 0 && isFinite(res.Fcap) ? inp.F / res.Fcap : 0;
  const isClevis = inp.config === 3;

  const lab: React.CSSProperties = { fontFamily: M, fontSize: 8.5, letterSpacing: ".14em", color: "#6b7884", textTransform: "uppercase" };
  const btn = (on: boolean): React.CSSProperties => ({
    fontFamily: M, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer",
    background: "#0e1419", border: `1px solid ${on ? "#3a78c2" : "#1f2a33"}`, color: on ? "#3a78c2" : "#8b97a3",
    borderRadius: 2, padding: "7px 10px", whiteSpace: "nowrap",
  });
  const panel: React.CSSProperties = { background: "#0b1015", border: "1px solid #141c22", borderRadius: 3, padding: "10px 13px", marginTop: 8 };
  const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 };
  const sectionLab: React.CSSProperties = {
    ...lab, gridColumn: "1 / -1", borderTop: "1px solid #141c22", paddingTop: 9, marginTop: 3,
  };

  return (
    <div className="flexure-shell clamp-page" style={{ maxWidth: 620, margin: "0 auto" }}>
      <div className="flexure-header" style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #1f2a33" }}>
        <div>
          <div style={{ fontFamily: M, fontSize: 9, letterSpacing: ".25em", color: "#3a78c2" }}>FASTENERS</div>
          <h1 className="flexure-title" style={{ margin: "5px 0 0", fontSize: 20, fontWeight: 600 }}>
            Pin &amp; Bolt Shear Joint
          </h1>
          <div style={{ fontFamily: M, fontSize: 9, color: "#46515c", marginTop: 5, lineHeight: 1.7 }}>
            Does the joint hold, and what gives way first. Drag the loaded flange to pull; drag elsewhere to orbit.
          </div>
        </div>
      </div>

      <div className="tabbar" role="tablist">
        {([["model", "Model"], ["modes", "Failure modes"], ["report", "Report"], ["theory", "Theory & scope"]] as [Tab, string][]).map(([k, t]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tabbtn${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
      </div>

      {/* ── MODEL ── */}
      <div className={`tabpane${tab === "model" ? " on" : ""}`}>
        <div className="clamp-stage">
          <canvas ref={cvRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
          <div className="clamp-hud">
            F <b>{f(inp.F / 1000, 2)} kN</b> · {res.nPlanes} shear plane{res.nPlanes > 1 ? "s" : ""}<br />
            τ pin <b>{f(res.tau, 1)} MPa</b> · joint SF <b style={{ color: PM.sfColor(res.SFjoint) }}>{n2(res.SFjoint)}</b><br />
            governs <b>{res.governing.label.toLowerCase()}</b>
          </div>
          <div style={{
            position: "absolute", top: 9, right: 11, fontFamily: M, fontSize: 10, fontWeight: 700,
            letterSpacing: ".1em", textAlign: "right", pointerEvents: "none", textShadow: "0 1px 5px #000", lineHeight: 1.6,
          }}>
            <span style={{ color: vc }}>{res.holds ? (res.meetsTarget ? "HOLDS" : "UNDER TARGET") : "FAILS"}</span><br />
            <span style={{ color: "#46515c", fontWeight: 400 }}>capacity {kN(res.Fcap)}</span>
          </div>
          {/* When the pin is the weak link, the place it gives way is inside
              the stack — hidden, and correctly so. Say where to look rather
              than reddening the ends, which carry nothing. */}
          <div className="clamp-hint">
            {res.governing.part === "pin" && explode < 0.5 && inp.F > 0
              ? <span style={{ color: PM.sfColor(res.SFjoint) }}>the pin governs, inside the stack — tap EXPLODED to see where</span>
              : "drag the loaded flange to pull · drag elsewhere to orbit"}
          </div>
        </div>

        <div style={{ ...panel, display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ ...lab, whiteSpace: "nowrap" }}>Load</span>
          <input type="range" min={0} max={fmax} step={fstep} value={Math.min(inp.F, fmax)}
            aria-label="Applied load"
            onChange={(e) => set("F", +e.target.value)} style={{ flex: 1, accentColor: "#3a78c2", minWidth: 0 }} />
          <span style={{ fontFamily: M, fontSize: 13, fontWeight: 600, minWidth: 74, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {f(inp.F / 1000, 2)} kN
          </span>
        </div>

        {/* Jump straight to the load the design target allows, then explore
            around it — the range is scaled so that point is always reachable. */}
        <div style={{ ...panel, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button style={btn(false)} onClick={() => set("F", Math.min(Ftarget, F_CEILING))} disabled={!isFinite(Ftarget)}>
            go to SF {f(inp.SFt, 1)}
          </button>
          <button style={btn(false)} onClick={() => set("F", Math.min(res.Fcap, F_CEILING))} disabled={!isFinite(res.Fcap)}>
            go to failure
          </button>
          <span style={{ fontFamily: M, fontSize: 9.5, color: "#6b7884", lineHeight: 1.6, flex: 1, minWidth: 140 }}>
            target SF {f(inp.SFt, 1)} → <b style={{ color: "#8b97a3" }}>{kN(Ftarget)}</b> ·
            fails at <b style={{ color: "#8b97a3" }}>{kN(res.Fcap)}</b>
          </span>
        </div>

        {/* verdict */}
        <div className="clamp-rec" style={{ borderColor: vc }}>
          <span style={{ fontFamily: M, fontSize: 15, fontWeight: 700, color: vc, whiteSpace: "nowrap", letterSpacing: ".04em" }}>
            {verdict}
          </span>
          <span style={{ fontFamily: M, fontSize: 9.5, color: "#8b97a3", lineHeight: 1.65, flex: 1, minWidth: 150 }}>
            Weakest link is <b style={{ color: "#e8edf1" }}>{res.governing.label.toLowerCase()}</b> — it reaches{" "}
            {f(res.governing.allow, 0)} MPa at <b style={{ color: "#e8edf1" }}>{kN(res.Fcap)}</b>.{" "}
            {inp.F > 0
              ? <>You are at <b style={{ color: vc }}>{f(100 * used, 0)}%</b> of that
                {res.holds && !res.meetsTarget && <> — short of your target SF {f(inp.SFt, 1)}</>}.</>
              : <span style={{ color: "#46515c" }}>No load applied, so this is capacity only.</span>}
          </span>
        </div>

        {/* part chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {[["pin", res.partSF.pin] as const, ...res.members.map((m) => [m.label, res.partSF[m.key]] as const)].map(([k, sf]) => (
            <span key={k} style={{
              fontFamily: M, fontSize: 9.5, border: `1px solid ${PM.sfColor(sf)}`, color: PM.sfColor(sf),
              borderRadius: 2, padding: "3px 7px",
            }}>
              {k} · SF {n2(sf)}
            </span>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <button style={btn(stressMode)} onClick={() => setStressMode(!stressMode)}>stress colour</button>
          <button style={btn(forces)} onClick={() => setForces(!forces)}>force arrows</button>
          <button style={btn(explodeTarget.current > 0.5)} onClick={() => { explodeTarget.current = explodeTarget.current > 0.5 ? 0 : 1; }}>
            exploded
          </button>
          <button style={btn(spin)} onClick={() => setSpin(!spin)}>spin</button>
          <button style={btn(false)} onClick={() => { viewRef.current.yaw = -0.55; viewRef.current.pitch = -0.38; }}>reset view</button>
        </div>

        <div style={{ ...panel, display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ ...lab, whiteSpace: "nowrap" }}>Deformation ×</span>
          <input type="range" min={0} max={120} step={1} value={ex} aria-label="Deformation exaggeration"
            onChange={(e) => setEx(+e.target.value)} style={{ flex: 1, accentColor: "#3a78c2", minWidth: 0 }} />
          <span style={{ fontFamily: M, fontSize: 13, fontWeight: 600, minWidth: 44, textAlign: "right" }}>{ex}×</span>
        </div>

        {/* inputs */}
        <div style={grid2}>
          <div style={{ gridColumn: "1 / -1", display: "flex", border: "1px solid #1f2a33", borderRadius: 2, overflow: "hidden" }}>
            {([[3, "3 FLANGES · DOUBLE SHEAR"], [2, "2 FLANGES · SINGLE SHEAR"]] as [PM.PinConfig, string][]).map(([v, t]) => (
              <button key={v} onClick={() => set("config", v)} style={{
                flex: 1, background: inp.config === v ? "#12253c" : "#0e1419", border: "none",
                color: inp.config === v ? "#3a78c2" : "#6b7884", fontFamily: M, fontSize: 10, padding: "8px 4px", cursor: "pointer",
              }}>
                {t}
              </button>
            ))}
          </div>

          <Field label="Load F" unit="N" value={String(inp.F)} step="100" min="0"
            onChange={(v) => set("F", Math.min(Math.max(0, +v || 0), F_CEILING))} />
          <Field label="Target SF" unit="—" value={String(inp.SFt)} step="0.5" min="0" onChange={(v) => set("SFt", +v || 1)} />

          <div style={sectionLab}>Pin / bolt</div>
          <div style={{ gridColumn: "1 / -1", display: "flex", border: "1px solid #1f2a33", borderRadius: 2, overflow: "hidden" }}>
            {([[false, "SOLID BAR"], [true, "HOLLOW · TUBE"]] as [boolean, string][]).map(([v, t]) => (
              <button key={String(v)} onClick={() => set("hollow", v)} style={{
                flex: 1, background: inp.hollow === v ? "#12253c" : "#0e1419", border: "none",
                color: inp.hollow === v ? "#3a78c2" : "#6b7884", fontFamily: M, fontSize: 10, padding: "8px 4px", cursor: "pointer",
              }}>
                {t}
              </button>
            ))}
          </div>
          <Field label={inp.hollow ? "Outside Ø d" : "Diameter d"} unit="mm" value={String(inp.d)} step="0.5" min="0" onChange={(v) => set("d", +v || 0)} />
          {inp.hollow
            ? <Field label="Wall thickness" unit={`mm · bore Ø${f(res.di, 1)}`} value={String(inp.wall)} step="0.1" min="0" onChange={(v) => set("wall", +v || 0)} />
            : <Field label="Clevis gap" unit="mm/side" value={String(inp.clr)} step="0.1" min="0" onChange={(v) => set("clr", +v || 0)} />}
          {inp.hollow && (
            <Field label="Clevis gap" unit="mm/side" value={String(inp.clr)} step="0.1" min="0" onChange={(v) => set("clr", +v || 0)} />
          )}
          <div style={{ gridColumn: "1 / -1" }}>
            <Select label="What's in the shear plane" value={inp.shank} options={Object.keys(PM.SHANKS)} onChange={(v) => set("shank", v)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Select label="Pin material" value={inp.pinMat} options={Object.keys(PM.PIN_MATS)} onChange={(v) => set("pinMat", v)} />
          </div>

          <div style={sectionLab}>{isClevis ? "Outer flanges (each)" : "Flange A"}</div>
          <Field label="Thickness t₁" unit="mm" value={String(inp.t1)} step="0.5" min="0" onChange={(v) => set("t1", +v || 0)} />
          <Select label="Material" value={inp.mat1} options={Object.keys(PM.PLATE_MATS)} onChange={(v) => set("mat1", v)} />

          <div style={sectionLab}>{isClevis ? "Middle flange" : "Flange B"}</div>
          <Field label="Thickness t₂" unit="mm" value={String(inp.t2)} step="0.5" min="0" onChange={(v) => set("t2", +v || 0)} />
          <Select label="Material" value={inp.mat2} options={Object.keys(PM.PLATE_MATS)} onChange={(v) => set("mat2", v)} />

          <div style={sectionLab}>Flange geometry (both)</div>
          <Field label="Width w" unit="mm across the hole" value={String(inp.w)} step="1" min="0" onChange={(v) => set("w", +v || 0)} />
          <Field label="Edge distance a" unit="mm, centre → edge" value={String(inp.a)} step="0.5" min="0" onChange={(v) => set("a", +v || 0)} />
        </div>

        <Warnings warns={res.warns} />
      </div>

      {/* ── FAILURE MODES ── */}
      <div className={`tabpane${tab === "modes" ? " on" : ""}`}>
        <div style={{ ...panel, marginTop: 12 }}>
          <div style={{ ...lab, marginBottom: 8 }}>Capacity ladder — what lets go, in load order</div>
          <Ladder res={res} F={inp.F} />
        </div>

        <div style={panel}>
          <div style={{ ...lab, marginBottom: 8 }}>Every check at {f(inp.F / 1000, 2)} kN</div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 92px 84px 56px", gap: 8, fontFamily: M,
            fontSize: 8, letterSpacing: ".12em", textTransform: "uppercase", color: "#46515c", paddingBottom: 6,
          }}>
            <span>mode</span><span style={{ textAlign: "right" }}>stress</span>
            <span style={{ textAlign: "right" }}>allowable</span><span style={{ textAlign: "right" }}>SF</span>
          </div>
          {res.modes.map((m) => (
            <div key={m.key} style={{
              display: "grid", gridTemplateColumns: "1fr 92px 84px 56px", gap: 8, alignItems: "baseline",
              padding: "5px 0", borderBottom: "1px solid #10161c", fontFamily: M,
              background: m === res.governing ? "#0d1521" : undefined,
              outline: m === res.governing ? "1px solid #17324e" : undefined,
              borderRadius: m === res.governing ? 2 : undefined,
            }}>
              <span style={{ fontSize: 10.5, color: m === res.governing ? "#e8edf1" : "#8b97a3" }}>{m.label}</span>
              <span style={{ fontSize: 10, color: "#46515c", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {m.kind} {f(m.stress, 1)} MPa
              </span>
              <span style={{ fontSize: 10, color: "#46515c", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                / {f(m.allow, 0)}
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: PM.sfColor(m.SF), textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {n2(m.SF)}
              </span>
            </div>
          ))}
        </div>

        <div style={panel}>
          <div style={{ ...lab, marginBottom: 8 }}>The pin&apos;s section</div>
          <div style={{ fontFamily: M, fontSize: 10, color: "#8b97a3", lineHeight: 1.9 }}>
            <b style={{ color: "#e8edf1" }}>{inp.pinMat}</b> ·{" "}
            {inp.hollow
              ? <>tube Ø{f(inp.d, 1)} × {f(res.wall, 2)} mm wall, bore Ø{f(res.di, 1)}</>
              : <>solid Ø{f(inp.d, 1)}</>}<br />
            shear area {f(res.Ashear, 1)} mm² over {res.nPlanes} plane{res.nPlanes > 1 ? "s" : ""} ·
            I = {f(res.Ipin, 1)} mm⁴ · Z = {f(res.Zpin, 1)} mm³
            {inp.hollow && (
              <><br />
                <span style={{ color: "#46515c" }}>
                  vs the same bar solid: {f(100 * (res.Apin / ((Math.PI / 4) * inp.d ** 2)), 0)}% of the material,{" "}
                  {f(100 * (res.Ipin / ((Math.PI / 64) * inp.d ** 4)), 0)}% of the bending stiffness
                </span>
              </>
            )}
          </div>
        </div>

        <div style={panel}>
          <div style={{ ...lab, marginBottom: 8 }}>How the load splits</div>
          {res.members.map((m) => (
            <div key={m.key} style={{ fontFamily: M, fontSize: 10, color: "#8b97a3", lineHeight: 1.9 }}>
              <b style={{ color: "#e8edf1" }}>{m.label}</b> — {m.matName}, {f(m.t, 1)} mm ·
              carries {f(100 * m.share, 0)}% of F = <b style={{ color: "#e8edf1" }}>{f(m.Fi, 0)} N</b> ·
              bearing {f(m.pBear, 1)} · net {f(m.sigmaNet, 1)} · tear-out {f(m.tauTear, 1)} MPa
            </div>
          ))}
        </div>

        <Warnings warns={res.warns} />
      </div>

      {/* ── REPORT ── */}
      <div className={`tabpane${tab === "report" ? " on" : ""}`}>
        <div style={{ ...panel, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: M, fontSize: 9.5, color: "#8b97a3", lineHeight: 1.6, flex: 1, minWidth: 160 }}>
            Every check worked through with your numbers. Export goes through the browser&apos;s own print dialogue —
            choose <b style={{ color: "#c2ccd4" }}>Save as PDF</b> as the destination.
          </span>
          <button style={btn(false)} onClick={() => exportPDF(true)}>one-page sheet</button>
          <button style={btn(false)} onClick={() => exportPDF(false)}>full report PDF</button>
        </div>
        <div className="theory">
          <div className="lab">CALCULATION REPORT</div>
          <div dangerouslySetInnerHTML={{ __html: reportHTML(inp, res) }} />
        </div>
      </div>

      {/* ── THEORY ── */}
      <div className={`tabpane${tab === "theory" ? " on" : ""}`}>
        <Theory inp={inp} res={res} />
      </div>

      {/* ── The export document ────────────────────────────────────────────
          Mounted only while printing, and the only thing @media print shows.
          Everything in it is authored for paper — no live controls, no
          inherited panel colours — so there is nothing left to re-skin. */}
      {printDoc && (
        <div id="pinPrint" className={`calc-print ${printDoc.brief ? "brief" : "full"}`}>
          <div className="ph">
            <h1>Pin &amp; Bolt Shear Joint — {printDoc.brief ? "bench sheet" : "design calculation"}</h1>
            <div className="meta">
              {res.double ? "3 flanges — clevis, double shear" : "2 flanges — lap joint, single shear"} ·{" "}
              {res.nPlanes} shear plane{res.nPlanes > 1 ? "s" : ""}<br />
              pin {inp.hollow ? `Ø${f(inp.d, 1)} × ${f(res.wall, 2)} wall (bore Ø${f(res.di, 1)})` : `Ø${f(inp.d, 1)} solid`} ·{" "}
              {inp.pinMat} · {inp.shank}<br />
              {res.members.map((m) => `${m.label} ${f(m.t, 1)} mm ${m.matName}`).join(" · ")}<br />
              flange w {f(inp.w, 1)} · edge a {f(inp.a, 1)} mm · applied {f(inp.F / 1000, 2)} kN · target SF {f(inp.SFt, 1)}<br />
              typical reference values — verify before production
            </div>
          </div>

          <figure className="fig">
            <img src={printDoc.img} alt="3D view of the pin joint, coloured by failure mode" />
            <figcaption>
              {stressMode
                ? <>Each zone coloured by the check that owns it — bearing at the holes, tear-out on the edge
                  ligaments, net section on the flanks, shear and bending on the pin — at {f(inp.F / 1000, 2)} kN.</>
                : <>Material colours, stress shading off.</>}
              {" "}Slip magnified ×{ex}{explode > 0.5 ? " · exploded" : ""}.
            </figcaption>
          </figure>

          <div dangerouslySetInnerHTML={{ __html: summaryHTML(inp, res) }} />

          {!printDoc.brief && (
            <>
              <h2 className="sec brk">Calculation report</h2>
              <div className="theory" dangerouslySetInnerHTML={{ __html: reportHTML(inp, res, true) }} />
              <h2 className="sec brk">Notes and warnings</h2>
              <table className="rep">
                <tbody>{res.warns.map((w, i) => <tr key={i}><td>{w.text}</td></tr>)}</tbody>
              </table>
            </>
          )}

          <div className="foot">
            MechCalc · Pin &amp; Bolt Shear Joint — static design check per Shigley ch. 8 (Fig. 8-23, Fig. 8-25,
            Eq. 8-54, Eq. 8-55). No stress concentration; Kt ≈ 2–3 at a loaded hole governs fatigue and brittle
            plates. No preload friction — the slipped, bearing state (§8-12). Yield onset, not collapse.
            Verify against your own material data before production use.
          </div>
        </div>
      )}
    </div>
  );
}

/* ── the capacity ladder ──────────────────────────────────────────────── */
function Ladder({ res, F }: { res: PM.PinResult; F: number }) {
  const rows: React.ReactNode[] = [];
  let placed = false;
  const you = (
    <div key="you" style={{
      display: "grid", gridTemplateColumns: "76px 14px 1fr", gap: 8, fontFamily: M, fontSize: 9.5,
      color: "#3a78c2", letterSpacing: ".15em", padding: "1px 0",
    }}>
      <span style={{ textAlign: "right" }}>{f(F / 1000, 2)}</span>
      <span>◂</span>
      <span>YOU ARE HERE</span>
    </div>
  );
  for (const m of res.ladder) {
    if (!isFinite(m.Fcap)) continue;
    if (!placed && F < m.Fcap) { rows.push(you); placed = true; }
    const past = F >= m.Fcap;
    rows.push(
      <div key={m.key} style={{
        display: "grid", gridTemplateColumns: "76px 14px 1fr", gap: 8, alignItems: "center",
        padding: "6px 0", fontFamily: M,
        background: m === res.governing ? "#0d1521" : undefined,
        outline: m === res.governing ? "1px solid #17324e" : undefined,
        borderRadius: m === res.governing ? 2 : undefined,
      }}>
        <span style={{ fontSize: 12, textAlign: "right", fontVariantNumeric: "tabular-nums", color: past ? "#d65c5c" : "#46515c" }}>
          {f(m.Fcap / 1000, 2)}
        </span>
        <span style={{
          width: 9, height: 9, borderRadius: "50%", justifySelf: "center",
          background: past ? "#d65c5c" : PM.sfColor(m.SF), opacity: past ? 1 : 0.5,
        }} />
        <span style={{ fontSize: 11, color: past ? "#e8edf1" : "#8b97a3", lineHeight: 1.45 }}>
          {m.label} <span style={{ color: "#46515c" }}>kN · {m.kind} hits {f(m.allow, 0)} MPa</span>
        </span>
      </div>,
    );
  }
  if (!placed) rows.push(you);
  return <>{rows}</>;
}

/* ── warnings ─────────────────────────────────────────────────────────── */
function Warnings({ warns }: { warns: PM.PinWarning[] }) {
  const tone = {
    bad: { color: "#e0a3a3", border: "#5a2a2a", background: "#160d0f" },
    warn: { color: "#d9c391", border: "#5a4a2a", background: "#141008" },
    info: { color: "#8b97a3", border: "#141c22", background: "#0b1015" },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      {warns.map((w, i) => (
        <div key={i} style={{
          fontFamily: M, fontSize: 9.5, lineHeight: 1.7, border: `1px solid ${tone[w.level].border}`,
          borderRadius: 3, padding: "7px 10px", color: tone[w.level].color, background: tone[w.level].background,
        }}>
          {w.text}
        </div>
      ))}
    </div>
  );
}

/* ── theory & scope ───────────────────────────────────────────────────── */
function Theory({ inp, res }: { inp: PM.PinInput; res: PM.PinResult }) {
  const P: React.CSSProperties = { fontFamily: "var(--sans)", fontSize: 12.5, color: "#8b97a3", lineHeight: 1.8, margin: "0 0 12px" };
  const H3: React.CSSProperties = { fontFamily: M, fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "#3a78c2", margin: "18px 0 8px" };
  const B: React.CSSProperties = { color: "#c2ccd4" };
  const eq: React.CSSProperties = {
    fontFamily: M, fontSize: 11, color: "#c2ccd4", background: "#0b1015", border: "1px solid #141c22",
    borderRadius: 3, padding: "10px 12px", margin: "0 0 12px", lineHeight: 2, overflowX: "auto", whiteSpace: "pre",
  };
  const m2 = res.members[res.members.length - 1];
  return (
    <div style={{ marginTop: 12 }}>
      <div style={H3}>The joint, and every way it lets go</div>
      <p style={P}>
        This is Shigley&apos;s Fig. 8-23 — the modes of failure in shear loading of a bolted or riveted connection —
        checked all at once. A pin carries the load across {res.nPlanes} shear plane{res.nPlanes > 1 ? "s" : ""};
        each flange passes its share through its own hole. Every check is <b style={B}>linear in the load</b>, so the
        solver works in stress per newton and reads off both the stress at F and the load at which each mode reaches
        its allowable. That is why the ladder is exact rather than a search, and why capacity is still meaningful at
        zero load.
      </p>
      <div dangerouslySetInnerHTML={{ __html: figuresHTML(inp, res) }} />
      <div style={eq}>{`pin      τ = F / (n·A)              n = ${res.nPlanes}   vs Ssy = 0.577·Sy
         σ = M / Z                  M = F/2·(t₂/4 + gap + t₁/2)
         p = Fᵢ / (d·t)             bearing on the pin itself

         solid   A = πd²/4          Z = πd³/32
         hollow  A = π(d²−dᵢ²)/4    Z = π(d⁴−dᵢ⁴)/32d

flange   p = Fᵢ / (d·t)             bearing — crushes the hole
         σ = Fᵢ / ((w−d)·t)         net section — tears across the hole
         τ = Fᵢ / (2·t·(a−d/2))     edge tear-out — shears the margin out

capacity = the smallest of them all`}</div>

      <div style={H3}>Why three flanges beat two</div>
      <p style={P}>
        With three, the load splits symmetrically: two shear planes, the middle flange carrying all of F and each
        outer one half. The pin becomes a short simply-supported beam, and <b style={B}>bending — not shear — often
        governs</b>, which is exactly what this joint shows{res.governing.key === "bend" ? " right now" : ""}. With
        two flanges there is one shear plane, both plates carry the full load, and the load path is offset, so the
        joint tries to tilt and straighten itself. That secondary bending is real and is <b style={B}>not modelled
        here</b> — a lap joint&apos;s numbers are optimistic by however much the surrounding structure lets it rotate.
      </p>

      <div style={H3}>Solid or hollow</div>
      <p style={P}>
        A tube is the same two formulas with the bore taken out. It costs less than intuition suggests, because
        bending stress grows with distance from the axis: the material you remove from the middle was the material
        doing the least work.{" "}
        {inp.hollow
          ? <>At Ø{f(inp.d, 1)} with a {f(res.wall, 2)} mm wall you keep{" "}
            <b style={B}>{f(100 * (res.Apin / ((Math.PI / 4) * inp.d ** 2)), 0)}%</b> of the material but{" "}
            <b style={B}>{f(100 * (res.Ipin / ((Math.PI / 64) * inp.d ** 4)), 0)}%</b> of the bending stiffness.</>
          : <>Switch the pin to hollow above and the panel shows both figures for your size.</>}{" "}
        Shear is the check that actually suffers, because it uses plain area with no such leverage.
      </p>
      <p style={P}>
        The catch the formulas cannot see: <b style={B}>a thin tube dents</b>. Bearing pressure is computed on the
        projected area of the outside diameter, which assumes the pin holds its round section — a thin wall ovalizes
        and crushes locally well before that pressure reaches its allowable. The calculator warns below d/8 of wall,
        and that is a warning to take seriously rather than a margin to spend.
      </p>

      <div style={H3}>Bearing is checked on both sides of the contact</div>
      <p style={P}>
        The same pressure <span style={{ fontFamily: M }}>Fᵢ/(d·t)</span> presses on the hole wall and on the pin.
        Whichever material is softer gives first, so both get their own row. For ductile metals the permissible
        bearing pressure is taken as <b style={B}>{PM.BEARING_FACTOR}·Sy</b> — bearing on a projected area yields
        later than simple tension because the loaded material is confined by what surrounds it — and every metal in
        the tables derives it that way, so it cannot drift out of step with its own yield strength. Polymers and
        laminate do not follow that rule: their limit is creep-driven and much lower relative to yield, so those rows
        carry an explicit figure.
      </p>

      <div style={H3}>Edge distance</div>
      <p style={P}>
        Structural practice keeps the hole at least <b style={B}>{PM.MIN_EDGE_RATIO} diameters</b> from the loaded
        edge, which is what lets edge shearing usually be neglected. Below that, tear-out is live, and the tearing
        area is the <em>net</em> ligament <span style={{ fontFamily: M }}>2·t·(a − d/2)</span>, not{" "}
        <span style={{ fontFamily: M }}>2·t·a</span> — the hole eats into it. Yours: a = {f(inp.a, 1)} mm against a
        minimum of {f(PM.MIN_EDGE_RATIO * inp.d, 1)} mm, leaving {f(m2.lig, 1)} mm of ligament.
      </p>

      <div style={H3}>Where this model stops being right</div>
      <p style={P}>
        <b style={B}>1 · No stress concentration.</b> A loaded hole runs Kt ≈ 2–3. For static loading of ductile
        metals that is fine — the peak yields locally and sheds load, which is the assumption behind every formula
        above. For <b style={B}>fatigue, or for brittle plates</b> (cast, laminate, filled polymers), it is not:
        multiply the net-section and bearing stresses by your own Kt before comparing.
      </p>
      <p style={P}>
        <b style={B}>2 · No friction, and no preload.</b> A properly preloaded bolt does not carry shear by bearing at
        all — it carries it by <em>clamp friction</em> until the joint slips (Shigley §8-12). Everything here is the
        state <em>after</em> slip, which is the right check for a clevis pin, a shoulder bolt or a loose-fit bolt, and
        the right worst case for a preloaded one.
      </p>
      <p style={P}>
        <b style={B}>3 · Yield onset, not collapse.</b> These compare against yield, so the numbers say when the joint
        starts to take a permanent set — a hole elongating, a pin bowing — not when it parts. A ductile joint carries
        more than its capacity here before it actually breaks; a brittle one may not.
      </p>
      <p style={P}>
        <b style={B}>4 · Printed parts, flange or pin.</b> The tabulated strengths are in-plane (XY). A hole loaded
        across layers is far weaker, and bearing on a polymer creeps: the hole elongates over time even below the
        limit. A printed <em>pin</em> is worse still — printed standing on its end, its layer boundaries lie exactly
        in the shear planes, which is the weakest orientation available. Print it lying down, and treat even that as
        an upper bound. The 0.577 shear factor is metal plasticity besides; if a printed pin governs, test a coupon.
      </p>

      <div style={H3}>References</div>
      <p style={{ ...P, marginBottom: 0 }}>
        Budynas &amp; Nisbett, <b style={B}>Shigley&apos;s Mechanical Engineering Design</b>, ch. 8 — Fig. 8-23 (modes
        of failure in shear loading), Fig. 8-25 (edge shearing of the member), Eq. 8-54 (net-section tension),
        Eq. 8-55 (bearing over the projected area). Bolt property classes come from the toolkit&apos;s shared
        ISO 898-1 table, the same one the bolted-joint calculator reads. All material figures are typical reference
        values — verify against your own data before production use.
      </p>
    </div>
  );
}
