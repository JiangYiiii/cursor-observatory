/**
 * 全局 Observatory 数据：全量加载、按 scope 刷新、实时订阅。
 * primary_doc: docs/FRONTEND_DESIGN.md §五, docs/ARCHITECTURE.md §4.1
 */
import { create } from "zustand";
import type { IDataSource } from "@/services/idata-source";
import {
  getDataSource,
  resetDataSourceForWorkspace,
} from "@/services/data-source-instance";
import { getWorkspaceRootFromLocation } from "@/services/env";
import {
  mergeCapabilitiesWithLocalPhases,
  writeLocalPhaseOverride,
} from "@/lib/capability-phase-local";
import { ObservatoryDataError } from "@/services/errors";
import type {
  AiSession,
  Architecture,
  Capability,
  CapabilityPhase,
  DataModels,
  DocsHealth,
  Manifest,
  Progress,
  SessionIndex,
  TestExpectations,
  TestHistoryEntry,
  TestMapping,
  TestResults,
  UpdateEvent,
} from "@/types/observatory";

export type WsConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type RefreshScope =
  | "all"
  | "manifest"
  | "architecture"
  | "capabilities"
  | "progress"
  | "tests"
  | "ai"
  | "models"
  | "docs"
  | "sessions";

interface ObservatoryState {
  isLoading: boolean;
  loadError: string | null;
  wsStatus: WsConnectionStatus;
  /** 当前数据对应的本地工作区根路径（与 `?root=` 一致，可切换） */
  activeWorkspaceRoot: string;

  manifest: Manifest | null;
  architecture: Architecture | null;
  capabilities: Capability[];
  progress: Progress | null;
  testResults: TestResults | null;
  testMapping: TestMapping | null;
  testExpectations: TestExpectations | null;
  testHistory: TestHistoryEntry[];
  aiSessions: AiSession[];
  dataModels: DataModels | null;
  docsHealth: DocsHealth | null;
  sessionIndex: SessionIndex | null;

  _unsub?: () => void;

  loadAll: () => Promise<void>;
  refresh: (scope?: RefreshScope) => Promise<void>;
  disposeLive: () => void;
  /** 多根工作区：切换到另一项目并重新拉取数据 */
  switchWorkspace: (workspaceRoot: string) => Promise<void>;
  /** 拖拽或编辑后更新能力阶段（先本地，再异步持久化） */
  setCapabilityPhase: (id: string, phase: CapabilityPhase) => void;
}

