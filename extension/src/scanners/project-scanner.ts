/**
 * Orchestrates full scan into `.observatory/*.json`.
 * primary_doc: docs/ARCHITECTURE.md §3.2
 */
import * as path from "node:path";
import type { Capabilities, Manifest, Progress } from "../observatory/types";
import { ObservatoryStore } from "../observatory/store";
import { DocScanner } from "./doc-scanner";
import { GitScanner } from "./git-scanner";
import { PythonScanner } from "./python-scanner";
import { SqlScanner } from "./sql-scanner";
import {
  applySingleSddScanToCapabilities,
  detectSddStatus,
  mergeSddScanWithPrevious,
  scanSddWorkspace,
} from "./sdd";
import type { RunFullScanSddSummary } from "./sdd/types";
import {
  defaultProjectIdFromPath,
  ingestAllAgentTranscriptsFromDisk,
} from "../watchers/transcript-watcher";
import { detectTestStackFromFiles } from "../workspace/detect-test-stack";
export type { RunFullScanSddSummary } from "./sdd/types";

export async function runFullScan(
  workspaceRoot: string,
  store: ObservatoryStore,
  options?: { ingestAgentTranscripts?: boolean }
): Promise<RunFullScanSddSummary> {
  await store.initialize();
  const now = new Date().toISOString();
  const folderName = path.basename(workspaceRoot);

  const py = new PythonScanner();
  const sql = new SqlScanner();
  const git = new GitScanner();
  const doc = new DocScanner();

  const previous = await store.readJsonIfExists<Capabilities>(
    "capabilities.json"
  );
  const prevList = (previous?.capabilities ?? []) as Array<
    Record<string, unknown>
  >;
  const hadDataModelsFile = await store.fileExists("data-models.json");

  const [arch, dataModels, gitPart, docHealth, sddScanResult, sddDetection] =
    await Promise.all([
      py.scanArchitecture(workspaceRoot),
      sql.scanDataModels(workspaceRoot),
      git.scanProgress(workspaceRoot),
      doc.scanDocsHealth(workspaceRoot),
      scanSddWorkspace(workspaceRoot, { previousCapabilities: prevList }),
      detectSddStatus(workspaceRoot),
    ]);

  const { rows: sddRows } = sddScanResult;

  let capabilities: Capabilities;
  if (sddRows.length > 0) {
    /** 看板能力仅来自 specs/（含 spec.md 或 sketch.md 的子目录）；阶段由 spec/sketch/plan/tasks 等推断；合并上次 capabilities.json 同 id 行以保留扩展字段 */
    const merged = mergeSddScanWithPrevious(prevList, sddRows);
    capabilities = {
      schema_version: "1.0.0",
      generated_at: now,
      capabilities: merged as unknown as Capabilities["capabilities"],
    };
  } else {
    /** 无 SDD feature 时不从 ai-doc-index / 架构推断填充，避免已完工能力继续出现在看板 */
    capabilities = {
      schema_version: "1.0.0",
      generated_at: now,
      capabilities: [],
    };
  }

  const scannersUsed = [
    "python",
    "sql",
    "git",
    "doc",
    ...(sddRows.length > 0 ? (["sdd"] as const) : []),
  ];

  const isPy = await py.detect(workspaceRoot);
  const testStack = detectTestStackFromFiles(workspaceRoot);
  let projectType: string;
  let projectLanguage: string;
  if (testStack === "java-maven" || testStack === "java-gradle") {
    projectType = "java";
    projectLanguage = "java";
  } else if (testStack === "python-pytest" || isPy) {
    projectType = "python";
    projectLanguage = "python";
  } else if (testStack === "node") {
    projectType = "node";
    projectLanguage = "javascript";
  } else {
    projectType = isPy ? "python" : "generic";
    projectLanguage = isPy ? "python" : "unknown";
  }
  const manifest: Manifest = {
    schema_version: "1.0.0",
    project: {
      name: folderName,
      type: projectType,
      language: projectLanguage,
      test_stack: testStack,
      frameworks: [],
    },
    observatory: {
      initialized_at: now,
      last_full_scan: now,
      extension_version: "0.1.0",
      scanners_used: scannersUsed,
      sdd_detected: sddRows.length > 0,
      sdd_feature_count: sddRows.length,
      sdd_status: sddDetection.status,
    },
  };

  const progress: Progress = {
    schema_version: "1.0.0",
    generated_at: now,
    summary: gitPart.summary,
    timeline: gitPart.timeline,
  };

  await store.writeManifest(manifest);
  await store.writeArchitecture(arch);
  /** 已有 data-models.json 则不再写入，避免覆盖人工/AI 生成的库表文档 */
  if (!hadDataModelsFile) {
    await store.writeDataModels(dataModels);
  }
  await store.writeProgress(progress);
  await store.writeCapabilities(capabilities);
  await store.writeDocsHealth(docHealth);

  /** 与 ai-sessions 一致：仅当文件不存在时写入占位；避免全量扫描覆盖 pytest 导入或看板编辑的测试数据 */
  if (!(await store.readJsonIfExists("test-mapping.json"))) {
    await store.writeJson("test-mapping.json", {
      schema_version: "1.0.0",
      generated_at: now,
      mappings: [],
    });
  }
  if (!(await store.readJsonIfExists("test-expectations.json"))) {
    await store.writeJson("test-expectations.json", {
      schema_version: "1.0.0",
      generated_at: now,
      expectations: {},
    });
  }
  if (!(await store.readTestResultsIfExists())) {
    await store.writeTestResults({
      schema_version: "1.0.0",
      last_run: now,
      runner: "pytest",
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: 0,
        duration_ms: 0,
      },
      test_cases: [],
      by_capability: {},
    });
  }

  if (!(await store.readJsonIfExists("ai-sessions.json"))) {
    await store.writeJson("ai-sessions.json", {
      schema_version: "1.0.0",
      sessions: [],
    });
  }

  if (options?.ingestAgentTranscripts) {
    await ingestAllAgentTranscriptsFromDisk(
      workspaceRoot,
      store,
      defaultProjectIdFromPath(workspaceRoot)
    );
  }

  return {
    sddDetected: sddRows.length > 0,
    sddFeatureCount: sddRows.length,
    sddStatus: sddDetection.status,
  };
}

/**
 * 仅重新扫描单个 `specs/<featureName>/` 并写回 capabilities.json（不跑架构/Git/SQL 等全量扫描）。
 */
export async function runSingleSddFeatureScan(
  workspaceRoot: string,
  store: ObservatoryStore,
  featureName: string
): Promise<void> {
  await store.initialize();
  const now = new Date().toISOString();
  const previous = await store.readJsonIfExists<Capabilities>(
    "capabilities.json"
  );
  const prevList = (previous?.capabilities ?? []) as Array<
    Record<string, unknown>
  >;
  const { rows } = await scanSddWorkspace(workspaceRoot, {
    previousCapabilities: prevList,
    onlyFeatureName: featureName,
  });
  if (rows.length === 0) {
    throw new Error(
      `未找到 SDD 目录 specs/${featureName}，或该目录下缺少 spec.md / sketch.md`
    );
  }
  const mergedList = applySingleSddScanToCapabilities(prevList, rows);
  const capabilities: Capabilities = {
    schema_version: previous?.schema_version ?? "1.0.0",
    generated_at: now,
    capabilities: mergedList as unknown as Capabilities["capabilities"],
  };
  await store.writeCapabilities(capabilities);
}
