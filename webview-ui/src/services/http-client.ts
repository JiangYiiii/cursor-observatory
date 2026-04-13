/**
 * 浏览器 / 同域静态托管：REST + WebSocket。
 * primary_doc: docs/FRONTEND_DESIGN.md §2.2, docs/ARCHITECTURE.md §4.2
 */
import type {
  AiSession,
  AiSessionsDocument,
  Architecture,
  BatchDeployRequest,
  BatchOperationItemResult,
  BatchTrafficShiftRequest,
  CanaryDeployment,
  Capability,
  CapabilitiesDocument,
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
  CanarySwitchPreCheck,
  Unsubscribe,
  UpdateEvent,
} from "../types/observatory";
import type { CreateDataSourceOptions, IDataSource } from "./idata-source";
import { ObservatoryDataError } from "./errors";

type HttpOpts = CreateDataSourceOptions & { baseUrl: string };

const WS_BACKOFF_BASE_MS = 1000;
const WS_BACKOFF_MAX_MS = 30000;
const WS_POLL_FALLBACK_MS = 15000;

export class HttpDataSource implements IDataSource {
  private readonly baseUrl: string;
  private readonly workspaceRoot: string | null;
  private readonly listeners = new Set<(e: UpdateEvent) => void>();
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private wsReconnectAttempt = 0;

  constructor(opts: HttpOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.workspaceRoot =
      opts.workspaceRoot !== undefined && opts.workspaceRoot !== ""
        ? opts.workspaceRoot
        : null;
  }