export const useObservatoryStore = create<ObservatoryState>((set, get) => {
  async function patchFromScope(
    ds: IDataSource,
    scope: RefreshScope | undefined
  ): Promise<void> {
    const s: RefreshScope = scope ?? "all";

    const run = async (cond: boolean, fn: () => Promise<void>) => {
      if (cond) await fn();
    };

    await run(s === "all" || s === "manifest", async () => {
      const manifest = await ds.getManifest();
      set({ manifest });
    });
    await run(s === "all" || s === "architecture", async () => {
      const architecture = await ds.getArchitecture();
      set({ architecture });
    });
    await run(s === "all" || s === "capabilities", async () => {
      const raw = await ds.getCapabilities();
      const root = get().activeWorkspaceRoot || getWorkspaceRootFromLocation();
      const capabilities = mergeCapabilitiesWithLocalPhases(raw, root);
      set({ capabilities });
    });
    await run(s === "all" || s === "progress", async () => {
      const progress = await ds.getProgress();
      set({ progress });
    });
    await run(s === "all" || s === "tests", async () => {
      const [testResults, testMapping, testExpectations, testHistory] =
        await Promise.all([
          ds.getTestResults(),
          ds.getTestMapping(),
          ds.getTestExpectations(),
          ds.getTestHistory(),
        ]);
      set({
        testResults,
        testMapping,
        testExpectations,
        testHistory,
      });
    });
    await run(s === "all" || s === "ai", async () => {
      const aiSessions = await ds.getAiSessions();
      set({ aiSessions });
    });
    await run(s === "all" || s === "models", async () => {
      const dataModels = await ds.getDataModels();
      set({ dataModels });
    });
    await run(s === "all" || s === "docs", async () => {
      const docsHealth = await ds.getDocsHealth();
      set({ docsHealth });
    });
    await run(s === "all" || s === "sessions", async () => {
      const sessionIndex = await ds.getSessionList();
      set({ sessionIndex });
    });
  }

  function handleLiveEvent(ev: UpdateEvent): void {
    if (ev.type === "connection" && typeof ev.status === "string") {
      const st = ev.status as WsConnectionStatus;
      if (
        st === "connecting" ||
        st === "connected" ||
        st === "disconnected" ||
        st === "error"
      ) {
        set({ wsStatus: st });
      }
    }

    if (ev.type === "refresh") {
      const raw = ev.scope;
      const scope: RefreshScope | undefined =
        raw === undefined || raw === null || raw === "all"
          ? undefined
          : typeof raw === "string"
            ? (raw as RefreshScope)
            : undefined;
      void patchFromScope(getDataSource(), scope);
    }
  }

  return {
    isLoading: false,
    loadError: null,
    wsStatus: "idle",
    activeWorkspaceRoot: getWorkspaceRootFromLocation() ?? "",

    manifest: null,
    architecture: null,
    capabilities: [],
    progress: null,
    testResults: null,
    testMapping: null,
    testExpectations: null,
    testHistory: [],
    aiSessions: [],
    dataModels: null,
    docsHealth: null,
    sessionIndex: null,

    loadAll: async () => {
      const ds = getDataSource();
      set({ isLoading: true, loadError: null });
      try {
        const rootForMerge =
          getWorkspaceRootFromLocation() ?? "";
        const [
          manifest,
          architecture,
          capabilitiesRaw,
          progress,
          testResults,
          testMapping,
          testExpectations,
          testHistory,
          aiSessions,
          dataModels,
          docsHealth,
          sessionIndex,
        ] = await Promise.all([
          ds.getManifest(),
          ds.getArchitecture(),
          ds.getCapabilities(),
          ds.getProgress(),
          ds.getTestResults(),
          ds.getTestMapping(),
          ds.getTestExpectations(),
          ds.getTestHistory(),
          ds.getAiSessions(),
          ds.getDataModels(),
          ds.getDocsHealth(),
          ds.getSessionList(),
        ]);

        const capabilities = mergeCapabilitiesWithLocalPhases(
          capabilitiesRaw,
          rootForMerge || null
        );

        set({
          manifest,
          architecture,
          capabilities,
          progress,
          testResults,
          testMapping,
          testExpectations,
          testHistory,
          aiSessions,
          dataModels,
          docsHealth,
          sessionIndex,
          isLoading: false,
          loadError: null,
        });

        get()._unsub?.();
        const unsub = ds.onUpdate(handleLiveEvent);
        set({ _unsub: unsub });
      } catch (e) {
        const msg =
          e instanceof ObservatoryDataError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        set({ isLoading: false, loadError: msg });
      }
    },

    refresh: async (scope) => {
      try {
        await patchFromScope(getDataSource(), scope);
      } catch {
        /* 保持旧数据 */
      }
    },

    disposeLive: () => {
      get()._unsub?.();
      set({ _unsub: undefined, wsStatus: "idle" });
    },

    switchWorkspace: async (workspaceRoot: string) => {
      if (!workspaceRoot || workspaceRoot === get().activeWorkspaceRoot) {
        return;
      }
      get().disposeLive();
      resetDataSourceForWorkspace(workspaceRoot);
      if (typeof window !== "undefined") {
        const u = new URL(window.location.href);
        u.searchParams.set("root", workspaceRoot);
        window.history.replaceState(
          null,
          "",
          `${u.pathname}${u.search}${u.hash}`
        );
      }
      set({ activeWorkspaceRoot: workspaceRoot });
      await get().loadAll();
    },

    setCapabilityPhase: (id, phase) => {
      const { capabilities, activeWorkspaceRoot } = get();
      const root =
        activeWorkspaceRoot || getWorkspaceRootFromLocation();
      const iso = new Date().toISOString();
      const next = capabilities.map((c) =>
        c.id === id
          ? { ...c, phase, updatedAt: iso, updated_at: iso }
          : c
      );
      set({ capabilities: next });
      writeLocalPhaseOverride(root, id, phase);
      void getDataSource()
        .updateCapability(id, { phase })
        .catch(() => {
          /* 已写入本地；Bridge 无 workspace 或 API 失败时仍保留看板状态 */
        });
    },
  };
});
