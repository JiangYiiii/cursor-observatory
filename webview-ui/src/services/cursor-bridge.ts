/**
 * VS Code Webview 宿主页：`acquireVsCodeApi` + postMessage（与 Extension 侧 handler 成对）。
 * primary_doc: docs/FRONTEND_DESIGN.md §2.1
 */
import type {
  AiSession,
  Architecture,
  Capability,
  DataModels,
  DocsHealth,
  Manifest,
  PreflightResult,
  Progress,
  SessionDetail,
  SessionIndex,
  TestExpectations,
  TestHistoryEntry,
  TestMapping,
  TestResults,
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
}
