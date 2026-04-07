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
import { runSingleSddFeatureScan } from "../scanners/project-scanner";
import { getDataModelAiPromptMarkdown } from "../observatory/project-onboarding";
import { findAvailablePort } from "./port-utils";

export type GetStore = (workspaceRoot: string) => ObservatoryStore | undefined;

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
    private readonly listWorkspaceRoots?: () => string[]
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
