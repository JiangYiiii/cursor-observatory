/**
 * 需求列表：过滤、排序、测试聚合、相关活动、推进步骤判断。
 */
import { getCapabilityUpdatedMs, normalizePhase } from "@/lib/kanban-utils";
import {
  getByCapabilityStats,
  getScenarioCounts,
} from "@/lib/quality-aggregates";
import type {
  AiSession,
  Capability,
  CapabilityPhase,
  Progress,
  TestExpectations,
  TestResults,
} from "@/types/observatory";

const DONE_PHASES = new Set<CapabilityPhase>([
  "completed",
  "released",
  "deprecated",
]);

export function filterRequirements(
  capabilities: Capability[],
  hideCompleted: boolean
): Capability[] {
  if (!hideCompleted) return [...capabilities];
  return capabilities.filter((c) => !DONE_PHASES.has(normalizePhase(c.phase)));
}

/** 与 Git 作者名比较：trim + 大小写不敏感 */
export function specAuthorsMatch(a: string | undefined, b: string | undefined): boolean {
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export const CURRENT_SPEC_AUTHOR_STORAGE_KEY =
  "observatory.capabilities.currentSpecAuthor";

export function sortByUpdatedDesc(capabilities: Capability[]): Capability[] {
  return [...capabilities].sort((a, b) => {
    const tb = getCapabilityUpdatedMs(b);
    const ta = getCapabilityUpdatedMs(a);
    if (tb !== ta) return tb - ta;
    return String(a.title ?? a.id).localeCompare(String(b.title ?? b.id), "zh-CN");
  });
}

export function getTestStatsForCapability(
  capId: string,
  testResults: TestResults | null,
  testExpectations: TestExpectations | null
): {
  total: number;
  passed: number;
  failed: number;
  scenarioExpected: number;
  scenarioCovered: number;
} {
  const t = getByCapabilityStats(capId, testResults);
  const s = getScenarioCounts(capId, testExpectations);
  return {
    total: t.total,
    passed: t.passed,
    failed: t.failed,
    scenarioExpected: s.expected,
    scenarioCovered: s.covered,
  };
}

export type RelatedActivityItem =
  | {
      kind: "session";
      id: string;
      title: string;
      timestamp: string;
      subtitle?: string;
    }
  | {
      kind: "commit";
      id: string;
      title: string;
      timestamp: string;
      subtitle?: string;
    };

export function getRelatedActivities(
  capId: string,
  progress: Progress | null,
  sessions: AiSession[],
  limit = 5
): RelatedActivityItem[] {
  const capFilter = (ids: string[] | undefined) =>
    (ids ?? []).includes(capId);

  const timelineItems: RelatedActivityItem[] = (
    progress?.timeline ?? []
  )
    .filter((e) => capFilter(e.capability_ids as string[] | undefined))
    .map((e) => ({
      kind: "commit" as const,
      id: `tl-${e.id}`,
      title: String(e.title ?? e.type ?? "事件"),
      timestamp: String(e.timestamp ?? ""),
      subtitle: e.commit?.hash
        ? String(e.commit.hash).slice(0, 7)
        : undefined,
    }));

  const sessionItems: RelatedActivityItem[] = sessions
    .filter((s) => capFilter(s.capability_ids as string[] | undefined))
    .map((s) => ({
      kind: "session" as const,
      id: s.id,
      title: String(s.title ?? s.id),
      timestamp: String(s.started_at ?? s.ended_at ?? ""),
      subtitle: s.status ? String(s.status) : undefined,
    }));

  const merged = [...timelineItems, ...sessionItems].filter((x) => x.timestamp);
  merged.sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return merged.slice(0, limit);
}

/** 推进需求：根据当前产物与阶段选择下一步 Prompt 类型 */
export type AdvanceKind =
  | "specify"
  | "plan"
  | "tasks"
  | "implement"
  | "test"
  | "release";

/** 英文/中文逗号分隔的服务名列表 */
/** 需求链接是否指向 TAPD（用于展示 MCP 拉取提示） */
export function isTapdRequirementUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.includes("tapd.cn") || u.includes("tapd.com");
}

export function splitCommaServiceList(s: string | undefined): string[] {
  if (s == null || !String(s).trim()) return [];
  return String(s)
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 部署卡片展示用：影响分析中的应用名 ∪ 需求级手工列表 ∪ 扩展默认列表。
 */
export function mergeDeployServiceDisplayLine(
  impactAppNames: string[] | undefined,
  manual: string | undefined,
  extensionDefault: string | undefined
): string {
  const fromImpact = (impactAppNames ?? []).filter(Boolean);
  const manualParts = splitCommaServiceList(manual);
  const extParts = splitCommaServiceList(extensionDefault);
  if (fromImpact.length > 0) {
    return [...new Set([...fromImpact, ...manualParts, ...extParts])].join(
      ", "
    );
  }
  const merged = [...new Set([...manualParts, ...extParts])];
  return merged.length > 0 ? merged.join(", ") : "—";
}

export function resolveAdvanceKind(cap: Capability): AdvanceKind {
  const sdd = cap.sdd;
  const phase = normalizePhase(cap.phase);

  if (!sdd?.enabled) {
    if (phase === "completed" || phase === "released") return "release";
    return "implement";
  }

  // 扫描数据或旧版 capabilities.json 可能仅有 enabled 而无 documents —— 须容错，否则详情页 render 抛错白屏
  const d = sdd.documents;
  const hasEntry = Boolean(d?.spec || d?.sketch);
  if (!hasEntry) return "specify";

  const hasPlan = Boolean(d?.plan);
  const hasTasks = Boolean(d?.tasks);
  if (!hasPlan) return "plan";
  if (!hasTasks) return "tasks";

  const ts = sdd.taskStats;
  if (ts && ts.total > 0 && ts.completed < ts.total) return "implement";

  if (phase === "completed" || phase === "released") return "release";
  if (phase === "testing" || (ts && ts.total > 0 && ts.completed >= ts.total)) {
    return "test";
  }

  return "test";
}
