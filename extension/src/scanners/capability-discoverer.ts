/**
 * Class / module-based capability discovery when ai-doc-index is absent.
 * primary_doc: docs/ARCHITECTURE.md §3.4, docs/EXTENSION_DESIGN.md §4.4
 */
import type { Architecture } from "../observatory/types";

const EXCLUDE = [
  /Utils$/i,
  /Helper$/i,
  /Mixin$/i,
  /^Base[A-Z]/,
  /^Abstract[A-Z]/,
  /Config$/i,
  /Constants$/i,
  /Exception$/i,
  /^Test/,
];

export interface AutoCapability {
  id: string;
  title: string;
  confidence: "auto";
  source_module: string;
  phase: "planning";
  progress: number;
}

export function discoverCapabilitiesFromArchitecture(
  arch: Architecture
): AutoCapability[] {
  const mods = Array.isArray(arch.modules) ? arch.modules : [];
  const out: AutoCapability[] = [];
  for (const m of mods) {
    const mod = m as {
      id?: string;
      name?: string;
      path?: string;
    };
    const id = mod.id ?? mod.name;
    if (!id || id === "__root__") continue;
    const capId = id.toUpperCase().replace(/-/g, ".").replace(/_/g, ".");
    out.push({
      id: capId.includes(".") ? capId : `${capId}.MODULE`,
      title: id.replace(/_/g, " "),
      confidence: "auto",
      source_module: id,
      phase: "planning",
      progress: 0,
    });
  }
  return out;
}

export function isUtilityName(name: string): boolean {
  return EXCLUDE.some((p) => p.test(name));
}
