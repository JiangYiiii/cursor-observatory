/**
 * Local HTTP + WebSocket for browser dashboard.
 * primary_doc: docs/EXTENSION_DESIGN.md §七, docs/ARCHITECTURE.md §4.2
 */
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as http from "node:http";
import * as path from "node:path";
import express from "express";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";
import type { TestExpectations } from "../observatory/types";
import type { ObservatoryStore } from "../observatory/store";
import { loadPromptTemplate } from "../observatory/prompt-template-loader";
import {
  readObservatorySddConfigMerged,
  writeObservatorySddConfigMerged,
} from "../observatory/observatory-sdd-config";
import { observatorySddJsonAbs, sddFeatureObservatoryDirAbs } from "../observatory/sdd-test-paths";
import {
  processImpactAnalysis,
  processTestCases,
  readImpactAnalysisMarkdownForFeature,
} from "../observatory/validation-pipeline";
import { runSingleSddFeatureScan } from "../scanners/project-scanner";
import { getDataModelAiPromptMarkdown } from "../observatory/project-onboarding";
import { findAvailablePort } from "./port-utils";
import { getGitInfoSummary } from "../observatory/git-info-summary";
import { runPreflight } from "../observatory/preflight-resolver";

export type GetStore = (workspaceRoot: string) => ObservatoryStore | undefined;

/** 供 HTTP 仪表盘读取与 VS Code「部署默认服务」等一致的设置 */
export type GetDeployExtensionSettings = (workspaceRoot: string) => {
  defaultServiceList: string;
  cheetahMcpService: string;
};

export class LocalServer {
  private httpServer?: http.Server;
  private wss?: WebSocketServer;
  private clients = new Set<WebSocket>();
  /** 绑定成功后的实际端口（可能与配置起始端口不同） */
  private actualPort: number;

  constructor(
    private readonly requestedPort: number,
    private readonly getStore: GetStore,
    private readonly webviewDist: string | undefined,
    /** 已注册的多根工作区路径（供 Dashboard 项目切换） */
    private readonly listWorkspaceRoots?: () => string[],
    private readonly getDeployExtensionSettings?: GetDeployExtensionSettings
  ) {
    this.actualPort = requestedPort;
  }

  get listenPort(): number {
    return this.actualPort;
  }

  broadcast(event: Record<string, unknown>): void {
    const payload = JSON.stringify(event);
    for (const c of this.clients) {
      if (c.readyState === 1) c.send(payload);
    }
  }

  async start(): Promise<void> {
    if (this.httpServer) return;

    const app = express();
    app.use(express.json({ limit: "2mb" }));

    app.use((req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
    });

    const sendJson = (res: express.Response, data: unknown, code = 200) => {
      res.status(code).type("json").send(JSON.stringify(data));
    };

    app.get("/api/observatory/git-info", (req, res) => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      void (async () => {
        try {
          const data = await getGitInfoSummary(workspaceRoot);
          sendJson(res, data);
        } catch (e) {
          err(res, "GIT_FAILED", String(e), 500);
        }
      })();
    });

