import type { FormulaDef } from "../engine/types";
import { gLoad } from "./gLoad";
import { axialStress } from "./axialStress";
import { shearSingle, shearDouble } from "./shearStress";
import { bendingCantilever, bendingSimplySupported } from "./bendingStress";
import { torsionStress } from "./torsionStress";
import { vonMises } from "./vonMises";
import { beamDeflection } from "./beamDeflection";
import { sectionRectangle, sectionRound, sectionTube } from "./sectionProperties";

export const FORMULAS: FormulaDef[] = [
  gLoad,
  axialStress,
  shearSingle,
  shearDouble,
  bendingCantilever,
  bendingSimplySupported,
  torsionStress,
  vonMises,
  beamDeflection,
  sectionRectangle,
  sectionRound,
  sectionTube,
];

export const FORMULA_BY_ID: Record<string, FormulaDef> = Object.fromEntries(
  FORMULAS.map((f) => [f.id, f]),
);

export const CATEGORIES: string[] = [...new Set(FORMULAS.map((f) => f.category))];

export function searchFormulas(query: string): FormulaDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return FORMULAS;
  return FORMULAS.filter((f) => {
    const hay = [f.name, f.category, f.equation, ...f.synonyms, ...f.inputs.map((i) => i.symbol)]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
