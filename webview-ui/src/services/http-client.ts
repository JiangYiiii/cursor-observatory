/**
 * 浏览器 / 同域静态托管：REST + WebSocket。
 * primary_doc: docs/FRONTEND_DESIGN.md §2.2, docs/ARCHITECTURE.md §4.2
 */
import type {
  AiSession,
  AiSessionsDocument,
  Architecture,
  Capability,
  CapabilitiesDocument,
  DataModels,
  DocsHealth,
  Manifest,
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
}