    app.get("/api/observatory/preflight", (req, res) => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const stage = String(req.query.stage ?? "analyze");
      if (!/^[\w-]+$/.test(stage) || stage.length > 64) {
        err(res, "BAD_REQUEST", "invalid ?stage=", 400);
        return;
      }
      void (async () => {
        try {
          const data = await runPreflight(workspaceRoot, stage, {
            id: "",
            sdd: {},
          });
          sendJson(res, data);
        } catch (e) {
          err(res, "PREFLIGHT_FAILED", String(e), 500);
        }
      })();
    });

    app.get("/api/observatory/workspace-roots", (_req, res) => {
      const raw = this.listWorkspaceRoots?.() ?? [];
      const roots = [...new Set(raw.map((p) => path.normalize(p)))].sort();
      sendJson(res, { roots });
    });

    app.get("/api/observatory/data-model-ai-prompt", (_req, res) => {
      sendJson(res, { markdown: getDataModelAiPromptMarkdown() });
    });

    const err = (
      res: express.Response,
      code: string,
      message: string,
      status: number,
      detail?: unknown
    ) => {
      sendJson(
        res,
        {
          code,
          message,
          detail: detail ?? {},
          retryable: status >= 500,
        },
        status
      );
    };

    const pickRoot = (req: express.Request): string | undefined => {
      const raw = req.query.root ?? req.query.path;
      if (typeof raw === "string" && raw.length > 0) {
        return decodeURIComponent(raw);
      }
      return undefined;
    };

    const pickFeature = (req: express.Request): string | undefined => {
      const raw = req.query.feature ?? req.query.featureName;
      if (typeof raw !== "string" || raw.length === 0 || raw.length > 256) {
        return undefined;
      }
      if (raw.includes("..") || /[/\\]/.test(raw)) {
        return undefined;
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(raw)) {
        return undefined;
      }
      return raw;
    };

    const safeUnderRoot = (
      workspaceRoot: string,
      candidate: string
    ): boolean => {
      const normRoot = path.resolve(workspaceRoot);
      const norm = path.resolve(candidate);
      return norm === normRoot || norm.startsWith(normRoot + path.sep);
    };

    const readObs = async (
      req: express.Request,
      res: express.Response,
      relativeJson: string
    ): Promise<void> => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const store = this.getStore(path.normalize(root));
      if (!store) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      try {
        const data = await store.readJsonIfExists(relativeJson);
        if (data === null) {
          err(res, "NOT_FOUND", relativeJson, 404);
          return;
        }
        sendJson(res, data);
      } catch (e) {
        err(res, "READ_FAILED", String(e), 500, { path: relativeJson });
      }
    };

    app.get("/api/observatory/manifest", (req, res) =>
      void readObs(req, res, "manifest.json")
    );
    app.get("/api/observatory/architecture", (req, res) =>
      void readObs(req, res, "architecture.json")
    );
    app.get("/api/observatory/capabilities", (req, res) =>
      void readObs(req, res, "capabilities.json")
    );
    app.get("/api/observatory/progress", (req, res) =>
      void readObs(req, res, "progress.json")
    );
    app.get("/api/observatory/data-models", (req, res) =>
      void readObs(req, res, "data-models.json")
    );
    app.get("/api/observatory/ai-sessions", (req, res) =>
      void readObs(req, res, "ai-sessions.json")
    );
    app.get("/api/observatory/test-results", (req, res) => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const store = this.getStore(path.normalize(root));
      if (!store) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      void (async () => {
        try {
          const data = await store.readTestResultsIfExists();
          if (data === null) {
            err(res, "NOT_FOUND", "report.json", 404);
            return;
          }
          sendJson(res, data);
        } catch (e) {
          err(res, "READ_FAILED", String(e), 500, { path: "report.json" });
        }
      })();
    });
    app.get("/api/observatory/test-mapping", (req, res) =>
      void readObs(req, res, "test-mapping.json")
    );
    app.get("/api/observatory/test-expectations", (req, res) =>
      void readObs(req, res, "test-expectations.json")
    );

    app.put("/api/observatory/test-expectations", (req, res) => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const store = this.getStore(path.normalize(root));
      if (!store) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const body = req.body as TestExpectations;
      if (!body || typeof body !== "object" || typeof body.schema_version !== "string") {
        err(res, "BAD_REQUEST", "invalid test-expectations body", 400);
        return;
      }
      void (async () => {
        try {
          await store.writeTestExpectations(body);
          this.broadcast({ type: "refresh", scope: "tests" });
          sendJson(res, { ok: true });
        } catch (e) {
          err(res, "WRITE_FAILED", String(e), 500, {
            path: "test-expectations.json",
          });
        }
      })();
    });

    app.get("/api/observatory/sdd-config", (req, res) => {
      const root = pickRoot(req);
      const feature = pickFeature(req);
      if (!root || !feature) {
        err(res, "BAD_REQUEST", "missing ?root= or ?feature=", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      const store = this.getStore(workspaceRoot);
      if (!store) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const fp = observatorySddJsonAbs(workspaceRoot, feature);
      if (!safeUnderRoot(workspaceRoot, fp)) {
        err(res, "BAD_REQUEST", "invalid path", 400);
        return;
      }
      void (async () => {
        try {
          const doc = await readObservatorySddConfigMerged(workspaceRoot, feature);
          sendJson(res, doc);
        } catch {
          sendJson(res, {});
        }
      })();
    });

    app.put("/api/observatory/sdd-config", (req, res) => {
      const root = pickRoot(req);
      const feature = pickFeature(req);
      if (!root || !feature) {
        err(res, "BAD_REQUEST", "missing ?root= or ?feature=", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      const store = this.getStore(workspaceRoot);
      if (!store) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const body = req.body as Record<string, unknown>;
      if (!body || typeof body !== "object") {
        err(res, "BAD_REQUEST", "invalid body", 400);
        return;
      }
      const fp = observatorySddJsonAbs(workspaceRoot, feature);
      if (!safeUnderRoot(workspaceRoot, fp)) {
        err(res, "BAD_REQUEST", "invalid path", 400);
        return;
      }
      void (async () => {
        try {
          const prev = await readObservatorySddConfigMerged(workspaceRoot, feature);
          const next = { ...prev, ...body };
          await writeObservatorySddConfigMerged(workspaceRoot, feature, next);
          this.broadcast({ type: "refresh", scope: "capabilities" });
          sendJson(res, { ok: true, config: next });
        } catch (e) {
          err(res, "WRITE_FAILED", String(e), 500, { path: "observatory-sdd.json" });
        }
      })();
    });

    app.get("/api/observatory/deploy-settings", (req, res) => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const get = this.getDeployExtensionSettings;
      if (!get) {
        sendJson(res, { defaultServiceList: "", cheetahMcpService: "" });
        return;
      }
      sendJson(res, get(workspaceRoot));
    });

    app.get("/api/observatory/impact-analysis", (req, res) => {
      const root = pickRoot(req);
      const feature = pickFeature(req);
      if (!root || !feature) {
        err(res, "BAD_REQUEST", "missing ?root= or ?feature=", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const fp = path.join(
        sddFeatureObservatoryDirAbs(workspaceRoot, feature),
        "impact-analysis.json"
      );
      if (!safeUnderRoot(workspaceRoot, fp)) {
        err(res, "BAD_REQUEST", "invalid path", 400);
        return;
      }
      void (async () => {
        try {
          const text = await fsp.readFile(fp, "utf8");
          sendJson(res, JSON.parse(text) as unknown);
        } catch {
          err(res, "NOT_FOUND", "impact-analysis.json", 404);
        }
      })();
    });

    app.get("/api/observatory/impact-analysis-md", (req, res) => {
      const root = pickRoot(req);
      const feature = pickFeature(req);
      if (!root || !feature) {
        err(res, "BAD_REQUEST", "missing ?root= or ?feature=", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const fp = path.join(
        sddFeatureObservatoryDirAbs(workspaceRoot, feature),
        "impact-analysis.md"
      );
      if (!safeUnderRoot(workspaceRoot, fp)) {
        err(res, "BAD_REQUEST", "invalid path", 400);
        return;
      }
      void (async () => {
        try {
          const markdown = await readImpactAnalysisMarkdownForFeature(
            workspaceRoot,
            feature
          );
          if (markdown === null) {
            err(res, "NOT_FOUND", "impact-analysis.md", 404);
            return;
          }
          sendJson(res, { markdown });
        } catch {
          err(res, "NOT_FOUND", "impact-analysis.md", 404);
        }
      })();
    });

    app.get("/api/observatory/test-cases-md", (req, res) => {
      const root = pickRoot(req);
      const feature = pickFeature(req);
      if (!root || !feature) {
        err(res, "BAD_REQUEST", "missing ?root= or ?feature=", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const fp = path.join(
        sddFeatureObservatoryDirAbs(workspaceRoot, feature),
        "test-cases.md"
      );
      if (!safeUnderRoot(workspaceRoot, fp)) {
        err(res, "BAD_REQUEST", "invalid path", 400);
        return;
      }
      void (async () => {
        try {
          const markdown = await fsp.readFile(fp, "utf8");
          sendJson(res, { markdown });
        } catch {
          err(res, "NOT_FOUND", "test-cases.md", 404);
        }
      })();
    });

    app.put("/api/observatory/impact-analysis", (req, res) => {
      const root = pickRoot(req);
      const feature = pickFeature(req);
      if (!root || !feature) {
        err(res, "BAD_REQUEST", "missing ?root= or ?feature=", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      void (async () => {
        try {
          const result = await processImpactAnalysis(
            workspaceRoot,
            feature,
            req.body
          );
          if (!result.ok) {
            err(res, "VALIDATION_FAILED", result.errors?.join("; ") ?? "validation failed", 400, {
              errors: result.errors,
            });
            return;
          }
          this.broadcast({ type: "refresh", scope: "all" });
          sendJson(res, {
            ok: true,
            ...(result.warnings?.length ? { warnings: result.warnings } : {}),
          });
        } catch (e) {
          err(res, "WRITE_FAILED", String(e), 500);
        }
      })();
    });

    app.get("/api/observatory/test-cases", (req, res) => {
      const root = pickRoot(req);
      const feature = pickFeature(req);
      if (!root || !feature) {
        err(res, "BAD_REQUEST", "missing ?root= or ?feature=", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const fp = path.join(
        sddFeatureObservatoryDirAbs(workspaceRoot, feature),
        "test-cases.json"
      );
      if (!safeUnderRoot(workspaceRoot, fp)) {
        err(res, "BAD_REQUEST", "invalid path", 400);
        return;
      }
      void (async () => {
        try {
          const text = await fsp.readFile(fp, "utf8");
          sendJson(res, JSON.parse(text) as unknown);
        } catch {
          err(res, "NOT_FOUND", "test-cases.json", 404);
        }
      })();
    });

    app.put("/api/observatory/test-cases", (req, res) => {
      const root = pickRoot(req);
      const feature = pickFeature(req);
      if (!root || !feature) {
        err(res, "BAD_REQUEST", "missing ?root= or ?feature=", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      void (async () => {
        try {
          const result = await processTestCases(workspaceRoot, feature, req.body);
          if (!result.ok) {
            err(res, "VALIDATION_FAILED", result.errors?.join("; ") ?? "validation failed", 400, {
              errors: result.errors,
            });
            return;
          }
          this.broadcast({ type: "refresh", scope: "all" });
          sendJson(res, { ok: true });
        } catch (e) {
          err(res, "WRITE_FAILED", String(e), 500);
        }
      })();
    });

    app.get("/api/observatory/prompt-template/:stage", (req, res) => {
      const root = pickRoot(req);
      const stage = req.params.stage;
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      if (typeof stage !== "string" || !/^[\w-]+$/.test(stage)) {
        err(res, "BAD_REQUEST", "invalid stage", 400);
        return;
      }
      const workspaceRoot = path.normalize(root);
      if (!this.getStore(workspaceRoot)) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      void (async () => {
        try {
          const { content, source } = await loadPromptTemplate(workspaceRoot, stage);
          sendJson(res, { content, source });
        } catch (e) {
          err(res, "READ_FAILED", String(e), 500);
        }
      })();
    });

    app.post("/api/observatory/scan-sdd-feature", (req, res) => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const store = this.getStore(path.normalize(root));
      if (!store) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const body = req.body as { featureName?: string };
      const fn = body?.featureName;
      if (typeof fn !== "string" || fn.length === 0 || fn.length > 256) {
        err(res, "BAD_REQUEST", "body.featureName required", 400);
        return;
      }
      if (fn.includes("..") || /[/\\]/.test(fn)) {
        err(res, "BAD_REQUEST", "invalid featureName", 400);
        return;
      }
      void (async () => {
        try {
          await runSingleSddFeatureScan(path.normalize(root), store, fn);
          this.broadcast({ type: "refresh", scope: "capabilities" });
          sendJson(res, { ok: true });
        } catch (e) {
          err(res, "SCAN_FAILED", String(e), 500, { op: "scanSddFeature" });
        }
      })();
    });

    app.put("/api/observatory/capabilities", (req, res) => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const store = this.getStore(path.normalize(root));
      if (!store) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const body = req.body as { id?: string; updates?: Record<string, unknown> };
      if (!body?.id || typeof body.id !== "string") {
        err(res, "BAD_REQUEST", "body.id required", 400);
        return;
      }
      const capId = body.id;
      void (async () => {
        try {
          await store.patchCapability(capId, body.updates ?? {});
          this.broadcast({ type: "refresh", scope: "capabilities" });
          sendJson(res, { ok: true });
        } catch (e) {
          err(res, "WRITE_FAILED", String(e), 500, { op: "patchCapability" });
        }
      })();
    });
    app.get("/api/observatory/docs-health", (req, res) =>
      void readObs(req, res, "docs-health.json")
    );
    app.get("/api/observatory/sessions-index", (req, res) =>
      void readObs(req, res, path.join("sessions", "index.json"))
    );
    app.get("/api/observatory/session/:sessionId/meta", (req, res) => {
      const sid = req.params.sessionId;
      if (!/^[\w.-]+$/.test(sid)) {
        err(res, "BAD_REQUEST", "invalid session id", 400);
        return;
      }
      void readObs(req, res, path.join("sessions", sid, "meta.json"));
    });

    app.get("/api/observatory/test-history", async (req, res) => {
      const root = pickRoot(req);
      if (!root) {
        err(res, "BAD_REQUEST", "missing ?root= workspace path", 400);
        return;
      }
      const store = this.getStore(path.normalize(root));
      if (!store) {
        err(res, "NOT_FOUND", "workspace not registered", 404);
        return;
      }
      const fp = path.join(store.observatoryPath, "test-history.jsonl");
      try {
        const text = await fsp.readFile(fp, "utf8");
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        const out: unknown[] = [];
        for (const line of lines) {
          try {
            out.push(JSON.parse(line));
          } catch {
            /* skip */
          }
        }
        sendJson(res, out);
      } catch {
        sendJson(res, []);
      }
    });

    if (this.webviewDist && fs.existsSync(this.webviewDist)) {
      app.use(express.static(this.webviewDist));
    }

    app.use((req, res) => {
      err(res, "NOT_FOUND", req.path, 404);
    });

    const port = await findAvailablePort(this.requestedPort, 10);
    this.actualPort = port;

    this.httpServer = http.createServer(app);
    this.wss = new WebSocketServer({ server: this.httpServer, path: "/ws/live" });
    this.wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
    });

    await new Promise<void>((resolve, reject) => {
      const srv = this.httpServer!;
      srv.once("error", reject);
      srv.listen(port, "127.0.0.1", () => {
        srv.removeListener("error", reject);
        resolve();
      });
    });
  }

  stop(): void {
    this.clients.clear();
    this.wss?.close();
    this.wss = undefined;
    this.httpServer?.close();
    this.httpServer = undefined;
  }

  get address(): string {
    return `http://127.0.0.1:${this.actualPort}`;
  }
}
