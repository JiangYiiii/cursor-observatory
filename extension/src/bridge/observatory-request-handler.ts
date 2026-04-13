/**
 * Webview postMessage ↔ ObservatoryStore 读路径（与 webview-ui `CursorBridgeDataSource` 协议一致）。
 * primary_doc: docs/FRONTEND_DESIGN.md §2.1, docs/EXTENSION_DESIGN.md §七
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  ObservatoryError,
  observatoryErrorFromUnknown,
  type ObservatoryErrorPayload,
} from "../observatory/errors";
import { getDataModelAiPromptMarkdown } from "../observatory/project-onboarding";
import { getGitInfoSummary } from "../observatory/git-info-summary";
import { getReleaseDiffPayload } from "../observatory/git-release-diff";
import { getDeployCheetahMcp } from "../observatory/observatory-config";
import { loadPromptTemplate } from "../observatory/prompt-template-loader";
import { runPreflight } from "../observatory/preflight-resolver";
import { getObservatoryDocsSettings, resolveDocsDirAbs, safeUnderRoot } from "../observatory/docs-config";
import {
  getDocsTree,
  readDocsFileUtf8,
  parseDocsRelativePathParam,
  readDocsCatalogIfExists,
  listAiIndexSummaries,
} from "../observatory/workspace-docs";
import { resolveRegisteredStore } from "../observatory/workspace-root-resolve";
import {
  readObservatorySddConfigMerged,
  writeObservatorySddConfigMerged,
} from "../observatory/observatory-sdd-config";
import { sddFeatureObservatoryDirAbs } from "../observatory/sdd-test-paths";
import type { ObservatoryStore } from "../observatory/store";
import {
  processImpactAnalysis,
  processTestCases,
  readImpactAnalysisMarkdownForFeature,
} from "../observatory/validation-pipeline";
import { runSingleSddFeatureScan } from "../scanners/project-scanner";
import type { TestExpectations } from "../observatory/types";
import type { ReleaseHandler } from "../release/release-handler";

const REQUEST = "observatory-request";
const RESPONSE = "observatory-response";

export type BridgeRequestMsg = {
  type: typeof REQUEST;
  requestId: string;
  method: string;
  params?: Record<string, unknown>;
};

export type BridgeResponseMsg = {
  type: typeof RESPONSE;
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  /** 与 HTTP API 一致的结构化错误（ARCHITECTURE §4.2） */
  errorPayload?: ObservatoryErrorPayload;
};

export type GetObservatoryStore = (
  workspaceRoot: string
) => ObservatoryStore | undefined;

function isBridgeRequest(raw: unknown): raw is BridgeRequestMsg {
  if (!raw || typeof raw !== "object") return false;
  const m = raw as Record<string, unknown>;
  return m.type === REQUEST && typeof m.requestId === "string" && typeof m.method === "string";
}

function requireFeature(params?: Record<string, unknown>): string {
  const name = params?.feature;
  if (typeof name !== "string" || name.length === 0 || name.length > 256) {
    throw new Error("feature required");
  }
  if (name.includes("..") || /[/\\]/.test(name)) {
    throw new Error("invalid feature");
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error("invalid feature");
  }
  return name;
}

