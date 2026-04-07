/**
 * Webview postMessage ↔ ObservatoryStore 读路径（与 webview-ui `CursorBridgeDataSource` 协议一致）。
 * primary_doc: docs/FRONTEND_DESIGN.md §2.1, docs/EXTENSION_DESIGN.md §七
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  ObservatoryError,
  observatoryErrorFromUnknown,
  type ObservatoryErrorPayload,
} from "../observatory/errors";
import { getDataModelAiPromptMarkdown } from "../observatory/project-onboarding";
import type { ObservatoryStore } from "../observatory/store";
import { runSingleSddFeatureScan } from "../scanners/project-scanner";
import type { TestExpectations } from "../observatory/types";

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
  getStore: GetObservatoryStore
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

  const store = getStore(path.normalize(rootRaw));
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
    const data = await dispatch(store, method, params);
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
  params?: Record<string, unknown>
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
    case "triggerScan":
    case "triggerTests":
      throw new Error(`method not implemented in bridge: ${method}`);
    default:
      throw new Error(`unknown method: ${method}`);
  }
}
