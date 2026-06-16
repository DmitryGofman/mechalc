import type { SavedCalculation } from "../engine/types";

const KEY = "mechalc.recent.v1";
const LIMIT = 100;

function read(): SavedCalculation[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedCalculation[]) : [];
  } catch {
    return [];
  }
}

function write(list: SavedCalculation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT)));
  } catch {
    // storage full / unavailable — ignore for MVP
  }
}

export const recentStore = {
  list(): SavedCalculation[] {
    return read();
  },
  get(id: string): SavedCalculation | undefined {
    return read().find((c) => c.id === id);
  },
  save(calc: SavedCalculation): void {
    const list = read().filter((c) => c.id !== calc.id);
    list.unshift(calc);
    write(list);
  },
  delete(id: string): void {
    write(read().filter((c) => c.id !== id));
  },
  duplicate(id: string): SavedCalculation | undefined {
    const original = read().find((c) => c.id === id);
    if (!original) return undefined;
    const copy: SavedCalculation = {
      ...original,
      id: newId(),
      createdAt: new Date().toISOString(),
    };
    this.save(copy);
    return copy;
  },
  clear(): void {
    write([]);
  },
};

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
