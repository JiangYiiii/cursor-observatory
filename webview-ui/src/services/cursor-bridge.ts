/**
 * VS Code Webview 宿主页：`acquireVsCodeApi` + postMessage（与 Extension 侧 handler 成对）。
 * primary_doc: docs/FRONTEND_DESIGN.md §2.1
 */
import type {
  AiSession,
  Architecture,
  BatchDeployRequest,
  BatchOperationItemResult,
  BatchTrafficShiftRequest,
  CanaryDeployment,
  CanarySwitchPreCheck,
  Capability,
  DataModels,
  DocsAiIndicesPayload,
  DocsCatalogDocument,
  DocsConfigPayload,
  DocsFilePayload,
  DocsHealth,
  DocsTreePayload,
  ImageTag,
  Manifest,
  PipelineInfo,
  PipelineNode,
  PipelineRunSummary,
  PipelineStageSummary,
  PreflightResult,
  Progress,
  ReleaseDiffPayload,
  ReleaseEnvStatus,
  SessionDetail,
  SessionIndex,
  TestExpectations,
  TestHistoryEntry,
  TestMapping,
  TestResults,
  TrafficChangeLog,
  Unsubscribe,
  UpdateEvent,
} from "../types/observatory";
import type { CreateDataSourceOptions } from "./idata-source";
import type { IDataSource } from "./idata-source";
import type { ObservatoryErrorShape } from "./errors";
import { ObservatoryDataError } from "./errors";

type VsCodeApi = {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (s: unknown) => void;
};

const REQUEST = "observatory-request";
const RESPONSE = "observatory-response";

type BridgeRequest = {
  type: typeof REQUEST;
  requestId: string;
  method: string;
  params?: unknown;
};

type BridgeResponse = {
  type: typeof RESPONSE;
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  errorPayload?: ObservatoryErrorShape;
};

function getApi(): VsCodeApi {
  const g = globalThis as unknown as { acquireVsCodeApi?: () => VsCodeApi };
  if (typeof g.acquireVsCodeApi !== "function") {
    throw new ObservatoryDataError("acquireVsCodeApi 不可用", "NO_VSCODE_API");
  }
  return g.acquireVsCodeApi();
}

export class CursorBridgeDataSource implements IDataSource {
  private readonly api: VsCodeApi;
  private readonly pending = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private readonly listeners = new Set<(e: UpdateEvent) => void>();
  private readonly workspaceRoot: string | null;
  private boundMessage: ((ev: MessageEvent) => void) | null = null;

  constructor(opts: CreateDataSourceOptions) {
    this.api = getApi();
    this.workspaceRoot =
      opts.workspaceRoot !== undefined && opts.workspaceRoot !== ""
        ? opts.workspaceRoot
        : null;
    this.boundMessage = (ev: MessageEvent) => this.onMessage(ev);
    window.addEventListener("message", this.boundMessage);
  }

  dispose(): void {
    if (this.boundMessage) {
      window.removeEventListener("message", this.boundMessage);
      this.boundMessage = null;
    }
    this.pending.clear();
    this.listeners.clear();
  }

  private onMessage(ev: MessageEvent): void {
    const msg = ev.data as BridgeResponse | UpdateEvent;
    if (!msg || typeof msg !== "object") return;

    if ("type" in msg && msg.type === RESPONSE) {
      const r = msg as BridgeResponse;
      const p = this.pending.get(r.requestId);
      if (!p) return;
      this.pending.delete(r.requestId);
      if (r.ok) p.resolve(r.data);
      else
        p.reject(
          ObservatoryDataError.fromBridge(
            r.error ?? "bridge error",
            r.errorPayload
          )
        );
      return;
    }

    if ("type" in msg && (msg as UpdateEvent).type === "refresh") {
      for (const cb of this.listeners) cb(msg as UpdateEvent);
    }
  }

  private mergeParams(params?: unknown): Record<string, unknown> | undefined {
    const base: Record<string, unknown> = {};
    if (this.workspaceRoot) base.workspaceRoot = this.workspaceRoot;
    if (params !== undefined && typeof params === "object" && !Array.isArray(params)) {
      return { ...base, ...(params as Record<string, unknown>) };
    }
    if (params !== undefined) {
      return { ...base, value: params };
    }
    return Object.keys(base).length ? base : undefined;
  }

