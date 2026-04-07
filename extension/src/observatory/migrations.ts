/**
 * Schema major migrations (per docs/SCHEMA_SPEC.md §1.5).
 * primary_doc: docs/SCHEMA_SPEC.md
 */

export type MigrationKey = string;

/** filename (e.g. capabilities.json) + major bump */
export type Migrator = (data: Record<string, unknown>) => Record<string, unknown>;

/** Registry: key `${baseName}:${fromMajor}→${toMajor}` */
export const MIGRATIONS: Record<string, Migrator> = {
  // Example from spec (placeholder — extend when schema majors diverge):
  // "capabilities:1→2": (data) => { ...; data.schema_version = "2.0.0"; return data; },
};

export function parseMajorVersion(schemaVersion: unknown): number {
  if (typeof schemaVersion !== "string" || schemaVersion.length === 0) {
    return 1;
  }
  const m = /^(\d+)/.exec(schemaVersion);
  return m ? parseInt(m[1], 10) : 1;
}

export function targetMajorFromExtension(): number {
  return 1;
}

/**
 * If data major < target major, run migrator or return null (caller: rebuild).
 */
export function migrateIfNeeded(
  relativePath: string,
  data: Record<string, unknown>,
  targetMajor: number = targetMajorFromExtension()
): Record<string, unknown> | null {
  const normalized = relativePath.replace(/\\/g, "/");
  const currentMajor = parseMajorVersion(data.schema_version);
  if (currentMajor === targetMajor) return data;
  if (currentMajor > targetMajor) {
    throw new Error(
      `Data version newer than Extension for ${normalized}: ${String(
        data.schema_version
      )}`
    );
  }
  const base = normalized.replace(/\.json$/, "").replace(/\//g, ".");
  const key = `${base}:${currentMajor}→${targetMajor}` as MigrationKey;
  const migrator = MIGRATIONS[key];
  if (!migrator) return null;
  return migrator({ ...data });
}