  /** 切换工作区前关闭 WS，避免旧连接与重复轮询 */
  dispose(): void {
    this.listeners.clear();
    this.stopPollFallback();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private requireRoot(): string {
    if (!this.workspaceRoot) {
      throw new ObservatoryDataError(
        "缺少工作区路径：请在 URL 加上 ?root=<工作区绝对路径>，或由 Extension 注入 workspaceRoot。",
        "MISSING_ROOT"
      );
    }
    return this.workspaceRoot;
  }

  private apiUrl(path: string): string {
    const root = encodeURIComponent(this.requireRoot());
    const sep = path.includes("?") ? "&" : "?";
    return `${this.baseUrl}${path}${sep}root=${root}`;
  }

  /** 不依赖工作区路径的 API（如同步静态提示词） */
  private publicApiUrl(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    const b = this.baseUrl.replace(/\/$/, "");
    return b ? `${b}${p}` : p;
  }

  private async fetchJson<T>(path: string): Promise<T | null> {
    const url = this.apiUrl(path);
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as T;
  }

  /** /api/workspace/*：404 时解析服务端 JSON，避免误报「无法读取」类笼统错误 */
  private async fetchWorkspaceJson<T>(path: string): Promise<T> {
    const url = this.apiUrl(path);
    const res = await fetch(url);
    if (res.status === 404) {
      let msg =
        "工作区未在 Observatory 中注册，或浏览器地址 ?root= 与已打开文件夹不一致（含符号链接路径差异）。请用扩展打开 Dashboard，或核对 URL 中的工作区绝对路径。";
      try {
        const j = (await res.json()) as { message?: string; code?: string };
        if (typeof j.message === "string" && j.message.length > 0) {
          msg =
            j.message === "workspace not registered"
              ? msg
              : j.message;
        }
      } catch {
        /* 保持默认说明 */
      }
      throw new ObservatoryDataError(msg, "NOT_FOUND", { status: 404 });
    }
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as T;
  }

  async getManifest(): Promise<Manifest | null> {
    return this.fetchJson<Manifest>("/api/observatory/manifest");
  }

  async getArchitecture(): Promise<Architecture | null> {
    return this.fetchJson<Architecture>("/api/observatory/architecture");
  }

  async getCapabilities(): Promise<Capability[]> {
    const doc = await this.fetchJson<CapabilitiesDocument>(
      "/api/observatory/capabilities"
    );
    return doc?.capabilities ?? [];
  }

  async getProgress(): Promise<Progress | null> {
    return this.fetchJson<Progress>("/api/observatory/progress");
  }

  async getTestResults(): Promise<TestResults | null> {
    return this.fetchJson<TestResults>("/api/observatory/test-results");
  }

  async getTestMapping(): Promise<TestMapping | null> {
    return this.fetchJson<TestMapping>("/api/observatory/test-mapping");
  }

  async getTestExpectations(): Promise<TestExpectations | null> {
    return this.fetchJson<TestExpectations>(
      "/api/observatory/test-expectations"
    );
  }

  async saveTestExpectations(doc: TestExpectations): Promise<void> {
    const url = this.apiUrl("/api/observatory/test-expectations");
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(doc),
    });
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
  }

  async getTestHistory(): Promise<TestHistoryEntry[]> {
    const list = await this.fetchJson<TestHistoryEntry[]>(
      "/api/observatory/test-history"
    );
    return list ?? [];
  }

  async getAiSessions(): Promise<AiSession[]> {
    const doc = await this.fetchJson<AiSessionsDocument>(
      "/api/observatory/ai-sessions"
    );
    return doc?.sessions ?? [];
  }

  async getDataModels(): Promise<DataModels | null> {
    return this.fetchJson<DataModels>("/api/observatory/data-models");
  }

  async getDataModelAiPromptMarkdown(): Promise<string> {
    const url = this.publicApiUrl("/api/observatory/data-model-ai-prompt");
    const res = await fetch(url);
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    const data = (await res.json()) as { markdown?: string };
    if (typeof data.markdown !== "string") {
      throw new ObservatoryDataError("无效的 data-model-ai-prompt 响应", "INVALID_RESPONSE");
    }
    return data.markdown;
  }

  async getDocsHealth(): Promise<DocsHealth | null> {
    return this.fetchJson<DocsHealth>("/api/observatory/docs-health");
  }

  async getDocsConfig(): Promise<DocsConfigPayload> {
    return this.fetchWorkspaceJson<DocsConfigPayload>(
      "/api/workspace/docs-config"
    );
  }

  async getDocsTree(): Promise<DocsTreePayload> {
    return this.fetchWorkspaceJson<DocsTreePayload>("/api/workspace/docs-tree");
  }

  async getDocsFile(relativePath: string): Promise<DocsFilePayload> {
    const base = this.apiUrl("/api/workspace/docs-file");
    const url = `${base}&relativePath=${encodeURIComponent(relativePath)}`;
    const res = await fetch(url);
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as DocsFilePayload;
  }

  async getDocsCatalog(): Promise<DocsCatalogDocument | null> {
    const url = this.apiUrl("/api/workspace/docs-catalog");
    const res = await fetch(url);
    if (res.status === 404) {
      try {
        const j = (await res.json()) as { message?: string };
        if (j.message === "docs-catalog.json") return null;
        let msg =
          "工作区未在 Observatory 中注册，或浏览器地址 ?root= 与已打开文件夹不一致（含符号链接路径差异）。请用扩展打开 Dashboard，或核对 URL 中的工作区绝对路径。";
        if (
          typeof j.message === "string" &&
          j.message.length > 0 &&
          j.message !== "workspace not registered"
        ) {
          msg = j.message;
        }
        throw new ObservatoryDataError(msg, "NOT_FOUND", { status: 404 });
      } catch (e) {
        if (e instanceof ObservatoryDataError) throw e;
        throw new ObservatoryDataError(
          "无法读取 docs-catalog",
          "NOT_FOUND",
          { status: 404 }
        );
      }
    }
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as DocsCatalogDocument;
  }

  async getDocsAiIndices(): Promise<DocsAiIndicesPayload> {
    return this.fetchWorkspaceJson<DocsAiIndicesPayload>(
      "/api/workspace/docs-ai-indices"
    );
  }

  async openWorkspaceFile(_relativePath: string): Promise<{ ok: boolean }> {
    console.warn(
      "[Observatory] openWorkspaceFile 仅在 VS Code Webview（Bridge）中可用。"
    );
    return { ok: false };
  }

  async getSessionList(): Promise<SessionIndex | null> {
    return this.fetchJson<SessionIndex>("/api/observatory/sessions-index");
  }

  async getSession(id: string): Promise<SessionDetail | null> {
    const safe = encodeURIComponent(id);
    return this.fetchJson<SessionDetail>(
      `/api/observatory/session/${safe}/meta`
    );
  }

  private emitConn(
    status: "connecting" | "connected" | "disconnected" | "error"
  ): void {
    const ev: UpdateEvent = { type: "connection", status };
    for (const cb of this.listeners) cb(ev);
  }

  private startPollFallback(): void {
    if (this.pollTimer || typeof window === "undefined") return;
    this.pollTimer = window.setInterval(() => {
      for (const cb of this.listeners) {
        cb({ type: "refresh", scope: "all" });
      }
    }, WS_POLL_FALLBACK_MS);
  }

  private stopPollFallback(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private scheduleWsReconnect(): void {
    if (typeof window === "undefined" || this.listeners.size === 0) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const exp = Math.min(
      WS_BACKOFF_MAX_MS,
      WS_BACKOFF_BASE_MS * Math.pow(2, this.wsReconnectAttempt)
    );
    this.wsReconnectAttempt += 1;
    const jitter = Math.random() * 400;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureWs();
    }, exp + jitter);
  }

  private ensureWs(): void {
    if (typeof window === "undefined") return;
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host =
        this.baseUrl === ""
          ? window.location.host
          : new URL(
              this.baseUrl.startsWith("http")
                ? this.baseUrl
                : `http://${this.baseUrl}`
            ).host;
      const wsUrl = `${proto}//${host}/ws/live`;
      this.emitConn("connecting");
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.wsReconnectAttempt = 0;
        this.stopPollFallback();
        this.emitConn("connected");
      };
      this.ws.onerror = () => this.emitConn("error");
      this.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as UpdateEvent;
          for (const cb of this.listeners) cb(data);
        } catch {
          for (const cb of this.listeners)
            cb({ type: "unknown", raw: ev.data });
        }
      };
      this.ws.onclose = () => {
        this.emitConn("disconnected");
        this.ws = null;
        if (this.listeners.size === 0) return;
        this.startPollFallback();
        this.scheduleWsReconnect();
      };
    } catch {
      this.ws = null;
      this.emitConn("error");
      this.startPollFallback();
      this.scheduleWsReconnect();
    }
  }

  onUpdate(callback: (event: UpdateEvent) => void): Unsubscribe {
    this.ensureWs();
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.stopPollFallback();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        try {
          this.ws?.close();
        } catch {
          /* ignore */
        }
        this.ws = null;
      }
    };
  }

  async triggerScan(): Promise<void> {
    console.warn(
      "[Observatory] triggerScan: Extension 命令尚未通过 HTTP 暴露，请在 IDE 中执行 Run Full Scan。"
    );
  }

  async scanSddFeature(featureName: string): Promise<void> {
    const url = this.apiUrl("/api/observatory/scan-sdd-feature");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ featureName }),
    });
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
  }

  async triggerTests(_capabilityId?: string): Promise<void> {
    console.warn(
      "[Observatory] triggerTests: 尚未通过 HTTP 暴露，后续 Phase 接入。"
    );
  }

  async updateCapability(
    id: string,
    updates: Partial<Capability>
  ): Promise<void> {
    const url = this.apiUrl("/api/observatory/capabilities");
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, updates }),
    });
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
  }

  private apiUrlWithFeature(
    path: string,
    feature: string
  ): string {
    const root = encodeURIComponent(this.requireRoot());
    const feat = encodeURIComponent(feature);
    const sep = path.includes("?") ? "&" : "?";
    return `${this.baseUrl}${path}${sep}root=${root}&feature=${feat}`;
  }

  async getSddConfig(feature: string): Promise<Record<string, unknown>> {
    const url = this.apiUrlWithFeature("/api/observatory/sdd-config", feature);
    const res = await fetch(url);
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  async saveSddConfig(
    feature: string,
    partial: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const url = this.apiUrlWithFeature("/api/observatory/sdd-config", feature);
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partial),
    });
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    const data = (await res.json()) as { config?: Record<string, unknown> };
    return data.config ?? {};
  }

  async getImpactAnalysis(feature: string): Promise<unknown | null> {
    const url = this.apiUrlWithFeature(
      "/api/observatory/impact-analysis",
      feature
    );
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return await res.json();
  }

  async saveImpactAnalysis(
    feature: string,
    body: unknown
  ): Promise<{ warnings?: string[] }> {
    const url = this.apiUrlWithFeature(
      "/api/observatory/impact-analysis",
      feature
    );
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let text = "";
      try {
        text = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, text);
    }
    try {
      const data = (await res.json()) as { warnings?: string[] };
      return { warnings: data.warnings };
    } catch {
      return {};
    }
  }

  async getTestCasesResult(feature: string): Promise<unknown | null> {
    const url = this.apiUrlWithFeature("/api/observatory/test-cases", feature);
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return await res.json();
  }

  async saveTestCasesResult(feature: string, body: unknown): Promise<void> {
    const url = this.apiUrlWithFeature("/api/observatory/test-cases", feature);
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let text = "";
      try {
        text = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, text);
    }
  }

  async getPromptTemplate(
    stage: string
  ): Promise<{ content: string; source: string }> {
    const safe = encodeURIComponent(stage);
    const url = this.apiUrl(`/api/observatory/prompt-template/${safe}`);
    const res = await fetch(url);
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as { content: string; source: string };
  }

  async getGitInfo(): Promise<{
    branch: string;
    headCommit: string;
    workingTreeFingerprint: string;
    lastCommitLine: string | null;
  }> {
    const url = this.apiUrl("/api/observatory/git-info");
    const res = await fetch(url);
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as {
      branch: string;
      headCommit: string;
      workingTreeFingerprint: string;
      lastCommitLine: string | null;
    };
  }

  async getReleaseDiff(): Promise<ReleaseDiffPayload> {
    const url = this.apiUrl("/api/observatory/release-diff");
    const res = await fetch(url);
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as ReleaseDiffPayload;
  }

  async getImpactAnalysisMd(feature: string): Promise<string | null> {
    const url = this.apiUrlWithFeature(
      "/api/observatory/impact-analysis-md",
      feature
    );
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    const data = (await res.json()) as { markdown?: string };
    return typeof data.markdown === "string" ? data.markdown : null;
  }

  async getTestCasesMd(feature: string): Promise<string | null> {
    const url = this.apiUrlWithFeature("/api/observatory/test-cases-md", feature);
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    const data = (await res.json()) as { markdown?: string };
    return typeof data.markdown === "string" ? data.markdown : null;
  }

  async getPreflight(stage: string): Promise<PreflightResult> {
    const root = encodeURIComponent(this.requireRoot());
    const st = encodeURIComponent(stage);
    const url = `${this.baseUrl}/api/observatory/preflight?root=${root}&stage=${st}`;
    const res = await fetch(url);
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as PreflightResult;
  }

  async getDeploySettings(): Promise<{
    defaultServiceList: string;
    cheetahMcpService: string;
  }> {
    const url = this.apiUrl("/api/observatory/deploy-settings");
    const res = await fetch(url);
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore */
      }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as {
      defaultServiceList: string;
      cheetahMcpService: string;
    };
  }

  // --- Release Workflow ---

  private _releaseTokenPromise: Promise<string | null> | null = null;

  /** 浏览器 fetch 无默认超时，挂起时发布页会一直停在「正在检查环境配置」 */
  private async fetchWithDeadline(
    url: string,
    init: RequestInit,
    deadlineMs: number
  ): Promise<Response> {
    if (init.signal) {
      return fetch(url, init);
    }
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), deadlineMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(tid);
    }
  }

  private invalidateReleaseToken(): void {
    const g = globalThis as unknown as { __OBSERVATORY_SESSION_TOKEN__?: string };
    delete g.__OBSERVATORY_SESSION_TOKEN__;
    this._releaseTokenPromise = null;
  }

  private async fetchReleaseSessionToken(): Promise<string | null> {
    try {
      const url = this.publicApiUrl("/api/release/session-token");
      const res = await this.fetchWithDeadline(url, {}, 15_000);
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      if (data.token) {
        const g = globalThis as unknown as { __OBSERVATORY_SESSION_TOKEN__?: string };
        g.__OBSERVATORY_SESSION_TOKEN__ = data.token;
      }
      return data.token ?? null;
    } catch {
      return null;
    }
  }

  private async ensureReleaseSessionToken(): Promise<string | null> {
    const g = globalThis as unknown as { __OBSERVATORY_SESSION_TOKEN__?: string };
    if (g.__OBSERVATORY_SESSION_TOKEN__) return g.__OBSERVATORY_SESSION_TOKEN__;

    if (!this._releaseTokenPromise) {
      this._releaseTokenPromise = this.fetchReleaseSessionToken().then((token) => {
        if (!token) this._releaseTokenPromise = null;
        return token;
      });
    }
    return this._releaseTokenPromise;
  }

  private async releaseHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...extra };
    const token = await this.ensureReleaseSessionToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  private async releaseFetchJson<T>(path: string, _retried = false): Promise<T | null> {
    const url = this.publicApiUrl(path);
    const res = await this.fetchWithDeadline(url, { headers: await this.releaseHeaders() }, 90_000);
    if (res.status === 403 && !_retried) {
      this.invalidateReleaseToken();
      return this.releaseFetchJson<T>(path, true);
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      let body = "";
      try {
        body = await res.text();
      } catch { /* ignore */ }
      throw ObservatoryDataError.fromHttpResponse(res.status, body);
    }
    return (await res.json()) as T;
  }

  private async releasePostJson<T>(path: string, body: unknown, _retried = false): Promise<T> {
    const url = this.publicApiUrl(path);
    const res = await this.fetchWithDeadline(url, {
      method: "POST",
      headers: await this.releaseHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }, 120_000);
    if (res.status === 403 && !_retried) {
      this.invalidateReleaseToken();
      return this.releasePostJson<T>(path, body, true);
    }
    if (!res.ok) {
      let text = "";
      try {
        text = await res.text();
      } catch { /* ignore */ }
      throw ObservatoryDataError.fromHttpResponse(res.status, text);
    }
    return (await res.json()) as T;
  }

  async getReleaseEnvStatus(): Promise<ReleaseEnvStatus> {
    const data = await this.releaseFetchJson<ReleaseEnvStatus>("/api/release/env-status");
    if (!data) throw new ObservatoryDataError("环境状态不可用", "RELEASE_ENV_ERROR");
    return data;
  }

  async listReleasePipelines(): Promise<PipelineInfo[]> {
    return (await this.releaseFetchJson<PipelineInfo[]>("/api/release/pipelines")) ?? [];
  }

  async listReleaseStageSummaries(): Promise<PipelineStageSummary[]> {
    return (await this.releaseFetchJson<PipelineStageSummary[]>("/api/release/pipeline-stage-summaries")) ?? [];
  }

  async getLatestPipelineRun(pipelineName: string): Promise<PipelineRunSummary | null> {
    const safe = encodeURIComponent(pipelineName);
    return this.releaseFetchJson<PipelineRunSummary>(`/api/release/pipelines/${safe}/latest-run`);
  }

  async getPipelineRunNodes(runId: string): Promise<PipelineNode[]> {
    const safe = encodeURIComponent(runId);
    return (await this.releaseFetchJson<PipelineNode[]>(`/api/release/pipeline-runs/${safe}/nodes`)) ?? [];
  }

  async listReleaseImages(repoName: string): Promise<ImageTag[]> {
    const safe = encodeURIComponent(repoName);
    return (await this.releaseFetchJson<ImageTag[]>(`/api/release/images/${safe}`)) ?? [];
  }

  async triggerReleaseDeploy(
    pipelineName: string,
    fullModuleName: string,
    imageTag: string,
    options?: { ksPipelineType?: string; includeCanaryDeployHeader?: boolean },
  ): Promise<{ runId: string }> {
    return this.releasePostJson<{ runId: string }>("/api/release/deploy", {
      pipelineName,
      fullModuleName,
      imageTag,
      ...options,
    });
  }

  async batchReleaseDeploy(
    request: BatchDeployRequest
  ): Promise<{ operationId: string; results: BatchOperationItemResult[] }> {
    return this.releasePostJson<{ operationId: string; results: BatchOperationItemResult[] }>(
      "/api/release/batch-deploy",
      request
    );
  }

  async getReleaseCanary(pipeline: string): Promise<CanaryDeployment | null> {
    const safe = encodeURIComponent(pipeline);
    return this.releaseFetchJson<CanaryDeployment>(`/api/release/canary/${safe}`);
  }

  async preCheckReleaseCanarySwitch(pipeline: string): Promise<CanarySwitchPreCheck> {
    const safe = encodeURIComponent(pipeline);
    const data = await this.releaseFetchJson<CanarySwitchPreCheck>(
      `/api/release/canary-switch-precheck/${safe}`
    );
    return data ?? { canSwitch: false, reason: "预检无返回" };
  }

  async shiftReleaseTraffic(
    pipeline: string,
    weights: Record<string, number>,
    meta?: unknown
  ): Promise<BatchOperationItemResult> {
    const safe = encodeURIComponent(pipeline);
    const url = this.publicApiUrl(`/api/release/canary/${safe}/shift`);
    const res = await fetch(url, {
      method: "POST",
      headers: await this.releaseHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ weights, meta }),
    });
    const text = await res.text();
    let parsed: BatchOperationItemResult | { code?: string; message?: string; detail?: BatchOperationItemResult } =
      { pipeline, status: "failed", message: text };
    try {
      if (text) parsed = JSON.parse(text) as typeof parsed;
    } catch {
      /* use default */
    }
    if (!res.ok) {
      const msg =
        typeof parsed === "object" && parsed && "message" in parsed && typeof parsed.message === "string"
          ? parsed.message
          : text;
      throw ObservatoryDataError.fromHttpResponse(res.status, msg);
    }
    return parsed as BatchOperationItemResult;
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
    await this.releasePostJson<{ ok: boolean }>("/api/release/pipeline-input", {
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
    return this.releasePostJson<{ operationId: string; results: BatchOperationItemResult[] }>(
      "/api/release/batch-traffic-shift",
      request
    );
  }

  async getReleaseTrafficLogs(pipeline: string): Promise<TrafficChangeLog[]> {
    const safe = encodeURIComponent(pipeline);
    return (await this.releaseFetchJson<TrafficChangeLog[]>(`/api/release/traffic-logs/${safe}`)) ?? [];
  }

  async checkReleaseRollback(
    module: string,
    image: string
  ): Promise<{ canRollback: boolean; reason?: string }> {
    const m = encodeURIComponent(module);
    const img = encodeURIComponent(image);
    const data = await this.releaseFetchJson<{ canRollback: boolean; reason?: string }>(
      `/api/release/rollback-check?module=${m}&image=${img}`
    );
    return data ?? { canRollback: false, reason: "接口不可用" };
  }
}
