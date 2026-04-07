/**
 * 读取 SDD feature 目录下的 observatory-sdd.json 与 plan/tasks 约定。
 * - skipTestingAfterTasks：任务完成后是否跳过「测试中」
 * - declaredPhase：显式声明能力阶段（全量扫描优先于产物推断）
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  legacyObservatorySddJsonAbs,
  observatorySddJsonAbs,
  resolveSddObservatorySubdirNameSync,
} from "../../observatory/sdd-test-paths";

const PLAN_OR_TASK_LINE = new RegExp(
  "^\\s*[-*]\\s*\\[[xX]\\]\\s*.*(?:无需(?:单独|额外)?测试|NO_TEST_PHASE|observatory-skip-testing|Observatory:\\s*skip-testing)",
  "m"
);

/** 与 capabilities.schema.json phase 枚举一致 */
export const DECLARED_PHASE_VALUES = [
  "planning",
  "designing",
  "developing",
  "testing",
  "completed",
  "released",
  "deprecated",
] as const;

export type DeclaredCapabilityPhase = (typeof DECLARED_PHASE_VALUES)[number];

export function parseDeclaredPhase(raw: unknown): DeclaredCapabilityPhase | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if ((DECLARED_PHASE_VALUES as readonly string[]).includes(t)) {
    return t as DeclaredCapabilityPhase;
  }
  return null;
}

interface ObservatorySddJsonShape {
  skipTestingAfterTasks?: boolean;
  declaredPhase?: unknown;
}

/** 与 `readObservatorySddConfigMerged` 顺序一致：先 observatory 子目录内，再 legacy 平级 */
function observatorySddJsonReadPaths(featureDir: string): string[] {
  const parent = path.dirname(featureDir);
  if (path.basename(parent) === "specs") {
    const workspaceRoot = path.dirname(parent);
    const featureName = path.basename(featureDir);
    return [
      observatorySddJsonAbs(workspaceRoot, featureName),
      legacyObservatorySddJsonAbs(workspaceRoot, featureName),
    ];
  }
  const sub = resolveSddObservatorySubdirNameSync(featureDir);
  return [
    path.join(featureDir, sub, "observatory-sdd.json"),
    path.join(featureDir, "observatory-sdd.json"),
  ];
}

async function readObservatorySddJsonFile(
  featureDir: string
): Promise<ObservatorySddJsonShape | null> {
  for (const jsonPath of observatorySddJsonReadPaths(featureDir)) {
    try {
      const raw = await fs.readFile(jsonPath, "utf8");
      const j = JSON.parse(raw) as ObservatorySddJsonShape;
      return j && typeof j === "object" && !Array.isArray(j) ? j : null;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function readSkipTestingFromPlanOrTasks(
  featureDir: string
): Promise<boolean> {
  const planPath = path.join(featureDir, "plan.md");
  try {
    const plan = await fs.readFile(planPath, "utf8");
    if (PLAN_OR_TASK_LINE.test(plan)) return true;
  } catch {
    /* */
  }

  const tasksPath = path.join(featureDir, "tasks.md");
  try {
    const tasks = await fs.readFile(tasksPath, "utf8");
    if (PLAN_OR_TASK_LINE.test(tasks)) return true;
  } catch {
    /* */
  }

  return false;
}

export interface ObservatorySddFeatureOptions {
  skipTestingAfterTasks: boolean;
  /** 来自 observatory-sdd.json 的合法 declaredPhase；未设置则为 null */
  declaredPhase: DeclaredCapabilityPhase | null;
}

/**
 * 读取 feature 的 Observatory SDD 选项（JSON 一次解析 + plan/tasks 回退）。
 * skipTestingAfterTasks：JSON 中若为 boolean 则以其为准，否则看 plan/tasks 勾选行。
 */
export async function readObservatorySddFeatureOptions(
  featureDir: string
): Promise<ObservatorySddFeatureOptions> {
  const json = await readObservatorySddJsonFile(featureDir);

  let skipTestingAfterTasks: boolean;
  if (json && typeof json.skipTestingAfterTasks === "boolean") {
    skipTestingAfterTasks = json.skipTestingAfterTasks;
  } else {
    skipTestingAfterTasks = await readSkipTestingFromPlanOrTasks(featureDir);
  }

  const declaredPhase = json ? parseDeclaredPhase(json.declaredPhase) : null;

  return { skipTestingAfterTasks, declaredPhase };
}

export async function readSkipTestingAfterTasks(
  featureDir: string
): Promise<boolean> {
  const { skipTestingAfterTasks } =
    await readObservatorySddFeatureOptions(featureDir);
  return skipTestingAfterTasks;
}
