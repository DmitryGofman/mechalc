import { useEffect, useMemo, useRef, useState } from "react";
import * as ZM from "./zipTieMath";
import { buildScene, drawScene, type View } from "./zipTieScene";
import { dataHTML, reportHTML, summaryHTML, theoryHTML, tipsHTML } from "./zipTieTheory";

// Zip Tie — Cable Tie. Will this tie hold that load, in that place?
// The rating, the derating, and everything else one needs to know about
// zip ties lives on the Data & materials tab.

const M = "var(--mono)";
const f = ZM.fmt;

type Tab = "model" | "theory" | "data" | "tips";

export default function ZipTieCalc() {
  const [inp, setInp] = useState<ZM.ZipInput>(ZM.defaults);
  const [tab, setTab] = useState<Tab>("model");
  const [ex, setEx] = useState(25);
  const [stressMode, setStressMode] = useState(true);
  const [forces, setForces] = useState(true);
  const [spin, setSpin] = useState(false);
  // Non-null only while an export is in flight: which document, plus the 3D
  // snapshot to embed in it.
  const [printDoc, setPrintDoc] = useState<{ brief: boolean; img: string } | null>(null);

  const set = <K extends keyof ZM.ZipInput>(k: K, v: ZM.ZipInput[K]) => setInp((s) => ({ ...s, [k]: v }));
  // Picking a duty also proposes its safety factor — the 2/4/5 rule — while
  // leaving the SF field free to override afterwards.
  const setNature = (v: string) => setInp((s) => ({ ...s, nature: v, SFt: ZM.NATURES[v].sf }));

  const res = useMemo(() => ZM.solve(inp), [inp]);

  const cvRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<View>({ yaw: -0.62, pitch: -0.2, dist: 5.2 });
  const handlesRef = useRef<number[][]>([]);
  const dragRef = useRef<{ mode: "orbit" | "load" | null; x: number; y: number; ly: number; F0: number }>({ mode: null, x: 0, y: 0, ly: 0, F0: 0 });
  const liveRef = useRef({ inp, res, ex, stressMode, forces, spin });
  liveRef.current = { inp, res, ex, stressMode, forces, spin };

  // One animation loop for the viewer.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const cv = cvRef.current;
      const L = liveRef.current;
      if (cv && cv.offsetParent) {
        if (L.spin) viewRef.current.yaw += 0.006;
        const scene = buildScene(L.inp, L.res, {
          ex: L.ex, stressMode: L.stressMode, forces: L.forces, opaque: true,
        });
        handlesRef.current = drawScene(cv, scene, viewRef.current, 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Load slider ceiling: past the tie's letting-go point with room to explore,
  // but not so far the useful range is a sliver. Re-fit only when the
  // arrangement changes, not while dragging the load itself.
  const fmax = useMemo(() => {
    const cap = ZM.solve({ ...inp, F: 1 }).capacityAll;
    return Math.max(50, Math.ceil((cap > 0 ? 1.6 * cap : 400) / 50) * 50);
  }, [inp.size, inp.mat, inp.temp, inp.env, inp.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDown = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const cv = cvRef.current;
    if (!cv) return;
    cv.setPointerCapture(ev.pointerId);
    const rect = cv.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    // Grabbing the bundle pulls on the tie; anywhere else orbits.
    const hit = handlesRef.current.some((h) => Math.hypot(h[0] - x, h[1] - y) < 34);
    dragRef.current = { mode: hit ? "load" : "orbit", x: ev.clientX, y, ly: ev.clientY, F0: inp.F };
  };
  const onMove = (ev: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d.mode) return;
    if (d.mode === "load") {
      const rect = cvRef.current!.getBoundingClientRect();
      set("F", Math.max(0, Math.min(fmax, d.F0 + ((ev.clientY - rect.top - d.y) / 110) * fmax * 0.6)));
    } else {
      viewRef.current.yaw += (ev.clientX - d.x) * 0.008;
      viewRef.current.pitch = Math.max(-1.25, Math.min(1.0, viewRef.current.pitch + (ev.clientY - d.ly) * 0.006));
      d.x = ev.clientX;
      d.ly = ev.clientY;
    }
  };
  const onUp = () => { dragRef.current.mode = null; };

  // Report snapshot — the same scene re-rendered offscreen at print density on
  // paper white, never a lift of the dark screen canvas.
  const snapshot = (brief: boolean): string => {
    const cv = document.createElement("canvas");
    const scene = buildScene(inp, res, { ex, stressMode, forces, opaque: true });
    const view: View = { ...viewRef.current };
    drawScene(cv, scene, view, 1, {
      width: 1100, height: brief ? 460 : 640, scale: 2, background: "#ffffff", settle: true,
    });
    return cv.toDataURL("image/png");
  };
  const exportPDF = (brief: boolean) => setPrintDoc({ brief, img: snapshot(brief) });

  useEffect(() => {
    if (!printDoc) return;
    let done = false;
    const finish = () => { if (!done) { done = true; setPrintDoc(null); } };
    window.addEventListener("afterprint", finish);
    // Two frames: one to mount the print document, one to lay it out.
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
      setTimeout(finish, 1500);
    }));
    return () => { window.removeEventListener("afterprint", finish); cancelAnimationFrame(raf); };
  }, [printDoc]);

  const sfc = ZM.sfColor(res.SF * (2 / Math.max(inp.SFt, 0.5)));
  const verdictAccent = res.outOfRange || res.SF < 1 ? "#d65c5c" : res.ok ? "#4fb477" : "#cf9f52";

  const lab: React.CSSProperties = { fontFamily: M, fontSize: 8.5, letterSpacing: ".14em", color: "#6b7884", textTransform: "uppercase" };
  const btn = (on: boolean): React.CSSProperties => ({
    fontFamily: M, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", cursor: "pointer",
    background: "#0e1419", border: `1px solid ${on ? "#3a78c2" : "#1f2a33"}`, color: on ? "#3a78c2" : "#8b97a3",
    borderRadius: 2, padding: "7px 10px", whiteSpace: "nowrap",
  });
  const panel: React.CSSProperties = { background: "#0b1015", border: "1px solid #141c22", borderRadius: 3, padding: "10px 13px", marginTop: 8 };

  return (
    <div className="flexure-shell clamp-page" style={{ maxWidth: 620, margin: "0 auto" }}>
      <div className="flexure-header" style={{ marginBottom: 12, paddingBottom: 10, borderBottom: "1px solid #1f2a33" }}>
        <div>
          <div style={{ fontFamily: M, fontSize: 9, letterSpacing: ".25em", color: "#3a78c2" }}>FASTENERS</div>
          <h1 className="flexure-title" style={{ margin: "5px 0 0", fontSize: 20, fontWeight: 600 }}>Zip Tie — Cable Tie</h1>
          <div style={{ fontFamily: M, fontSize: 9, color: "#46515c", marginTop: 5, lineHeight: 1.7 }}>
            Will it hold, in that heat, in that sun, for that long. Drag the bundle to pull on the tie; drag elsewhere to orbit.
          </div>
        </div>
      </div>

      <div className="tabbar" role="tablist">
        {([["model", "Model"], ["theory", "Theory & report"], ["data", "Data & materials"], ["tips", "Design tips"]] as [Tab, string][])
          .map(([k, t]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={`tabbtn${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{t}</button>
          ))}
      </div>

      {/* ── MODEL ── */}
      <div className={`tabpane${tab === "model" ? " on" : ""}`} data-t="model">
        <div className="clamp-stage">
          <canvas ref={cvRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
          <div className="clamp-hud">
            F <b>{f(inp.F, 0)} N</b> ≈ <b>{f(inp.F / ZM.G, 1)} kg</b> · per tie <b>{f(res.Ftie, 0)} N</b><br />
            capacity <b>{f(res.capacity, 0)} N</b>/tie at {f(inp.temp, 0)} °C<br />
            SF <b style={{ color: sfc }}>{isFinite(res.SF) ? res.SF.toFixed(2) : "∞"}</b>
            {res.util > 1 && <b style={{ color: "#d65c5c" }}> · PAST RATING</b>}
          </div>
          <div className="clamp-hint">drag the bundle to pull · drag elsewhere to orbit</div>
        </div>

        <div style={{ ...panel, display: "flex", alignItems: "center", gap: 9 }}>
          <span style={{ ...lab, whiteSpace: "nowrap" }}>Load</span>
          <input type="range" min={0} max={fmax} step={1} value={inp.F} aria-label="Load on the tie"
            onChange={(e) => set("F", +e.target.value)} style={{ flex: 1, accentColor: "#3a78c2", minWidth: 0 }} />
          <span style={{ fontFamily: M, fontSize: 13, fontWeight: 600, minWidth: 92, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
            {f(inp.F, 0)} N · {f(inp.F / ZM.G, 1)} kg
          </span>
        </div>

        <div className="clamp-rec" style={{ borderColor: verdictAccent }}>
          <span style={{ fontFamily: M, fontSize: 22, fontWeight: 600, color: verdictAccent, whiteSpace: "nowrap" }}>
            {f(res.maxWork, 0)} N
          </span>
          <span style={{ fontFamily: M, fontSize: 9.5, color: "#8b97a3", lineHeight: 1.65, flex: 1, minWidth: 150 }}>
            {res.outOfRange
              ? <><b style={{ color: "#e8edf1" }}>out of temperature range</b> — {f(inp.temp, 0)} °C is outside {inp.mat}'s
                {" "}{res.m.tMin}…{res.m.tMax} °C window. Change the material, not the safety factor.</>
              : <>
                <b style={{ color: "#e8edf1" }}>recommended working load ≈ {f(res.maxWorkKg, 1)} kg</b> — capacity{" "}
                {f(res.capacityAll, 0)} N over your {f(inp.SFt, 1)}× target for {inp.nature.toLowerCase()}.<br />
                {inp.F <= 0
                  ? <span style={{ color: "#46515c" }}>No load entered — this is capacity only.</span>
                  : res.SF < 1
                    ? <span style={{ color: "#d65c5c" }}>Your {f(inp.F, 0)} N exceeds capacity — this tie lets go. Size up, add ties, or change material.</span>
                    : res.ok
                      ? <>Your {f(inp.F, 0)} N sits at SF {res.SF.toFixed(2)} — <span style={{ color: "#4fb477" }}>covered</span>.</>
                      : <><span style={{ color: "#cf9f52" }}>Margin thin:</span> SF {res.SF.toFixed(2)} against the {f(inp.SFt, 1)} target —
                        the next class up ({nextClassUp(inp.size) ?? "none bigger"}) or a second tie fixes it.</>}
              </>}
          </span>
        </div>
        <div className="clamp-hintline">
          <b>Capacity</b> = the printed {res.size.ratedLb} lb loop-tensile rating × material ({res.m.factor.toFixed(2)})
          × temperature ({res.fTemp.toFixed(2)} at {f(inp.temp, 0)} °C) × environment ({res.fEnv.toFixed(2)}){inp.n > 1 ? <> × {inp.n} ties at {f(ZM.SHARE * 100, 0)}% sharing</> : null}.
          The rating is a <b>break</b> figure measured on the closed loop — the head, not the strap, is what lets go,
          which is why the model paints the head hotter.
        </div>

        <div className="btnrow">
          <button style={btn(stressMode)} onClick={() => setStressMode((v) => !v)}>Stress colours</button>
          <button style={btn(forces)} onClick={() => setForces((v) => !v)}>Forces</button>
          <button style={btn(spin)} onClick={() => setSpin((v) => !v)}>Auto-spin</button>
          <span style={{ ...panel, margin: 0, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={lab}>Stretch ×</span>
            <input type="range" min={1} max={60} value={ex} aria-label="Stretch magnification"
              onChange={(e) => setEx(+e.target.value)} style={{ width: 68, accentColor: "#3a78c2" }} />
            <span style={{ fontFamily: M, fontSize: 11, minWidth: 24 }}>×{ex}</span>
          </span>
        </div>

        <div className="clamp-legend">
          <span><i style={{ background: "linear-gradient(90deg,#4fb477,#d98c38,#d64545)" }} />
            {stressMode
              ? `strap & head: 0 → their own letting-go point in these conditions (head reads hotter — it is the rating)`
              : "plain material colour"}</span>
        </div>

        <div className="clamp-strip">
          {([
            ["holds", isFinite(res.SF) ? res.SF.toFixed(2) : "∞", `SF vs your ${f(inp.SFt, 1)}× target`, sfc, !res.ok && isFinite(res.SF)],
            ["capacity", f(res.capacityAll, 0), `N, all ${inp.n > 1 ? inp.n + " ties" : "in"} · ${f(ZM.lbf(res.capacityAll), 0)} lbf`, "#8b97a3", false],
            ["working", f(res.maxWork, 0), `N ≈ ${f(res.maxWorkKg, 1)} kg recommended`, "#8b97a3", false],
            ["length", f(res.minLen, 0), `mm min for Ø${f(inp.bundle, 0)} bundle`, "#8b97a3", false],
          ] as [string, string, string, string, boolean][]).map(([k, n, u, c, hot]) => (
            <div key={k} className="clamp-cell" style={hot ? { borderColor: "#d65c5c" } : undefined}>
              <div className="k">{k}</div><div className="n" style={{ color: c }}>{n}</div><div className="u">{u}</div>
            </div>
          ))}
        </div>

        {res.warns.filter((w) => w.level !== "info").slice(0, 2).map((w, i) => (
          <div key={i} className={`clamp-warn ${w.level}`}>{w.text}</div>
        ))}

        <div className="clamp-form">
          <Sel label="Tie size class" wide v={inp.size} opts={Object.keys(ZM.TIE_SIZES)} on={(v) => set("size", v)}
            hint={<>
              {res.size.w} × {res.size.t} mm strap · rated <b>{f(res.size.rated, 0)} N ({res.size.ratedLb} lbf)</b> in PA66 ·
              sold {res.size.lengths} · MIL dash {res.size.ms3367}.{" "}
              <button className="linkish" onClick={() => setTab("data")}>all sizes & materials →</button>
            </>} />
          <Sel label="Material" wide v={inp.mat} opts={Object.keys(ZM.TIE_MATS)} on={(v) => set("mat", v)}
            hint={<>
              {res.m.tMin}…{res.m.tMax} °C · UV {res.m.uv} · UL 94 {res.m.ul94} · {res.m.note}
            </>} />
          <Num label="Load" unit="N total" v={inp.F} on={(v) => set("F", v)} step={5} />
          <Num label="Ties sharing it" unit="count" v={inp.n} on={(v) => set("n", Math.max(1, Math.round(v)))} step={1} />
          <Num label="Service temp" unit="°C" v={inp.temp} on={(v) => set("temp", v)} step={5} />
          <Num label="Bundle Ø" unit="mm" v={inp.bundle} on={(v) => set("bundle", Math.max(1, v))} step={2} />
          <Sel label="Environment" wide v={inp.env} opts={Object.keys(ZM.ENVS)} on={(v) => set("env", v)}
            hint={<>{ZM.ENVS[inp.env].blurb}.</>} />
          <Sel label="Duty" v={inp.nature} opts={Object.keys(ZM.NATURES)} on={setNature} />
          <Num label="Safety factor" unit={`target · ${ZM.NATURES[inp.nature].sf}× typical`} v={inp.SFt} on={(v) => set("SFt", v)} step={0.5} />
        </div>
      </div>

      {/* ── THEORY & REPORT ── */}
      <div className={`tabpane${tab === "theory" ? " on" : ""}`} data-t="theory">
        <div className="expbar">
          <span style={lab}>Export</span>
          <button style={btn(false)} onClick={() => exportPDF(true)}>⇩ One-page summary</button>
          <button style={btn(false)} onClick={() => exportPDF(false)}>⇩ Full report</button>
          <span style={{ fontFamily: M, fontSize: 8.5, color: "#46515c", flex: 1, minWidth: 120 }}>
            opens your browser's print dialog — choose “Save as PDF”
          </span>
        </div>
        <div className="theory">
          <div className="lab">WHAT THE RATING MEANS — AND WHAT'S LEFT OF IT IN YOUR CONDITIONS</div>
          <div dangerouslySetInnerHTML={{ __html: theoryHTML(inp, res) }} />
          <div className="lab" style={{ marginTop: 18 }}>CALCULATION REPORT</div>
          <div dangerouslySetInnerHTML={{ __html: reportHTML(inp, res) }} />
        </div>
        <div className="calc-note">
          <strong>In short.</strong> A {inp.size.toLowerCase()} tie in {inp.mat} holds{" "}
          <b>{f(res.capacity, 0)} N</b> at {f(inp.temp, 0)} °C in your environment;{" "}
          {inp.n > 1 ? `${inp.n} of them share ${f(res.capacityAll, 0)} N; ` : ""}at your {f(inp.SFt, 1)}× factor the
          working load is <b>{f(res.maxWork, 0)} N ≈ {f(res.maxWorkKg, 1)} kg</b>. Ratings are catalog minimums for a
          smooth loop — sharp edges, damaged heads and reuse fall below them.
        </div>
      </div>

      {/* ── DATA & MATERIALS ── */}
      <div className={`tabpane${tab === "data" ? " on" : ""}`} data-t="data">
        <div className="theory">
          <div className="lab">EVERYTHING ONE NEEDS TO KNOW ABOUT ZIP TIES</div>
          <div dangerouslySetInnerHTML={{ __html: dataHTML(inp, res) }} />
        </div>
      </div>

      {/* ── TIPS ── */}
      <div className={`tabpane${tab === "tips" ? " on" : ""}`} data-t="tips">
        <div className="theory">
          <div className="lab">USING ZIP TIES WELL — WHAT ACTUALLY MATTERS</div>
          <div dangerouslySetInnerHTML={{ __html: tipsHTML(inp, res) }} />
        </div>
      </div>

      {/* ── The export document — mounted only while printing; the ONLY thing
             @media print shows. Authored for paper, nothing to re-skin. ── */}
      {printDoc && (
        <div id="ziptiePrint" className={`calc-print ${printDoc.brief ? "brief" : "full"}`}>
          <div className="ph">
            <h1>Zip Tie — {printDoc.brief ? "bench sheet" : "selection & check"}</h1>
            <div className="meta">
              {inp.size} · {inp.mat}<br />
              load {f(inp.F, 0)} N ≈ {f(inp.F / ZM.G, 1)} kg · {inp.n} tie{inp.n > 1 ? "s" : ""} · {f(inp.temp, 0)} °C ·{" "}
              {inp.env} · {inp.nature} at SF {f(inp.SFt, 1)}<br />
              typical catalog reference values — verify against the purchased tie's datasheet
            </div>
          </div>

          <figure className="fig">
            <img src={printDoc.img} alt="3D view of the tie looped over a rod, carrying the bundle" />
            <figcaption>
              The loop-tensile configuration: rod above, bundle hanging in the loop, load {f(inp.F, 0)} N.
              {stressMode ? " Strap and head each coloured toward their own letting-go point." : ""}
              {" "}Elastic stretch magnified ×{ex}.
            </figcaption>
          </figure>

          <div dangerouslySetInnerHTML={{ __html: summaryHTML(inp, res) }} />

          {!printDoc.brief && (
            <>
              <h2 className="sec brk">What the rating means</h2>
              <div className="theory" dangerouslySetInnerHTML={{ __html: theoryHTML(inp, res) }} />
              <h2 className="sec brk">Calculation report</h2>
              <div className="theory" dangerouslySetInnerHTML={{ __html: reportHTML(inp, res) }} />
              <h2 className="sec brk">Data & materials</h2>
              <div className="theory" dangerouslySetInnerHTML={{ __html: dataHTML(inp, res, true) }} />
              <h2 className="sec brk">Using zip ties well</h2>
              <div className="theory" dangerouslySetInnerHTML={{ __html: tipsHTML(inp, res) }} />
            </>
          )}

          <div className="foot">
            Closed-form design check on catalog class minimums and published derating curves — not certified
            allowables, not FEA. Loop rating assumes smooth mandrels; sharp edges, damaged heads and reused ties fall
            below it. Never overhead, never over people, never life-safety.
          </div>
        </div>
      )}

      <div className="calc-note">
        <strong>Scope.</strong> Static strength of the closed loop from the published rating and typical derating —
        no fatigue-life prediction, no chafe, no edge-cutting model. Elastic stretch in the 3D view is magnified
        ×{ex} to be visible at all. Typical reference values — the tie you buy has a datasheet; for anything that
        matters, use it.
      </div>
    </div>
  );
}

// The next size class up, for the "margin thin" suggestion.
function nextClassUp(size: string): string | null {
  const keys = Object.keys(ZM.TIE_SIZES);
  const i = keys.indexOf(size);
  return i >= 0 && i < keys.length - 1 ? keys[i + 1] : null;
}

/* ── small controls, matching the toolkit's language ──────────────────── */
function Num({ label, unit, v, on, step }: { label: string; unit: string; v: number; on: (v: number) => void; step: number }) {
  // Show exactly what is typed while focused; only parseable numbers reach the
  // model, and clearing then leaving restores the last good value.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="clamp-fld">
      <label>{label}<span>{unit}</span></label>
      <input
        type="number"
        step={step}
        inputMode="decimal"
        value={draft ?? String(Math.round(v * 100) / 100)}
        onChange={(e) => {
          const t = e.target.value;
          setDraft(t);
          const n = parseFloat(t);
          if (t.trim() !== "" && !Number.isNaN(n)) on(n);
        }}
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}
function Sel({ label, v, opts, on, wide, hint }: {
  label: string; v: string; opts: string[]; on: (v: string) => void; wide?: boolean; hint?: React.ReactNode;
}) {
  return (
    <div className={`clamp-fld${wide ? " wide" : ""}`}>
      <label>{label}</label>
      <select value={v} onChange={(e) => on(e.target.value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
      {hint && <div className="fldhint">{hint}</div>}
    </div>
  );
}