async function readTestHistoryLines(store: ObservatoryStore): Promise<unknown[]> {
  const fp = path.join(store.observatoryPath, "test-history.jsonl");
  try {
    const text = await fs.readFile(fp, "utf8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const out: unknown[] = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip bad line */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 处理来自 Webview 的 `observatory-request`；非本协议消息返回 `null`。
 */
export async function handleObservatoryBridgeMessage(
  raw: unknown,
  getStore: GetObservatoryStore,
  releaseHandler?: ReleaseHandler,
): Promise<BridgeResponseMsg | null> {
  if (!isBridgeRequest(raw)) return null;

  const { requestId, method, params } = raw;
  const rootRaw = params?.workspaceRoot;
  if (typeof rootRaw !== "string" || !rootRaw.length) {
    const ep: ObservatoryErrorPayload = {
      code: "BAD_REQUEST",
      message: "missing params.workspaceRoot",
      detail: {},
      retryable: false,
    };
    return {
      type: RESPONSE,
      requestId,
      ok: false,
      error: ep.message,
      errorPayload: ep,
    };
  }

  const store = resolveRegisteredStore(getStore, rootRaw);
  if (!store) {
    const ep: ObservatoryErrorPayload = {
      code: "NOT_FOUND",
      message: "workspace not registered",
      detail: {},
      retryable: false,
    };
    return {
      type: RESPONSE,
      requestId,
      ok: false,
      error: ep.message,
      errorPayload: ep,
    };
  }

  try {
    const data = await dispatch(store, method, params, releaseHandler);
    return { type: RESPONSE, requestId, ok: true, data };
  } catch (e) {
    const payload =
      e instanceof ObservatoryError ? e.toJSON() : observatoryErrorFromUnknown(e);
    return {
      type: RESPONSE,
      requestId,
      ok: false,
      error: payload.message,
      errorPayload: payload,
    };
  }
}

async function dispatch(
  store: ObservatoryStore,
  method: string,
  params?: Record<string, unknown>,
  releaseHandler?: ReleaseHandler,
): Promise<unknown> {
  switch (method) {
    case "getManifest":
      return store.readJsonIfExists("manifest.json");
    case "getArchitecture":
      return store.readJsonIfExists("architecture.json");
    case "getCapabilities": {
      const doc = await store.readJsonIfExists<{ capabilities?: unknown[] }>(
        "capabilities.json"
      );
      return doc?.capabilities ?? [];
    }
    case "getProgress":
      return store.readJsonIfExists("progress.json");
    case "getTestResults":
      return store.readTestResultsIfExists();
    case "getTestMapping":
      return store.readJsonIfExists("test-mapping.json");
    case "getTestExpectations":
      return store.readJsonIfExists("test-expectations.json");
    case "saveTestExpectations": {
      const doc = params?.document as TestExpectations | undefined;
      if (!doc || typeof doc !== "object" || typeof doc.schema_version !== "string") {
        throw new Error("saveTestExpectations: missing or invalid params.document");
      }
      await store.writeTestExpectations(doc);
      return { ok: true };
    }
    case "getTestHistory":
      return readTestHistoryLines(store);
    case "getAiSessions": {
      const doc = await store.readJsonIfExists<{ sessions?: unknown[] }>(
        "ai-sessions.json"
      );
      return doc?.sessions ?? [];
    }
    case "getDataModels":
      return store.readJsonIfExists("data-models.json");
    case "getDataModelAiPromptMarkdown":
      return getDataModelAiPromptMarkdown();
    case "getDocsHealth":
      return store.readJsonIfExists("docs-health.json");
    case "getSessionList":
      return store.readJsonIfExists(path.join("sessions", "index.json"));
    case "getSession": {
      const id = params?.id;
      if (typeof id !== "string" || !/^[\w.-]+$/.test(id)) {
        throw new Error("invalid session id");
      }
      return store.readJsonIfExists(
        path.join("sessions", id, "meta.json")
      );
    }
    case "updateCapability": {
      const id = params?.id;
      const updates = params?.updates;
      if (typeof id !== "string" || !updates || typeof updates !== "object") {
        throw new Error("updateCapability: id and updates required");
      }
      await store.patchCapability(id, updates as Record<string, unknown>);
      return { ok: true };
    }
    case "scanSddFeature": {
      const name = params?.featureName;
      if (typeof name !== "string" || name.length === 0 || name.length > 256) {
        throw new Error("scanSddFeature: featureName required");
      }
      if (name.includes("..") || /[/\\]/.test(name)) {
        throw new Error("scanSddFeature: invalid featureName");
      }
      await runSingleSddFeatureScan(store.workspaceRoot, store, name);
      return { ok: true };
    }
    case "getSddConfig": {
      const feature = requireFeature(params);
      return readObservatorySddConfigMerged(store.workspaceRoot, feature);
    }
    case "saveSddConfig": {
      const feature = requireFeature(params);
      const partial = params?.partial;
      if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
        throw new Error("saveSddConfig: partial object required");
      }
      const prev = await readObservatorySddConfigMerged(
        store.workspaceRoot,
        feature
      );
      const next = { ...prev, ...(partial as Record<string, unknown>) };
      await writeObservatorySddConfigMerged(
        store.workspaceRoot,
        feature,
        next
      );
      return next;
    }
    case "getDeploySettings": {
      const uri = vscode.Uri.file(store.workspaceRoot);
      const cfg = vscode.workspace.getConfiguration("observatory", uri);
      const raw = cfg.get<string>("deploy.defaultServiceList", "") ?? "";
      const cheetah = getDeployCheetahMcp(cfg);
      return { defaultServiceList: raw, cheetahMcpService: cheetah };
    }
    case "getImpactAnalysis": {
      const feature = requireFeature(params);
      const fp = path.join(
        sddFeatureObservatoryDirAbs(store.workspaceRoot, feature),
        "impact-analysis.json"
      );
      try {
        const text = await fs.readFile(fp, "utf8");
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    }
    case "saveImpactAnalysis": {
      const feature = requireFeature(params);
      const body = params?.body;
      const result = await processImpactAnalysis(
        store.workspaceRoot,
        feature,
        body
      );
      if (!result.ok) {
        throw new Error(result.errors?.join("; ") ?? "validation failed");
      }
      return {
        ok: true,
        ...(result.warnings?.length ? { warnings: result.warnings } : {}),
      };
    }
    case "getTestCasesResult": {
      const feature = requireFeature(params);
      const fp = path.join(
        sddFeatureObservatoryDirAbs(store.workspaceRoot, feature),
        "test-cases.json"
      );
      try {
        const text = await fs.readFile(fp, "utf8");
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    }
    case "saveTestCasesResult": {
      const feature = requireFeature(params);
      const body = params?.body;
      const result = await processTestCases(
        store.workspaceRoot,
        feature,
        body
      );
      if (!result.ok) {
        throw new Error(result.errors?.join("; ") ?? "validation failed");
      }
      return { ok: true };
    }
    case "getPromptTemplate": {
      const stage = params?.stage;
      if (typeof stage !== "string" || !/^[\w-]+$/.test(stage)) {
        throw new Error("getPromptTemplate: stage required");
      }
      return loadPromptTemplate(store.workspaceRoot, stage);
    }
    case "docs.getConfig": {
      const s = getObservatoryDocsSettings(store.workspaceRoot);
      return {
        docsRoot: s.docsRoot,
        aiDocIndexRelativePath: s.aiDocIndexRelativePath,
        semanticIndexGlob: s.semanticIndexGlob,
      };
    }
    case "docs.listTree":
      return getDocsTree(store.workspaceRoot);
    case "docs.readFile": {
      const raw = params?.relativePath;
      const posix = parseDocsRelativePathParam(
        typeof raw === "string" ? raw : ""
      );
      return readDocsFileUtf8(store.workspaceRoot, posix);
    }
    case "docs.getCatalog":
      return readDocsCatalogIfExists(store.workspaceRoot);
    case "docs.listAiIndices":
      return listAiIndexSummaries(store.workspaceRoot);
    case "workspace.openFile": {
      const raw = params?.relativePath;
      const posix = parseDocsRelativePathParam(
        typeof raw === "string" ? raw : ""
      );
      const docsDir = resolveDocsDirAbs(store.workspaceRoot);
      const full = path.resolve(docsDir, posix);
      if (!safeUnderRoot(docsDir, full)) {
        throw new Error("path escapes docs root");
      }
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(full));
      await vscode.window.showTextDocument(doc);
      return { ok: true };
    }
    case "getGitInfo":
      return getGitInfoSummary(store.workspaceRoot);
    case "getReleaseDiff":
      return getReleaseDiffPayload(store.workspaceRoot);
    case "getPreflight": {
      const stage = params?.stage;
      if (typeof stage !== "string" || !/^[\w-]+$/.test(stage) || stage.length > 64) {
        throw new Error("getPreflight: stage required");
      }
      return runPreflight(store.workspaceRoot, stage, { id: "", sdd: {} });
    }
    case "getImpactAnalysisMd": {
      const feature = requireFeature(params);
      return readImpactAnalysisMarkdownForFeature(store.workspaceRoot, feature);
    }
    case "getTestCasesMd": {
      const feature = requireFeature(params);
      const fp = path.join(
        sddFeatureObservatoryDirAbs(store.workspaceRoot, feature),
        "test-cases.md"
      );
      try {
        return await fs.readFile(fp, "utf8");
      } catch {
        return null;
      }
    }
    case "triggerScan":
    case "triggerTests":
      throw new Error(`method not implemented in bridge: ${method}`);

    // ──────────── Release workflow ────────────
    case "release.getEnvStatus":
      return releaseHandler?.getEnvStatus() ?? null;
    case "release.listPipelines":
      return releaseHandler?.listPipelines() ?? [];
    case "release.listStageSummaries":
      return releaseHandler?.listStageSummaries() ?? [];
    case "release.getLatestRun":
      return releaseHandler?.getLatestRun(params?.pipelineName as string) ?? null;
    case "release.getRunNodes":
      return releaseHandler?.getRunNodes(params?.runId as string) ?? [];
    case "release.preCheckCanarySwitch":
      return releaseHandler?.preCheckCanarySwitch(params?.pipeline as string) ?? {
        canSwitch: false,
        reason: "发布处理器未就绪",
      };
    case "release.submitPipelineRunInput": {
      if (!releaseHandler) return null;
      await releaseHandler.submitPipelineRunInput(
        params?.pipelineName as string,
        params?.runId as string,
        params?.nodeId as string,
        params?.stepId as string,
        params?.inputId as string,
        Boolean(params?.abort),
        params?.jenkinsBuildId as string | undefined,
      );
      return null;
    }
    case "release.listImages":
      return releaseHandler?.listImages(params?.repoName as string) ?? [];
    case "release.triggerDeploy":
      return releaseHandler?.triggerDeploy(
        params?.pipelineName as string,
        params?.fullModuleName as string,
        params?.imageTag as string,
        {
          ksPipelineType: params?.ksPipelineType as string | undefined,
          includeCanaryDeployHeader: params?.includeCanaryDeployHeader as boolean | undefined,
        },
      ) ?? null;
    case "release.batchDeploy":
      return releaseHandler?.batchDeploy(params as any) ?? null;
    case "release.getCanary":
      return releaseHandler?.getCanary(params?.pipeline as string) ?? null;
    case "release.shiftTraffic":
      return releaseHandler?.shiftTraffic(
        params?.pipeline as string,
        params?.weights as Record<string, number>,
        params?.meta as any,
      ) ?? null;
    case "release.batchTrafficShift":
      return releaseHandler?.batchTrafficShift(params as any) ?? null;
    case "release.getTrafficLogs":
      return releaseHandler?.getTrafficLogs(params?.pipeline as string) ?? [];
    case "release.checkRollback":
      return releaseHandler?.checkRollback(
        params?.module as string,
        params?.image as string,
      ) ?? null;

    default:
      throw new Error(`unknown method: ${method}`);
  }
}
