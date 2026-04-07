/**
 * 能力阶段：根据 AI 会话、测试结果、Git 提交推断并写回 capabilities.json。
 * primary_doc: docs/ARCHITECTURE.md, docs/SCHEMA_SPEC.md §四
 */
import type { ObservatoryStore } from "../observatory/store";
import type { Capabilities, TestResults } from "../observatory/types";

/** 与看板顺序一致（自动推断会用到） */
export const PHASE_RANK: Record<string, number> = {
  planning: 0,
  designing: 1,
  developing: 2,
  testing: 3,
  completed: 4,
  released: 5,
  deprecated: 6,
};

function rankOf(phase: string | undefined): number {
  if (!phase) return 0;
  return PHASE_RANK[phase] ?? 0;
}

/** 从 AI 对话文本推断「至少」处于哪一阶段 */
export function inferPhaseFromAiText(text: string): string | null {
  const t = text.toLowerCase();

  const designHints =
    /(设计|方案|讨论|评审|rfc|架构图|接口设计|时序|wireframe|design doc|architecture discussion|brainstorm)/i;
  const devHints =
    /(实现|开发|编码|重构|修改代码|strreplace|apply_patch|implement|refactor|feature|bugfix|新增功能|优化)/i;
  const testHints =
    /(测试|单测|集成测|pytest|jest|assert|覆盖率|test case|跑测)/i;

  if (testHints.test(t)) return "testing";
  if (devHints.test(t)) return "developing";
  if (designHints.test(t)) return "designing";
  return null;
}

export function mergeCapabilityPhase(
  current: string | undefined,
  inferred: string | null
): string | null {
  if (!inferred) return null;
  const a = rankOf(current);
  const b = rankOf(inferred);
  return b > a ? inferred : null;
}

/** 提交信息中显式声明要标记为已发布的能力 ID（独立一行，避免误匹配）。 */
export function parseCapabilityIdsFromCommitMessage(message: string): string[] {
  const out = new Set<string>();
  for (const line of message.split(/\r?\n/)) {
    const m = line.match(
      /^(?:Observatory|obs-cap|observatory-cap|能力)[:：]\s*(.+)$/i
    );
    if (m?.[1]) {
      for (const part of m[1].split(/[,，;；\s]+/)) {
        const id = part.trim();
        if (id) out.add(id);
      }
    }
  }
  return [...out];
}

export async function applyPhaseInferenceFromAiTranscript(
  store: ObservatoryStore,
  capabilityIds: string[],
  combinedText: string,
  enabled: boolean
): Promise<void> {
  if (!enabled || capabilityIds.length === 0) return;
  const inferred = inferPhaseFromAiText(combinedText);
  if (!inferred) return;

  const doc = await store.readJsonIfExists<Capabilities>("capabilities.json");
  if (!doc?.capabilities?.length) return;

  const list = doc.capabilities as Array<Record<string, unknown>>;
  let changed = false;
  const now = new Date().toISOString();
  for (const id of capabilityIds) {
    const row = list.find((c) => c.id === id);
    if (!row) continue;
    const sdd = row.sdd as { enabled?: boolean } | undefined;
    if (sdd?.enabled === true) continue;
    const next = mergeCapabilityPhase(String(row.phase ?? "planning"), inferred);
    if (next) {
      row.phase = next;
      row.updated_at = now;
      changed = true;
    }
  }
  if (changed) {
    doc.generated_at = now;
    await store.writeCapabilities(doc);
  }
}

export async function applyReleasedFromCommitMessage(
  store: ObservatoryStore,
  commitMessage: string
): Promise<string[]> {
  const ids = parseCapabilityIdsFromCommitMessage(commitMessage);
  if (ids.length === 0) return [];

  const doc = await store.readJsonIfExists<Capabilities>("capabilities.json");
  if (!doc?.capabilities?.length) return ids;

  const list = doc.capabilities as Array<Record<string, unknown>>;
  const now = new Date().toISOString();
  let changed = false;
  for (const id of ids) {
    const row = list.find((c) => c.id === id);
    if (row) {
      row.phase = "released";
      row.updated_at = now;
      changed = true;
    }
  }
  if (changed) {
    doc.generated_at = now;
    await store.writeCapabilities(doc);
  }
  return ids;
}

export async function applyCompletedFromTestResults(
  store: ObservatoryStore,
  testResults: TestResults,
  options?: { allowSddCompleted?: boolean }
): Promise<void> {
  const allowSdd = options?.allowSddCompleted ?? false;

  const by = testResults.by_capability as
    | Record<string, { passed?: number; failed?: number }>
    | undefined;
  if (!by || typeof by !== "object") return;

  const doc = await store.readJsonIfExists<Capabilities>("capabilities.json");
  if (!doc?.capabilities?.length) return;

  const list = doc.capabilities as Array<Record<string, unknown>>;
  const now = new Date().toISOString();
  let changed = false;
  for (const row of list) {
    const id = row.id as string | undefined;
    if (!id || String(row.phase) !== "testing") continue;
    const sdd = row.sdd as { enabled?: boolean } | undefined;
    if (sdd?.enabled === true && !allowSdd) continue;
    const st = by[id];
    if (!st) continue;
    const failed = Number(st.failed ?? 0);
    const passed = Number(st.passed ?? 0);
    if (failed === 0 && passed > 0) {
      row.phase = "completed";
      row.updated_at = now;
      changed = true;
    }
  }
  if (changed) {
    doc.generated_at = now;
    await store.writeCapabilities(doc);
  }
}
