/**
 * 从 agent transcript 文本中提取能力 ID、工作区相对路径等（供 TranscriptWatcher）。
 * primary_doc: docs/SCHEMA_SPEC.md §十二, §十二-B, docs/EXTENSION_DESIGN.md §3.3
 */
import * as path from "node:path";
import type { ObservatoryStore } from "../observatory/store";

const FILE_EXT_RE =
  /\.(?:py|ts|tsx|js|jsx|mjs|cjs|md|mdx|json|sql|yaml|yml|toml|rs|go|java|kt|swift)$/i;

/** 自 capabilities.json 读取能力 ID 列表（长 ID 优先用于子串去重）。 */
export async function loadCapabilityIdsFromStore(
  store: ObservatoryStore
): Promise<string[]> {
  const doc = await store.readJsonIfExists<{
    capabilities?: Array<{ id?: string }>;
  }>("capabilities.json");
  const ids = (doc?.capabilities ?? [])
    .map((c) => c.id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set(ids)].sort((a, b) => b.length - a.length);
}

/**
 * 在全文检索已知能力 ID；若较长 ID 已命中，则跳过被其包含的较短 ID。
 */
export function extractCapabilityIds(
  text: string,
  knownIds: string[]
): string[] {
  const sorted = [...new Set(knownIds)].sort((a, b) => b.length - a.length);
  const picked: string[] = [];
  for (const id of sorted) {
    if (!text.includes(id)) continue;
    if (picked.some((p) => p.includes(id))) continue;
    picked.push(id);
  }
  return picked;
}

/**
 * 从对话拼接文本中提取疑似工作区相对路径（启发式，可误报）。
 */
export function extractWorkspaceRelativePaths(
  combinedText: string,
  workspaceRoot: string
): string[] {
  const seen = new Set<string>();
  const re =
    /([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z0-9]+)/g;
  let m: RegExpExecArray | null;
  const normRoot = path.normalize(workspaceRoot);
  while ((m = re.exec(combinedText)) !== null) {
    let rel = m[1];
    if (!rel || rel.includes("..")) continue;
    if (rel.startsWith("/") || /^[A-Za-z]:[\\/]/.test(rel)) continue;
    if (!FILE_EXT_RE.test(rel)) continue;
    const abs = path.normalize(path.join(normRoot, rel));
    if (!abs.startsWith(normRoot + path.sep) && abs !== normRoot) continue;
    rel = path.relative(normRoot, abs).split(path.sep).join("/");
    if (rel && !rel.startsWith("..")) seen.add(rel);
  }
  return [...seen].sort();
}

/** 统计疑似工具调用行（格式差异大，仅作启发式）。 */
export function countLikelyToolCalls(rawLines: Record<string, unknown>[]): number {
  let n = 0;
  for (const raw of rawLines) {
    const t = String(raw.type ?? "").toLowerCase();
    if (t.includes("tool")) {
      n += 1;
      continue;
    }
    if (raw.toolCalls != null || raw.tool_calls != null) {
      n += 1;
      continue;
    }
    const p = raw.payload;
    if (p && typeof p === "object") {
      const po = p as Record<string, unknown>;
      if (
        po.toolInvocation != null ||
        po.toolCallId != null ||
        po.toolName != null
      ) {
        n += 1;
        continue;
      }
    }
    const name = String(raw.name ?? "");
    if (name.toLowerCase().includes("tool")) n += 1;
  }
  return n;
}

export function isoRangeFromEntries(
  entries: Array<{ timestamp: string | null }>,
  fallback: () => string
): { first: string; last: string } {
  const valid: number[] = [];
  for (const e of entries) {
    if (!e.timestamp) continue;
    const t = Date.parse(e.timestamp);
    if (!Number.isNaN(t)) valid.push(t);
  }
  if (valid.length === 0) {
    const now = fallback();
    return { first: now, last: now };
  }
  valid.sort((a, b) => a - b);
  return {
    first: new Date(valid[0]).toISOString(),
    last: new Date(valid[valid.length - 1]).toISOString(),
  };
}
