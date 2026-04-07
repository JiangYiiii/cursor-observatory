/**
 * 概览页聚合：阶段分布、会话统计、待关注项。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.1
 */
import type { AiSession, Capability, DocsHealth } from "@/types/observatory";

/** 卡片用大号数字展示时的相对时间 */
export function formatRelativeZh(iso: string | undefined | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  return `${d} 天前`;
}

export const PHASE_ORDER: Capability["phase"][] = [
  "planning",
  "designing",
  "developing",
  "testing",
  "released",
  "deprecated",
];

export const PHASE_LABEL: Record<string, string> = {
  planning: "规划中",
  designing: "设计中",
  developing: "开发中",
  testing: "测试中",
  released: "已发布",
  deprecated: "已废弃",
  _other: "未分类",
};

/** 固定顺序，含 0，便于柱状图对齐 */
export function phaseRowsForChart(
  capabilities: Capability[]
): { key: string; label: string; count: number }[] {
  const map = new Map<string, number>();
  for (const c of capabilities) {
    const p =
      c.phase && typeof c.phase === "string" ? c.phase : "_other";
    map.set(p, (map.get(p) ?? 0) + 1);
  }
  const rows: { key: string; label: string; count: number }[] = [];
  for (const k of PHASE_ORDER) {
    rows.push({
      key: k,
      label: PHASE_LABEL[k] ?? k,
      count: map.get(k) ?? 0,
    });
  }
  const other = map.get("_other") ?? 0;
  if (other > 0) {
    rows.push({ key: "_other", label: PHASE_LABEL._other, count: other });
  }
  return rows;
}

/** 用于卡片副标题：进行中 ≈ 非 released/deprecated */
export function summarizePhaseProgress(capabilities: Capability[]): {
  done: number;
  inProgress: number;
  atRisk: number;
} {
  let done = 0;
  let inProgress = 0;
  let atRisk = 0;
  for (const c of capabilities) {
    const p = c.phase;
    if (p === "released") done += 1;
    else if (p === "deprecated") {
      /* skip */
    } else {
      inProgress += 1;
      const ts = c.test_summary as
        | { status?: string; failed?: number }
        | undefined;
      if (ts?.status === "failing" || (ts?.failed ?? 0) > 0) atRisk += 1;
    }
  }
  return { done, inProgress, atRisk };
}

export function countSessionsInRange(
  sessions: AiSession[],
  ms: number
): number {
  const cutoff = Date.now() - ms;
  return sessions.filter((s) => {
    const raw = s.started_at;
    if (!raw) return false;
    const t = new Date(String(raw)).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
}

export type AttentionSeverity = "warning" | "info";

export type AttentionItem = { text: string; severity: AttentionSeverity };

export function buildAttentionItems(input: {
  capabilities: Capability[];
  docsHealth: DocsHealth | null;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const { capabilities, docsHealth } = input;

  let noTests = 0;
  for (const c of capabilities) {
    const ts = c.test_summary as { total?: number } | undefined;
    const t = ts?.total;
    if (t === undefined || t === 0) noTests += 1;
  }
  if (noTests > 0) {
    items.push({
      severity: "warning",
      text: `${noTests} 个能力尚无测试记录或测试数为 0`,
    });
  }

  const checks = Array.isArray(docsHealth?.checks)
    ? docsHealth!.checks
    : [];
  for (const raw of checks) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const score = typeof row.score === "number" ? row.score : 100;
    const desc =
      typeof row.description === "string"
        ? row.description
        : String(row.check ?? "检查项");
    if (score < 70) {
      items.push({
        severity: "warning",
        text: `${desc}（得分 ${score}）`,
      });
    }
  }

  const docMissing = checks.find(
    (c) =>
      c &&
      typeof c === "object" &&
      (c as Record<string, unknown>).check === "business_doc_id_coverage"
  ) as Record<string, unknown> | undefined;
  const details = docMissing?.details as
    | { missing?: string[] }
    | undefined;
  if (details?.missing && details.missing.length > 0) {
    const sample = details.missing.slice(0, 3).join("、");
    items.push({
      severity: "info",
      text: `以下模块缺少 business_doc_id 标注：${sample}${
        details.missing.length > 3 ? "…" : ""
      }`,
    });
  }

  return items.slice(0, 8);
}
