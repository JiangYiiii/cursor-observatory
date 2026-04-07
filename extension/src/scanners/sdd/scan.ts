/**
 * 扫描 specs/ 并生成 SDD Capability 行。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { readOrCreateCapabilityId } from "./capability-id";
import { parseBugfixLog } from "./parse-bugfix";
import { parseTaskProgress, taskProgressPercent } from "./parse-tasks";
import { inferPhaseFromSddArtifacts } from "./phase-infer";
import { readObservatorySddFeatureOptions } from "./read-sdd-observatory-options";
import { getSpecFileFirstAuthor } from "./spec-file-author";
import type { SddCapabilityMeta } from "./types";

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readFirstTitleFromMd(filePath: string): Promise<string | null> {
  try {
    const t = await fs.readFile(filePath, "utf8");
    const line = t.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (!line) return null;
    return line.replace(/^#+\s*/, "").trim().slice(0, 200) || null;
  } catch {
    return null;
  }
}

export interface ScanSddWorkspaceResult {
  rows: Array<Record<string, unknown>>;
  activeFeatureName: string | null;
}

export async function scanSddWorkspace(
  workspaceRoot: string,
  options: {
    previousCapabilities?: Array<Record<string, unknown>>;
    /** 仅扫描 `specs/<name>/`（用于单条需求同步，避免全量 specs 遍历） */
    onlyFeatureName?: string;
  } = {}
): Promise<ScanSddWorkspaceResult> {
  const specsRoot = path.join(workspaceRoot, "specs");
  const rows: Array<Record<string, unknown>> = [];
  const usedIds = new Set<string>();

  for (const prev of options.previousCapabilities ?? []) {
    if (typeof prev.id === "string") usedIds.add(prev.id);
  }

  let activeFeatureName: string | null = null;
  const activeFile = path.join(specsRoot, ".active");
  try {
    const a = (await fs.readFile(activeFile, "utf8")).trim();
    if (a) activeFeatureName = a.split(/\r?\n/)[0]?.trim() ?? null;
  } catch {
    /* none */
  }

  let dirents;
  try {
    dirents = await fs.readdir(specsRoot, { withFileTypes: true });
  } catch {
    return { rows: [], activeFeatureName: null };
  }

  const now = new Date().toISOString();

  for (const d of dirents) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    const featureName = d.name;
    if (
      options.onlyFeatureName !== undefined &&
      options.onlyFeatureName !== featureName
    ) {
      continue;
    }
    const featureDir = path.join(specsRoot, featureName);

    const hasSpec = await fileExists(path.join(featureDir, "spec.md"));
    const hasSketch = await fileExists(path.join(featureDir, "sketch.md"));
    if (!hasSpec && !hasSketch) continue;

    const id = await readOrCreateCapabilityId(
      featureDir,
      featureName,
      usedIds,
      options.previousCapabilities
    );

    const hasPlan = await fileExists(path.join(featureDir, "plan.md"));
    const hasTasksFile = await fileExists(path.join(featureDir, "tasks.md"));
    const tasksPath = path.join(featureDir, "tasks.md");
    let taskProgress = { total: 0, completed: 0 };
    if (hasTasksFile) {
      try {
        const tc = await fs.readFile(tasksPath, "utf8");
        taskProgress = parseTaskProgress(tc);
      } catch {
        /* ignore */
      }
    }

    const hasDataModel = await fileExists(
      path.join(featureDir, "data-model.md")
    );
    const hasResearch = await fileExists(path.join(featureDir, "research.md"));
    let hasContracts = false;
    try {
      const st = await fs.stat(path.join(featureDir, "contracts"));
      hasContracts = st.isDirectory();
    } catch {
      hasContracts = false;
    }

    const { skipTestingAfterTasks, declaredPhase } =
      await readObservatorySddFeatureOptions(featureDir);

    const inferredPhase = inferPhaseFromSddArtifacts({
      hasSpec,
      hasSketch,
      hasPlan,
      hasTasksFile,
      taskProgress,
      skipTestingAfterTasks,
    });

    /** observatory-sdd.json 的 declaredPhase 优先于产物推断（全量扫描可稳定保持，如 completed） */
    const phase = declaredPhase ?? inferredPhase;

    const documents: SddCapabilityMeta["documents"] = {
      spec: hasSpec,
      sketch: hasSketch,
      plan: hasPlan,
      tasks: hasTasksFile,
      dataModel: hasDataModel,
      contracts: hasContracts,
      research: hasResearch,
    };

    const specAuthor = hasSpec
      ? await getSpecFileFirstAuthor(
          workspaceRoot,
          path.join(featureDir, "spec.md")
        )
      : undefined;

    const sdd: SddCapabilityMeta = {
      enabled: true,
      workspacePath: `specs/${featureName}`,
      activeFeature: activeFeatureName === featureName,
      documents,
      ...(skipTestingAfterTasks ? { skipTestingAfterTasks: true } : {}),
      ...(declaredPhase ? { phaseDeclaredInObservatorySdd: true } : {}),
      ...(specAuthor !== undefined ? { specAuthor } : {}),
    };

    if (hasTasksFile && taskProgress.total > 0) {
      sdd.taskStats = {
        total: taskProgress.total,
        completed: taskProgress.completed,
      };
    }

    let title =
      (await readFirstTitleFromMd(path.join(featureDir, "spec.md"))) ??
      (await readFirstTitleFromMd(path.join(featureDir, "sketch.md"))) ??
      featureName;

    const row: Record<string, unknown> = {
      id,
      title,
      phase,
      progress: taskProgressPercent(taskProgress),
      sdd,
      confidence: "high",
      user_confirmed: true,
      updated_at: now,
    };

    const bugPath = path.join(featureDir, "bugfix-log.md");
    if (await fileExists(bugPath)) {
      try {
        const blog = await fs.readFile(bugPath, "utf8");
        const stats = parseBugfixLog(blog);
        if (
          stats.activeBugs > 0 ||
          stats.resolvedBugs > 0 ||
          stats.rootCauses.length > 0
        ) {
          row.bugfix = {
            activeBugs: stats.activeBugs,
            resolvedBugs: stats.resolvedBugs,
            rootCauses: stats.rootCauses,
          };
        }
      } catch {
        /* ignore */
      }
    }

    rows.push(row);
  }

  return { rows, activeFeatureName };
}
