/**
 * 探测工作区 SDD 状态（docs/SDD_INTEGRATION_DESIGN §7.4）。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { SddDetectionResult, SddIntegrationStatus } from "./types";

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function countSddFeatures(specsRoot: string): Promise<number> {
  let n = 0;
  let entries;
  try {
    entries = await fs.readdir(specsRoot, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    const dir = path.join(specsRoot, e.name);
    const hasSpec = await pathExists(path.join(dir, "spec.md"));
    const hasSketch = await pathExists(path.join(dir, "sketch.md"));
    if (hasSpec || hasSketch) n += 1;
  }
  return n;
}

async function globRulesHasSdd(rulesDir: string): Promise<boolean> {
  try {
    const files = await fs.readdir(rulesDir);
    return files.some(
      (f) =>
        /sdd/i.test(f) ||
        /specify/i.test(f) ||
        f === "sdd-integration.mdc"
    );
  } catch {
    return false;
  }
}

export async function detectSddStatus(
  workspaceRoot: string
): Promise<SddDetectionResult> {
  const specsRoot = path.join(workspaceRoot, "specs");
  const hasSpecsDir = await pathExists(specsRoot);
  const featureCount = hasSpecsDir ? await countSddFeatures(specsRoot) : 0;

  const rulesDir = path.join(workspaceRoot, ".cursor", "rules");
  const hasSddRules = await globRulesHasSdd(rulesDir);

  const pluginSdd = path.join(
    os.homedir(),
    ".cursor",
    "plugins",
    "cache",
    "context-hub",
    "sdd"
  );
  const hasSddPluginCache = await pathExists(pluginSdd);

  let status: SddIntegrationStatus;
  if (featureCount > 0 && (hasSddRules || hasSddPluginCache)) {
    status = "full";
  } else if (featureCount > 0 || hasSddRules || hasSddPluginCache) {
    status = "partial";
  } else {
    status = "none";
  }

  return {
    status,
    hasSpecsDir,
    featureCount,
    hasSddRules,
    hasSddPluginCache,
  };
}
