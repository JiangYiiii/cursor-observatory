/**
 * specs/<feature>/.capability-id — 稳定 Capability.id（docs/SDD_INTEGRATION_DESIGN §3.3）。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

export function slugifyFeatureName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "feature";
}

export function ensureUniqueCapabilityId(
  candidate: string,
  used: Set<string>
): string {
  if (!used.has(candidate)) return candidate;
  let n = 2;
  while (used.has(`${candidate}-${n}`)) n += 1;
  return `${candidate}-${n}`;
}

function getWorkspacePathSpec(featureDirName: string): string {
  return `specs/${featureDirName}`;
}

export async function readOrCreateCapabilityId(
  featureDir: string,
  featureDirName: string,
  usedIds: Set<string>,
  previousCapabilities: Array<Record<string, unknown>> | undefined
): Promise<string> {
  const idFile = path.join(featureDir, ".capability-id");
  const workspacePath = getWorkspacePathSpec(featureDirName);

  try {
    const raw = await fs.readFile(idFile, "utf8");
    const id = raw.trim();
    if (id.length > 0) {
      usedIds.add(id);
      return id;
    }
  } catch {
    /* missing */
  }

  if (previousCapabilities?.length) {
    for (const row of previousCapabilities) {
      const sdd = row.sdd as { workspacePath?: string } | undefined;
      if (sdd?.workspacePath === workspacePath && typeof row.id === "string") {
        const id = row.id;
        await fs.writeFile(idFile, `${id}\n`, "utf8");
        usedIds.add(id);
        return id;
      }
    }
  }

  const base = `sdd:${slugifyFeatureName(featureDirName)}`;
  const id = ensureUniqueCapabilityId(base, usedIds);
  usedIds.add(id);
  await fs.writeFile(idFile, `${id}\n`, "utf8");
  return id;
}
