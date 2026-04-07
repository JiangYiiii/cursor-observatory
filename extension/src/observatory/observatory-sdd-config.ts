/**
 * 读写 `observatory-sdd.json`：优先 `specs/<f>/observatory/`，兼容旧路径 `specs/<f>/observatory-sdd.json`。
 */
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
  legacyObservatorySddJsonAbs,
  observatorySddJsonAbs,
} from "./sdd-test-paths";

export async function readObservatorySddConfigMerged(
  workspaceRoot: string,
  feature: string
): Promise<Record<string, unknown>> {
  const paths = [
    observatorySddJsonAbs(workspaceRoot, feature),
    legacyObservatorySddJsonAbs(workspaceRoot, feature),
  ];
  for (const fp of paths) {
    try {
      const t = await fsp.readFile(fp, "utf8");
      const j = JSON.parse(t) as Record<string, unknown>;
      if (j && typeof j === "object" && !Array.isArray(j)) return j;
    } catch {
      /* */
    }
  }
  return {};
}

export async function writeObservatorySddConfigMerged(
  workspaceRoot: string,
  feature: string,
  nextFull: Record<string, unknown>
): Promise<void> {
  const fp = observatorySddJsonAbs(workspaceRoot, feature);
  await fsp.mkdir(path.dirname(fp), { recursive: true });
  await fsp.writeFile(fp, JSON.stringify(nextFull, null, 2), "utf8");
}
