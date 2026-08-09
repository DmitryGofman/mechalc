/*
 * GENERATED FILE — do not edit.
 * Source: src/materials/library.ts · regenerate with `npm run gen:materials`.
 * Editing this file directly recreates the split-brain material tables the
 * library was built to remove; your change would be silently overwritten.
 *
 * The design prototypes are plain browser scripts, so the shared library
 * reaches them as a global instead of an import. Load it before the
 * calculator engine:
 *
 *   <script src="../shared/materials.js"></script>
 *   <script src="my-engine.js"></script>
 *
 * Units match the library: E and Es in GPa, strengths and pressures in
 * MPa, rho kg/m3, alpha um/(m.K), k W/(m.K), cp J/(kg.K). The helpers
 * below convert to the MPa most engines work in.
 */
(function (root) {
  var MATERIALS = {
    "s235": {"id":"s235","name":"Mild steel (S235)","group":"Metal","process":"wrought","E":200,"nu":0.3,"sigmaY":235,"sigmaU":360,"pG":490,"Se":180,"rho":7850,"alpha":12,"k":50,"cp":470,"color":"#9aa7b4","tone":"#39434e","note":"Typical hot-rolled structural steel, EN 10025 S235JR, room temperature. pG per VDI 2230 Table A9. Se is a polished-specimen estimate (~0.5·σu) — apply your own surface and size factors.","aliases":["Mild steel (S235)","Steel tube (S235 / DOM)"]},
    "s355": {"id":"s355","name":"Alloy steel (S355 / 4140)","group":"Metal","process":"wrought","E":200,"nu":0.3,"sigmaY":355,"sigmaU":560,"pG":760,"Se":280,"rho":7850,"alpha":12,"k":45,"cp":470,"color":"#8f9daa","tone":"#333d47","note":"Higher-strength structural / normalised 4140-class steel at room temperature. pG per VDI 2230 Table A9. Quenched-and-tempered 4140 runs far higher — use your own heat-treat data.","aliases":["Alloy steel (S355 / 4140)","Steel (S355 / 4140N)","Steel, alloy (S355 / 4140)"]},
    "spring1095": {"id":"spring1095","name":"Spring Steel (1095)","group":"Metal","process":"wrought","E":205,"nu":0.29,"sigmaY":1200,"sigmaU":1400,"Se":600,"rho":7850,"alpha":12.5,"k":47,"cp":460,"color":"#9aa7b4","tone":"#3a444f","note":"Hardened and tempered high-carbon spring steel strip, typical spring temper. Se for high-strength steels plateaus well below 0.5·σu; treat 600 MPa as indicative only and derate for surface finish."},
    "ss304": {"id":"ss304","name":"Stainless 304 / A2","group":"Metal","process":"wrought","E":193,"nu":0.29,"sigmaY":215,"sigmaU":505,"pG":500,"Se":240,"rho":8000,"alpha":17.3,"k":16,"cp":500,"color":"#a8b2bc","tone":"#3d4a54","note":"Annealed austenitic 304/A2, room temperature. Work-hardens strongly, so cold-drawn stock is much stronger. Note the low conductivity and high expansion relative to carbon steel.","aliases":["Stainless 304 / A2","Stainless 304 tube"]},
    "castiron250": {"id":"castiron250","name":"Gray cast iron (GJL-250)","group":"Metal","process":"cast","E":110,"nu":0.26,"sigmaY":165,"sigmaU":250,"pG":800,"Se":100,"rho":7200,"alpha":10.5,"k":46,"cp":490,"color":"#8a8f94","tone":"#39404a","note":"EN-GJL-250 flake graphite iron. Brittle: no real yield point — the quoted σy is a 0.1% proof approximation and tensile capacity is far below its compressive capacity. Excellent bearing pressure, which is why pG is so high."},
    "brass37": {"id":"brass37","name":"Brass (CuZn37)","group":"Metal","process":"wrought","E":100,"nu":0.34,"sigmaY":200,"sigmaU":340,"pG":300,"Se":100,"rho":8440,"alpha":20.5,"k":120,"cp":380,"color":"#c2ab72","tone":"#544e3a","note":"CuZn37 (CW508L) in a half-hard condition. Properties swing widely with temper; annealed stock is roughly half this strength."},
    "al6061o": {"id":"al6061o","name":"Aluminum 6061","group":"Metal","process":"wrought","E":68.9,"nu":0.33,"sigmaY":55,"sigmaU":125,"Se":60,"rho":2700,"alpha":23.6,"k":167,"cp":896,"color":"#b8bcc0","tone":"#4a525a","note":"6061 in the O (annealed) temper — soft, as-supplied-for-forming. If your stock is extrusion or plate off the shelf it is almost certainly T6, not this."},
    "al6061t6": {"id":"al6061t6","name":"Aluminum 6061-T6","group":"Metal","process":"wrought","E":68.9,"nu":0.33,"sigmaY":276,"sigmaU":310,"pG":300,"Se":96,"rho":2700,"alpha":23.6,"k":167,"cp":896,"color":"#b8bcc0","tone":"#4a525a","note":"The workhorse temper for machined and extruded parts. pG per VDI 2230 Table A9. Aluminium has no true endurance limit — Se is the ~5×10⁸-cycle fatigue strength, so infinite-life reasoning does not apply."},
    "al7075o": {"id":"al7075o","name":"Aluminum 7075","group":"Metal","process":"wrought","E":71.7,"nu":0.33,"sigmaY":103,"sigmaU":228,"rho":2810,"alpha":23.4,"k":173,"cp":960,"color":"#b8bcc0","tone":"#4a525a","note":"7075 in the O (annealed) temper. Rarely what you have in hand — check for T6 before using these numbers."},
    "al7075t6": {"id":"al7075t6","name":"Aluminum 7075-T6","group":"Metal","process":"wrought","E":71.7,"nu":0.33,"sigmaY":503,"sigmaU":572,"pG":410,"Se":159,"rho":2810,"alpha":23.4,"k":130,"cp":960,"color":"#b8bcc0","tone":"#4a525a","note":"High-strength aerospace aluminium. Strong but notch-sensitive and poor in corrosion and weldability compared with 6061. pG per VDI 2230 Table A9."},
    "al5052h32": {"id":"al5052h32","name":"Aluminum 5052-H32","group":"Metal","process":"wrought","E":70.3,"nu":0.33,"sigmaY":193,"sigmaU":228,"pG":250,"Se":117,"rho":2680,"alpha":23.8,"k":138,"cp":880,"color":"#b8bcc0","tone":"#4a525a","note":"Strain-hardened sheet alloy — the usual choice for bent brackets and folded enclosures. Not heat-treatable; forming and welding soften it locally."},
    "al6063t5": {"id":"al6063t5","name":"Aluminum 6063-T5","group":"Metal","process":"wrought","E":68.9,"nu":0.33,"sigmaY":145,"sigmaU":185,"rho":2700,"alpha":23.4,"k":209,"cp":900,"color":"#bcc0c4","tone":"#4a525a","note":"Architectural extrusion alloy — the metric tube and V-slot profile alloy. Weaker than 6061-T6; do not assume extruded stock is 6061."},
    "ti6al4v": {"id":"ti6al4v","name":"Ti-6Al-4V","group":"Metal","process":"wrought","E":114,"nu":0.34,"sigmaY":880,"sigmaU":950,"pG":900,"Se":510,"rho":4430,"alpha":8.6,"k":6.7,"cp":526,"color":"#c4b59a","tone":"#4c4a42","note":"Grade 5 titanium, annealed. Note the very low thermal conductivity — it is why it machines badly and why heat concentrates at the cutting edge."},
    "chromedsteelrod": {"id":"chromedsteelrod","name":"Hard chromed rod","group":"Metal","process":"wrought","E":200,"nu":0.3,"sigmaY":600,"sigmaU":800,"rho":7850,"alpha":12,"k":50,"cp":470,"color":"#c6ced6","tone":"#3f4a55","note":"Induction-hardened, hard-chrome-plated linear shafting (the usual CK45/C60 substrate). Strength is the substrate's; the plating is thin and hard — clamping on it risks flaking rather than yielding."},
    "fr4": {"id":"fr4","name":"FR-4 PCB (glass-epoxy)","group":"Composite","process":"laminate","E":12,"nu":0.15,"sigmaY":300,"pG":60,"rho":1850,"alpha":14,"k":0.3,"cp":1100,"color":"#3f7a5e","tone":"#2f4a3c","note":"Woven glass/epoxy laminate. E is the THROUGH-THICKNESS value — the direction a bolted joint actually compresses — and is roughly half the in-plane stiffness. σy is an in-plane flexural strength, not a yield point; FR-4 is brittle. The low pG is the number that matters when bolting boards: they crush long before a metal plate would. Through-thickness expansion also runs several times the in-plane α quoted."},
    "pom": {"id":"pom","name":"POM (molded)","group":"Plastic","process":"molded","E":3.1,"nu":0.35,"sigmaY":70,"sigmaU":70,"pG":90,"Es":2.6,"eAllow":0.04,"rho":1410,"alpha":110,"k":0.31,"cp":1470,"color":"#e6e2d8","tone":"#4e4c44","note":"Unfilled homopolymer acetal at 23 °C. Es/eAllow are generic educational snap-fit values, not production allowables. Excellent resilience and low friction; poor adhesive bonding.","aliases":["Delrin (POM)","POM / Delrin","POM (acetal)","POM / Delrin (acetal)"]},
    "pp": {"id":"pp","name":"PP (molded)","group":"Plastic","process":"molded","E":1.5,"nu":0.42,"sigmaY":35,"Es":1.3,"eAllow":0.05,"rho":905,"alpha":100,"k":0.22,"cp":1900,"color":"#d8e0d4","tone":"#464c44","note":"Unfilled homopolymer PP at 23 °C. The classic living-hinge material — it tolerates very high strain in a thin hinge, which is why eAllow is generous. Creeps heavily under sustained load.","aliases":["Polypropylene","PP"]},
    "petg": {"id":"petg","name":"PETG (molded)","group":"Plastic","process":"molded","E":2.1,"nu":0.4,"sigmaY":50,"rho":1270,"alpha":60,"k":0.2,"cp":1200,"color":"#d4dde0","tone":"#31434a","note":"Extruded/molded copolyester at 23 °C. Tough and clear; softens near 70 °C, so keep it out of hot enclosures and cars.","aliases":["PETG"]},
    "abs": {"id":"abs","name":"ABS (molded)","group":"Plastic","process":"molded","E":2.2,"nu":0.35,"sigmaY":45,"pG":55,"Es":2.1,"eAllow":0.03,"rho":1050,"alpha":90,"k":0.17,"cp":1400,"color":"#e0d4cf","tone":"#4c4644","note":"General-purpose molded ABS at 23 °C. Es/eAllow are generic educational snap-fit values, not production allowables.","aliases":["ABS"]},
    "pcabs": {"id":"pcabs","name":"PC-ABS (molded)","group":"Plastic","process":"molded","E":2.4,"nu":0.36,"sigmaY":55,"pG":65,"Es":2.2,"eAllow":0.03,"rho":1130,"alpha":75,"k":0.2,"cp":1300,"color":"#d6d2e0","tone":"#4a4548","note":"Molded polycarbonate/ABS alloy at 23 °C. Properties vary widely with the PC:ABS ratio — treat as indicative and check the specific grade.","aliases":["ABS-PC blend","PC-ABS blend"]},
    "pc": {"id":"pc","name":"PC (molded)","group":"Plastic","process":"molded","E":2.4,"nu":0.37,"sigmaY":62,"Es":2.3,"eAllow":0.04,"rho":1200,"alpha":65,"k":0.2,"cp":1200,"color":"#d2dce0","tone":"#414c52","note":"Unfilled molded polycarbonate at 23 °C. Very tough and ductile, but notch-sensitive and attacked by many solvents — a sharp internal corner or the wrong cleaner turns it brittle.","aliases":["PC","Polycarbonate"]},
    "pa66dry": {"id":"pa66dry","name":"PA66 (molded, dry)","group":"Plastic","process":"molded","E":2.8,"nu":0.39,"sigmaY":80,"pG":70,"Es":2.8,"eAllow":0.04,"rho":1140,"alpha":80,"k":0.25,"cp":1670,"color":"#e0dcc8","tone":"#484c42","note":"Unfilled PA66 dry-as-molded at 23 °C. Nylon absorbs moisture and softens dramatically in service — see the conditioned entry, which is the honest one for most real environments.","aliases":["Nylon 6/6 (PA66, dry)","PA 66 (dry as molded)"]},
    "pa66cond": {"id":"pa66cond","name":"PA66 (molded, conditioned)","group":"Plastic","process":"molded","E":1.2,"nu":0.41,"sigmaY":55,"Es":1.2,"eAllow":0.06,"rho":1140,"alpha":90,"k":0.25,"cp":1670,"color":"#ded9c4","tone":"#464a40","note":"The same PA66 after moisture conditioning at 23 °C / 50% RH — less than half the stiffness, more ductile. Design to this unless the part lives in a sealed dry environment.","aliases":["PA 66 (conditioned)","Nylon 6/6 (PA66, conditioned)"]},
    "pa12gf30": {"id":"pa12gf30","name":"PA12-GF30 (molded)","group":"Plastic","process":"molded","E":6,"nu":0.38,"sigmaY":110,"pG":110,"rho":1230,"alpha":40,"k":0.3,"cp":1500,"color":"#d4d8cc","tone":"#4a4e42","note":"30% glass-filled PA12, molded, at 23 °C. Strongly anisotropic — quoted properties are in the flow direction, and transverse values are much lower. Abrasive to tooling.","aliases":["Nylon 12 GF30 (glass-filled)"]},
    "pbtgf30": {"id":"pbtgf30","name":"PBT-GF30 (molded)","group":"Plastic","process":"molded","E":8,"nu":0.38,"sigmaY":130,"Es":8,"eAllow":0.012,"rho":1520,"alpha":25,"k":0.29,"cp":1300,"color":"#d0d0c8","tone":"#464a44","note":"30% glass PBT, flow direction, 23 °C. Anisotropy is NOT modelled by a single figure. The very low permissible strain is the point: stiff filled plastics make poor snap arms.","aliases":["PBT-GF30"]},
    "pla_fdm": {"id":"pla_fdm","name":"PLA (FDM)","group":"FDM","process":"fdm","E":3.5,"nu":0.36,"sigmaY":50,"pG":55,"creep":0.45,"Es":3.1,"eAllow":0.015,"rho":1240,"alpha":68,"k":0.13,"cp":1800,"color":"#cfe0c8","tone":"#37452f","note":"FDM PLA, in-plane (XY), well-tuned print at 23 °C. Stiff but brittle, softens around 55–60 °C, and creeps badly under sustained load — a poor choice for reusable snaps or bolted joints that must hold torque.","aliases":["PLA (FDM)","PLA (FDM printed)"]},
    "petg_fdm": {"id":"petg_fdm","name":"PETG (FDM)","group":"FDM","process":"fdm","E":2,"nu":0.4,"sigmaY":45,"pG":50,"creep":0.55,"Es":1.9,"eAllow":0.025,"rho":1270,"alpha":60,"k":0.2,"cp":1200,"color":"#cfdde0","tone":"#31434a","note":"FDM PETG, in-plane (XY) at 23 °C. Layer adhesion is the weak point: orient bending in-plane, never across layers.","aliases":["PETG (FDM)","PETG (FDM printed)"]},
    "abs_fdm": {"id":"abs_fdm","name":"ABS (FDM)","group":"FDM","process":"fdm","E":2,"nu":0.35,"sigmaY":40,"pG":46,"creep":0.6,"Es":1.8,"eAllow":0.02,"rho":1040,"alpha":90,"k":0.17,"cp":1400,"color":"#e0d4cf","tone":"#4c4644","note":"FDM ABS, in-plane (XY) at 23 °C. Layer bonds are the weak point — orient bending in-plane and add a generous root fillet. Warps without an enclosure.","aliases":["ABS (FDM)","ABS (FDM printed)"]},
    "asa_fdm": {"id":"asa_fdm","name":"ASA (FDM)","group":"FDM","process":"fdm","E":2,"nu":0.35,"sigmaY":42,"pG":46,"creep":0.6,"rho":1070,"alpha":85,"k":0.17,"cp":1400,"color":"#e0d8cf","tone":"#463f33","note":"FDM ASA, in-plane (XY) at 23 °C. ABS-like mechanically but UV-stable — the outdoor choice."},
    "pcabs_fdm": {"id":"pcabs_fdm","name":"PC-ABS (FDM)","group":"FDM","process":"fdm","E":1.9,"nu":0.36,"sigmaY":41,"pG":48,"creep":0.6,"rho":1130,"alpha":75,"k":0.2,"cp":1300,"color":"#d6d2e0","tone":"#3f3b4d","note":"FDM PC-ABS, in-plane (XY) at 23 °C. Tougher and more heat-tolerant than plain ABS; still needs an enclosure to print well."},
    "pc_fdm": {"id":"pc_fdm","name":"PC (FDM)","group":"FDM","process":"fdm","E":2.2,"nu":0.37,"sigmaY":57,"creep":0.65,"rho":1200,"alpha":65,"k":0.2,"cp":1200,"color":"#d2dce0","tone":"#414c52","note":"FDM polycarbonate, in-plane (XY) at 23 °C. The stiffest common filament with real heat resistance, but hygroscopic and demanding to print — wet filament loses most of its strength.","aliases":["Polycarbonate (FDM)"]},
    "pa12_fdm": {"id":"pa12_fdm","name":"PA12 (FDM)","group":"FDM","process":"fdm","E":1.5,"nu":0.4,"sigmaY":45,"pG":50,"creep":0.55,"rho":1010,"alpha":110,"k":0.25,"cp":1800,"color":"#dee0d2","tone":"#3d4433","note":"FDM nylon 12, in-plane (XY) at 23 °C. Tough and fatigue-tolerant — the best common filament for living hinges — but very hygroscopic: dry it before printing and expect service properties to drift with humidity.","aliases":["Nylon 12 / PA12 (FDM)","Nylon 12 (FDM)"]},
    "pa12cf_fdm": {"id":"pa12cf_fdm","name":"PA12-CF (FDM)","group":"FDM","process":"fdm","E":4,"nu":0.38,"sigmaY":70,"creep":0.65,"rho":1090,"alpha":40,"k":0.3,"cp":1600,"color":"#c4c8cc","tone":"#3a3d40","note":"Chopped-carbon-filled FDM nylon, in-plane (XY) at 23 °C. Much stiffer and more dimensionally stable than unfilled, but the fibres do nothing for layer adhesion — Z strength stays poor. Abrasive: needs a hardened nozzle.","aliases":["Nylon 12 CF (FDM)"]},
    "pp_fdm": {"id":"pp_fdm","name":"PP (FDM)","group":"FDM","process":"fdm","E":1.3,"nu":0.42,"sigmaY":28,"creep":0.5,"rho":900,"alpha":100,"k":0.22,"cp":1900,"color":"#d8e0d4","tone":"#464c44","note":"FDM polypropylene, in-plane (XY) at 23 °C. Chemically resistant and fatigue-tolerant, but warps badly and bonds to almost no bed surface except PP tape."},
    "pa12_mjf": {"id":"pa12_mjf","name":"PA12 (MJF)","group":"Powder-bed","process":"mjf","E":1.7,"nu":0.4,"sigmaY":48,"pG":50,"creep":0.55,"Es":1.7,"eAllow":0.04,"rho":1010,"alpha":110,"k":0.25,"cp":1800,"color":"#dee0d2","tone":"#40462f","note":"HP Multi Jet Fusion nylon 12, XY plane, 23 °C. Near-isotropic for a printed part but verify with printed coupons. pG is the conservative figure the bolted-joint calculator has always used; the clamp calculator previously assumed 55 MPa.","aliases":["PA12 (MJF)","Nylon 12 (MJF)","Nylon 12 (PA12)","PA12 (MJF printed)"]},
    "pa11_mjf": {"id":"pa11_mjf","name":"PA11 (MJF)","group":"Powder-bed","process":"mjf","E":1.6,"nu":0.4,"sigmaY":48,"creep":0.55,"rho":1020,"alpha":110,"k":0.25,"cp":1800,"color":"#dee0d2","tone":"#40462f","note":"MJF nylon 11, XY plane, 23 °C. Similar stiffness to PA12 but notably more ductile and impact-tolerant — the better choice for snap features and drop loads."},
    "pa12gb_mjf": {"id":"pa12gb_mjf","name":"PA12-GB (MJF)","group":"Powder-bed","process":"mjf","E":2.6,"nu":0.39,"sigmaY":44,"creep":0.6,"rho":1230,"alpha":70,"k":0.3,"cp":1600,"color":"#d0d4cc","tone":"#43483a","note":"Glass-bead-filled MJF nylon 12, XY plane, 23 °C. Stiffer and more dimensionally stable than unfilled, but the beads reduce elongation — stiffer does not mean stronger here.","aliases":["PA12 GB (MJF, glass-filled)"]},
    "pa12_sls": {"id":"pa12_sls","name":"PA12 (SLS)","group":"Powder-bed","process":"sls","E":1.65,"nu":0.4,"sigmaY":48,"pG":50,"creep":0.55,"rho":1000,"alpha":110,"k":0.25,"cp":1800,"color":"#dee0d2","tone":"#40462f","note":"Laser-sintered nylon 12 (PA12 = polyamide 12 = nylon 12), XY plane, 23 °C. Practically interchangeable with MJF PA12 for design-check purposes — the 1.65 vs 1.70 GPa difference is well inside process scatter, so do not read it as SLS being softer. Surface finish and powder refresh ratio drive the real variation. pG carried over from MJF PA12: same polymer, same order of surface porosity."},
    "tpu95a_fdm": {"id":"tpu95a_fdm","name":"TPU 95A (FDM)","group":"Elastomer","process":"fdm","E":0.04,"nu":0.48,"sigmaY":9,"rho":1200,"alpha":150,"k":0.2,"cp":1800,"color":"#e0d2da","tone":"#4a3f46","note":"FDM TPU, 95 Shore A, in-plane at 23 °C. The linear modulus quoted is a small-strain tangent only — TPU stiffens dramatically at high strain, so a linear model under-predicts force badly past a few percent."},
    "tpu85a_fdm": {"id":"tpu85a_fdm","name":"TPU 85A (FDM)","group":"Elastomer","process":"fdm","E":0.012,"nu":0.48,"sigmaY":5,"rho":1180,"alpha":160,"k":0.2,"cp":1800,"color":"#e0d2da","tone":"#4a3f46","note":"FDM TPU, 85 Shore A, in-plane at 23 °C. Same small-strain caveat as the 95A grade, more so.","aliases":["TPU 85A (FDM, softer)"]},
    "tpe_fdm": {"id":"tpe_fdm","name":"TPE (FDM)","group":"Elastomer","process":"fdm","E":0.01,"nu":0.48,"sigmaY":4,"rho":1150,"alpha":160,"k":0.2,"cp":1800,"color":"#e0d2da","tone":"#4a3f46","note":"Soft FDM thermoplastic elastomer, in-plane at 23 °C. Indicative small-strain figures for feel only — grades vary enormously.","aliases":["TPE (FDM, soft rubber)"]},
    "tpu_mjf": {"id":"tpu_mjf","name":"TPU/TPA (MJF)","group":"Elastomer","process":"mjf","E":0.08,"nu":0.48,"sigmaY":8,"rho":1100,"alpha":150,"k":0.2,"cp":1800,"color":"#e0d2da","tone":"#4a3f46","note":"Powder-bed rubber-like nylon elastomer, XY plane at 23 °C. Stiffer than filament TPU and near-isotropic; same hyperelastic caveat applies.","aliases":["TPU/TPA (MJF, rubber-like)"]},
  };

  function material(id) {
    var m = MATERIALS[id];
    if (!m) throw new Error('Unknown material id "' + id + '". See src/materials/library.ts.');
    return m;
  }

  function requireProps(m, keys, usedBy) {
    var missing = keys.filter(function (k) {
      return m[k] === undefined || m[k] === null;
    });
    if (missing.length) {
      throw new Error(
        'Material "' + m.id + '" (' + m.name + ') is missing ' + missing.join(", ") +
          ", required by " + usedBy + ". Source the value into src/materials/library.ts " +
          "or drop the material from that menu — do not substitute a placeholder.",
      );
    }
    return m;
  }

  var PRINTED = { fdm: 1, mjf: 1, sls: 1 };

  root.MECHMAT = {
    MATERIALS: MATERIALS,
    material: material,
    requireProps: requireProps,
    /** Young's modulus in MPa — the unit most of the engines work in. */
    E_MPa: function (id) {
      return material(id).E * 1000;
    },
    /** Secant modulus in MPa, or null when the library has no figure. */
    Es_MPa: function (id) {
      var Es = material(id).Es;
      return Es === undefined ? null : Es * 1000;
    },
    /** True for printed stock, whose quoted properties are in-plane (XY). */
    isPrinted: function (id) {
      return !!PRINTED[material(id).process];
    },
    /**
     * Build a table keyed by the label a picker shows.
     * menu([["Mild steel (S235)", "s235"]], function (m) { ... })
     */
    menu: function (entries, project) {
      var out = {};
      entries.forEach(function (e) {
        out[e[0]] = project(material(e[1]), e[0]);
      });
      return out;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
