import type { Capability } from "@/types/observatory";

export function isSddCapability(cap: Capability): boolean {
  return cap.sdd?.enabled === true;
}

/** `specs/<name>` → feature 目录名 `name` */
export function sddFeatureDirName(cap: Capability): string | null {
  const p = cap.sdd?.workspacePath;
  if (typeof p !== "string" || !p.startsWith("specs/")) return null;
  const rest = p.replace(/^specs\//, "").replace(/\/+$/, "");
  return rest.length > 0 ? rest : null;
}