  private request<T>(method: string, params?: unknown): Promise<T> {
    const requestId = crypto.randomUUID();
    const payload: BridgeRequest = {
      type: REQUEST,
      requestId,
      method,
      params: this.mergeParams(params),
    };
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      this.api.postMessage(payload);
    });
  }

  async getManifest(): Promise<Manifest | null> {
    return this.request<Manifest | null>("getManifest");
  }

  async getArchitecture(): Promise<Architecture | null> {
    return this.request<Architecture | null>("getArchitecture");
  }

  async getCapabilities(): Promise<Capability[]> {
    return this.request<Capability[]>("getCapabilities");
  }

  async getProgress(): Promise<Progress | null> {
    return this.request<Progress | null>("getProgress");
  }

  async getTestResults(): Promise<TestResults | null> {
    return this.request<TestResults | null>("getTestResults");
  }

  async getTestMapping(): Promise<TestMapping | null> {
    return this.request<TestMapping | null>("getTestMapping");
  }

  async getTestExpectations(): Promise<TestExpectations | null> {
    return this.request<TestExpectations | null>("getTestExpectations");
  }

  async saveTestExpectations(doc: TestExpectations): Promise<void> {
    await this.request<void>("saveTestExpectations", { document: doc });
  }

  async getTestHistory(): Promise<TestHistoryEntry[]> {
    return this.request<TestHistoryEntry[]>("getTestHistory");
  }

  async getAiSessions(): Promise<AiSession[]> {
    return this.request<AiSession[]>("getAiSessions");
  }

  async getDataModels(): Promise<DataModels | null> {
    return this.request<DataModels | null>("getDataModels");
  }

  async getDataModelAiPromptMarkdown(): Promise<string> {
    return this.request<string>("getDataModelAiPromptMarkdown");
  }

  async getDocsHealth(): Promise<DocsHealth | null> {
    return this.request<DocsHealth | null>("getDocsHealth");
  }

  async getDocsConfig(): Promise<DocsConfigPayload> {
    return this.request<DocsConfigPayload>("docs.getConfig");
  }

  async getDocsTree(): Promise<DocsTreePayload> {
    return this.request<DocsTreePayload>("docs.listTree");
  }

  async getDocsFile(relativePath: string): Promise<DocsFilePayload> {
    return this.request<DocsFilePayload>("docs.readFile", { relativePath });
  }

  async getDocsCatalog(): Promise<DocsCatalogDocument | null> {
    return this.request<DocsCatalogDocument | null>("docs.getCatalog");
  }

  async getDocsAiIndices(): Promise<DocsAiIndicesPayload> {
    return this.request<DocsAiIndicesPayload>("docs.listAiIndices");
  }

  async openWorkspaceFile(relativePath: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>("workspace.openFile", { relativePath });
  }

  async getSessionList(): Promise<SessionIndex | null> {
    return this.request<SessionIndex | null>("getSessionList");
  }

  async getSession(id: string): Promise<SessionDetail | null> {
    return this.request<SessionDetail | null>("getSession", { id });
  }

  onUpdate(callback: (event: UpdateEvent) => void): Unsubscribe {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  async triggerScan(): Promise<void> {
    await this.request<void>("triggerScan");
  }

  async scanSddFeature(featureName: string): Promise<void> {
    await this.request<void>("scanSddFeature", { featureName });
  }

  async triggerTests(capabilityId?: string): Promise<void> {
    await this.request<void>("triggerTests", { capabilityId });
  }

  async updateCapability(
    id: string,
    updates: Partial<Capability>
  ): Promise<void> {
    await this.request<void>("updateCapability", { id, updates });
  }

  async getSddConfig(feature: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("getSddConfig", { feature });
  }

  async saveSddConfig(
    feature: string,
    partial: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("saveSddConfig", {
      feature,
      partial,
    });
  }

  async getImpactAnalysis(feature: string): Promise<unknown | null> {
    return this.request<unknown | null>("getImpactAnalysis", { feature });
  }

  async saveImpactAnalysis(
    feature: string,
    body: unknown
  ): Promise<{ warnings?: string[] }> {
    return this.request<{ warnings?: string[] }>("saveImpactAnalysis", {
      feature,
      body,
    });
  }

  async getTestCasesResult(feature: string): Promise<unknown | null> {
    return this.request<unknown | null>("getTestCasesResult", { feature });
  }

  async saveTestCasesResult(feature: string, body: unknown): Promise<void> {
    await this.request<void>("saveTestCasesResult", { feature, body });
  }

  async getPromptTemplate(
    stage: string
  ): Promise<{ content: string; source: string }> {
    return this.request<{ content: string; source: string }>(
      "getPromptTemplate",
      { stage }
    );
  }

  async getGitInfo(): Promise<{
    branch: string;
    headCommit: string;
    workingTreeFingerprint: string;
    lastCommitLine: string | null;
  }> {
    return this.request<{
      branch: string;
      headCommit: string;
      workingTreeFingerprint: string;
      lastCommitLine: string | null;
    }>("getGitInfo");
  }

  async getReleaseDiff(): Promise<ReleaseDiffPayload> {
    return this.request<ReleaseDiffPayload>("getReleaseDiff");
  }

  async getImpactAnalysisMd(feature: string): Promise<string | null> {
    return this.request<string | null>("getImpactAnalysisMd", { feature });
  }

  async getTestCasesMd(feature: string): Promise<string | null> {
    return this.request<string | null>("getTestCasesMd", { feature });
  }

  async getPreflight(stage: string): Promise<PreflightResult> {
    return this.request<PreflightResult>("getPreflight", { stage });
  }

  async getDeploySettings(): Promise<{
    defaultServiceList: string;
    cheetahMcpService: string;
  }> {
    return this.request<{
      defaultServiceList: string;
      cheetahMcpService: string;
    }>("getDeploySettings");
  }

  // --- Release Workflow ---

  async getReleaseEnvStatus(): Promise<ReleaseEnvStatus> {
    return this.request<ReleaseEnvStatus>("release.getEnvStatus");
  }

  async listReleasePipelines(): Promise<PipelineInfo[]> {
    return this.request<PipelineInfo[]>("release.listPipelines");
  }

  async listReleaseStageSummaries(): Promise<PipelineStageSummary[]> {
    return this.request<PipelineStageSummary[]>("release.listStageSummaries");
  }

  async getLatestPipelineRun(pipelineName: string): Promise<PipelineRunSummary | null> {
    return this.request<PipelineRunSummary | null>("release.getLatestRun", { pipelineName });
  }

  async getPipelineRunNodes(runId: string): Promise<PipelineNode[]> {
    return this.request<PipelineNode[]>("release.getRunNodes", { runId });
  }

  async listReleaseImages(repoName: string): Promise<ImageTag[]> {
    return this.request<ImageTag[]>("release.listImages", { repoName });
  }

  async triggerReleaseDeploy(
    pipelineName: string,
    fullModuleName: string,
    imageTag: string,
    options?: { ksPipelineType?: string; includeCanaryDeployHeader?: boolean },
  ): Promise<{ runId: string }> {
    return this.request<{ runId: string }>("release.triggerDeploy", {
      pipelineName,
      fullModuleName,
      imageTag,
      ...options,
    });
  }

  async batchReleaseDeploy(
    request: BatchDeployRequest
  ): Promise<{ operationId: string; results: BatchOperationItemResult[] }> {
    return this.request<{ operationId: string; results: BatchOperationItemResult[] }>(
      "release.batchDeploy",
      request
    );
  }

  async getReleaseCanary(pipeline: string): Promise<CanaryDeployment | null> {
    return this.request<CanaryDeployment | null>("release.getCanary", { pipeline });
  }

  async preCheckReleaseCanarySwitch(pipeline: string): Promise<CanarySwitchPreCheck> {
    return this.request<CanarySwitchPreCheck>("release.preCheckCanarySwitch", { pipeline });
  }

  async shiftReleaseTraffic(
    pipeline: string,
    weights: Record<string, number>,
    meta?: unknown
  ): Promise<BatchOperationItemResult> {
    return this.request<BatchOperationItemResult>("release.shiftTraffic", { pipeline, weights, meta });
  }

  async submitReleasePipelineRunInput(
    pipelineName: string,
    runId: string,
    nodeId: string,
    stepId: string,
    inputId: string,
    abort: boolean,
    jenkinsBuildId?: string
  ): Promise<void> {
    await this.request<unknown>("release.submitPipelineRunInput", {
      pipelineName,
      runId,
      nodeId,
      stepId,
      inputId,
      abort,
      ...(jenkinsBuildId ? { jenkinsBuildId } : {}),
    });
  }

  async batchShiftReleaseTraffic(
    request: BatchTrafficShiftRequest
  ): Promise<{ operationId: string; results: BatchOperationItemResult[] }> {
    return this.request<{ operationId: string; results: BatchOperationItemResult[] }>(
      "release.batchTrafficShift",
      request
    );
  }

  async getReleaseTrafficLogs(pipeline: string): Promise<TrafficChangeLog[]> {
    return this.request<TrafficChangeLog[]>("release.getTrafficLogs", { pipeline });
  }

  async checkReleaseRollback(
    module: string,
    image: string
  ): Promise<{ canRollback: boolean; reason?: string }> {
    return this.request<{ canRollback: boolean; reason?: string }>(
      "release.checkRollback",
      { module, image }
    );
  }
}
