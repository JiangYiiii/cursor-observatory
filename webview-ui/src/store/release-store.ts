/**
 * 生产发布流程 Zustand Store。
 * primary_doc: docs/RELEASE_WORKFLOW_DESIGN.md §7.6, §10, §11
 */
import { create } from "zustand";
import { getDataSource } from "@/services/data-source-instance";
import { buildCanaryTrafficWeights } from "@/lib/canary-traffic-weights";
import type {
  BatchDeployRequest,
  BatchOperationItemResult,
  BatchTrafficShiftRequest,
  CanaryDeployment,
  CanarySwitchPreCheck,
  ImageTag,
  PipelineInfo,
  PipelineNode,
  PipelineStageSummary,
  ReleaseApiError,
  ReleaseEnvStatus,
} from "@/types/observatory";

// ─── Poll Intervals ───

const POLL_INTERVALS = {
  stageSummariesIdle: 60_000,
  stageSummariesActive: 30_000,
  activeRunNodes: 15_000,
  canaryState: 30_000,
  postBatchBurst: 10_000,
};

const POST_BATCH_BURST_DURATION = 3 * 60_000;
const UPSTREAM_FAILURE_THRESHOLD = 3;

// ─── PollController ───

class PollController {
  private controllers = new Map<string, AbortController>();
  private inflightKeys = new Set<string>();

  async fetch(key: string, fetcher: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.inflightKeys.has(key)) return;
    this.controllers.get(key)?.abort();
    const controller = new AbortController();
    this.controllers.set(key, controller);
    this.inflightKeys.add(key);
    try {
      await fetcher(controller.signal);
    } finally {
      this.inflightKeys.delete(key);
      if (this.controllers.get(key) === controller) {
        this.controllers.delete(key);
      }
    }
  }

  abort(key: string): void {
    this.controllers.get(key)?.abort();
  }

  abortAll(): void {
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
    this.inflightKeys.clear();
  }
}

// ─── Store Types ───

interface ReleaseLoadingState {
  envStatus: boolean;
  pipelines: boolean;
  images: boolean;
  deploying: boolean;
  shifting: boolean;
}

interface ReleaseErrorState {
  envStatus: ReleaseApiError | null;
  pipelines: ReleaseApiError | null;
  nodes: ReleaseApiError | null;
  images: ReleaseApiError | null;
  deploy: ReleaseApiError | null;
  shift: ReleaseApiError | null;
}

interface UpstreamHealth {
  cicdReachable: boolean;
  cicdFailures: number;
  releaseOrderReachable: boolean;
  releaseOrderFailures: number;
}

interface ReleaseState {
  envStatus: ReleaseEnvStatus | null;

  pipelines: PipelineInfo[];
  selectedPipelines: string[];
  /** 展开进度时间线的流水线（可多选） */
  expandedPipelines: string[];
  stageSummaries: Record<string, PipelineStageSummary>;
  pipelineSearch: string;
  pipelineGroupBy: "type" | "none" | "blue_green";
  pipelineSortBy: "name" | "attention";
  /** 仅在选择目标镜像后生效：列表只显示该镜像可部署的流水线 */
  pipelineFilterDeployableOnly: boolean;

  runNodesByPipeline: Record<string, PipelineNode[]>;
  pipelineNodesLoading: Record<string, boolean>;

  images: Record<string, ImageTag[]>;
  imageIndex: Record<string, string[]>;
  selectedImage: string;

  canaryStates: Record<string, CanaryDeployment>;
  /** 切流预检（preStepCanarySwitchStatus） */
  trafficPrecheckByPipeline: Record<string, CanarySwitchPreCheck | null>;
  trafficPrecheckLoading: boolean;

  lastPipelinesRefresh: number | null;
  lastImagesRefresh: number | null;

  loading: ReleaseLoadingState;
  errors: ReleaseErrorState;
  upstreamHealth: UpstreamHealth;

  batchOperationInProgress: boolean;
  batchProgress: { completed: number; total: number } | null;

  loadEnvStatus: () => Promise<void>;
  loadPipelines: () => Promise<void>;
  loadStageSummaries: () => Promise<void>;
  loadPipelineNodes: (runId: string, pipelineName: string) => Promise<void>;
  loadImages: (repoName: string) => Promise<void>;
  loadAllImages: () => Promise<void>;
  loadCanaryState: (pipeline: string) => Promise<void>;
  refreshTrafficPrecheckForPipelines: (pipelineNames: string[]) => Promise<void>;
  prepareBatchTrafficDialog: (pipelineNames: string[]) => Promise<void>;
  submitPipelineRunInput: (
    pipelineName: string,
    runId: string,
    nodeId: string,
    stepId: string,
    inputId: string,
    abort: boolean,
    jenkinsBuildId?: string
  ) => Promise<void>;

  manualRefreshPipelines: () => Promise<void>;
  manualRefreshImages: () => Promise<void>;

  setPipelineSearch: (keyword: string) => void;
  setPipelineGroupBy: (groupBy: "type" | "none" | "blue_green") => void;
  setPipelineSortBy: (sortBy: "name" | "attention") => void;
  setPipelineFilterDeployableOnly: (value: boolean) => void;

  togglePipelineSelection: (name: string) => void;
  selectAllDeployable: () => void;
  deselectAllPipelines: () => void;
  toggleExpandedPipeline: (name: string) => void;
  setSelectedImage: (tag: string) => void;

  triggerDeploy: (pipeline: string, fullModuleName: string, imageTag: string) => Promise<void>;
  batchDeploy: () => Promise<{ operationId: string; results: BatchOperationItemResult[] }>;
  shiftTraffic: (pipeline: string, weights: Record<string, number>) => Promise<void>;
  batchShiftTraffic: (targetGreenPercent: number) => Promise<{ operationId: string; results: BatchOperationItemResult[] }>;
  cancelBatchOperation: () => void;

  startPolling: () => void;
  stopPolling: () => void;

  getPipelineDeployability: (pipelineName: string) => { deployable: boolean; reason?: string };
  compatSummary: { deployable: number; total: number };
}

// ─── Helpers ───

function toApiError(e: unknown): ReleaseApiError {
  if (e && typeof e === "object" && "code" in e) return e as ReleaseApiError;
  const message = e instanceof Error ? e.message : String(e);
  return { code: "NETWORK_ERROR", message };
}

function computeImageIndex(images: Record<string, ImageTag[]>): Record<string, string[]> {
  const idx: Record<string, string[]> = {};
  for (const [repo, tags] of Object.entries(images)) {
    idx[repo] = tags.map((t) => t.tag);
  }
  return idx;
}

function computeCompatSummary(
  pipelines: PipelineInfo[],
  imageIndex: Record<string, string[]>,
  selectedImage: string
): { deployable: number; total: number } {
  if (!selectedImage) return { deployable: pipelines.length, total: pipelines.length };
  let deployable = 0;
  for (const p of pipelines) {
    const tags = imageIndex[p.repoName];
    if (tags && tags.includes(selectedImage)) deployable++;
  }
  return { deployable, total: pipelines.length };
}

/** 开启「仅可部署」筛选时，移除非兼容流水线的展开状态与缓存节点 */
function pruneExpandedForSelectedImage(
  expandedPipelines: string[],
  runNodesByPipeline: Record<string, PipelineNode[]>,
  pipelineNodesLoading: Record<string, boolean>,
  pipelines: PipelineInfo[],
  imageIndex: Record<string, string[]>,
  selectedImage: string
): {
  expandedPipelines: string[];
  runNodesByPipeline: Record<string, PipelineNode[]>;
  pipelineNodesLoading: Record<string, boolean>;
} {
  const allowed = new Set(
    pipelines
      .filter((p) => imageIndex[p.repoName]?.includes(selectedImage))
      .map((p) => p.name)
  );
  const nextExpanded = expandedPipelines.filter((n) => allowed.has(n));
  const nextNodes = { ...runNodesByPipeline };
  const nextLoading = { ...pipelineNodesLoading };
  for (const n of expandedPipelines) {
    if (!allowed.has(n)) {
      delete nextNodes[n];
      delete nextLoading[n];
    }
  }
  return {
    expandedPipelines: nextExpanded,
    runNodesByPipeline: nextNodes,
    pipelineNodesLoading: nextLoading,
  };
}

// ─── Store ───

export const useReleaseStore = create<ReleaseState>((set, get) => {
  const pollController = new PollController();
  let pollTimers: ReturnType<typeof setInterval>[] = [];
  let lastBatchFinishedAt = 0;

  function hasRunningPipeline(): boolean {
    const { stageSummaries } = get();
    return Object.values(stageSummaries).some(
      (s) => s.stageType === "deploying" || s.stageType === "waiting_release"
        || s.stageType === "waiting_gray_confirm" || s.stageType === "waiting_bluegreen_switch"
        || s.stageType === "waiting_manual"
    );
  }

  function getPollInterval(): number {
    if (Date.now() - lastBatchFinishedAt < POST_BATCH_BURST_DURATION) {
      return POLL_INTERVALS.postBatchBurst;
    }
    return hasRunningPipeline()
      ? POLL_INTERVALS.stageSummariesActive
      : POLL_INTERVALS.stageSummariesIdle;
  }

  function recordCicdSuccess(): void {
    set((s) => ({
      upstreamHealth: { ...s.upstreamHealth, cicdReachable: true, cicdFailures: 0 },
    }));
  }

  function recordCicdFailure(): void {
    set((s) => {
      const failures = s.upstreamHealth.cicdFailures + 1;
      return {
        upstreamHealth: {
          ...s.upstreamHealth,
          cicdFailures: failures,
          cicdReachable: failures < UPSTREAM_FAILURE_THRESHOLD,
        },
      };
    });
  }

  /* recordReleaseOrderSuccess / recordReleaseOrderFailure reserved for future release-order API health tracking */

  return {
    envStatus: null,
    pipelines: [],
    selectedPipelines: [],
    expandedPipelines: [],
    stageSummaries: {},
    pipelineSearch: "",
    pipelineGroupBy: "blue_green",
    pipelineSortBy: "attention",
    pipelineFilterDeployableOnly: false,

    runNodesByPipeline: {},
    pipelineNodesLoading: {},

    images: {},
    imageIndex: {},
    selectedImage: "",

    canaryStates: {},
    trafficPrecheckByPipeline: {},
    trafficPrecheckLoading: false,

    lastPipelinesRefresh: null,
    lastImagesRefresh: null,

    loading: {
      envStatus: false,
      pipelines: false,
      images: false,
      deploying: false,
      shifting: false,
    },
    errors: {
      envStatus: null,
      pipelines: null,
      nodes: null,
      images: null,
      deploy: null,
      shift: null,
    },
    upstreamHealth: {
      cicdReachable: true,
      cicdFailures: 0,
      releaseOrderReachable: true,
      releaseOrderFailures: 0,
    },

    batchOperationInProgress: false,
    batchProgress: null,

    compatSummary: { deployable: 0, total: 0 },

    // ─── Data Loading Actions ───

    loadEnvStatus: async () => {
      set((s) => ({ loading: { ...s.loading, envStatus: true }, errors: { ...s.errors, envStatus: null } }));
      try {
        const ds = getDataSource();
        const envStatus = await ds.getReleaseEnvStatus();
        set((s) => ({ envStatus, loading: { ...s.loading, envStatus: false } }));
      } catch (e) {
        set((s) => ({
          loading: { ...s.loading, envStatus: false },
          errors: { ...s.errors, envStatus: toApiError(e) },
        }));
      }
    },

    loadPipelines: async () => {
      set((s) => ({ loading: { ...s.loading, pipelines: true }, errors: { ...s.errors, pipelines: null } }));
      try {
        const ds = getDataSource();
        await pollController.fetch("pipelines", async () => {
          const pipelines = await ds.listReleasePipelines();
          const { imageIndex, selectedImage } = get();
          set((s) => ({
            pipelines,
            loading: { ...s.loading, pipelines: false },
            compatSummary: computeCompatSummary(pipelines, imageIndex, selectedImage),
          }));
        });
        recordCicdSuccess();
      } catch (e) {
        recordCicdFailure();
        set((s) => ({
          loading: { ...s.loading, pipelines: false },
          errors: { ...s.errors, pipelines: toApiError(e) },
        }));
      }
    },

    loadStageSummaries: async () => {
      try {
        const ds = getDataSource();
        await pollController.fetch("stageSummaries", async () => {
          const list = await ds.listReleaseStageSummaries();
          const map: Record<string, PipelineStageSummary> = {};
          for (const s of list) {
            map[s.pipelineName] = s;
          }
          set({ stageSummaries: map });
        });
        recordCicdSuccess();
      } catch {
        recordCicdFailure();
      }
    },

    loadPipelineNodes: async (runId: string, pipelineName: string) => {
      set((s) => ({
        pipelineNodesLoading: { ...s.pipelineNodesLoading, [pipelineName]: true },
        errors: { ...s.errors, nodes: null },
      }));
      try {
        const ds = getDataSource();
        await pollController.fetch(`nodes:${pipelineName}`, async () => {
          const nodes = await ds.getPipelineRunNodes(runId);
          set((s) => ({
            runNodesByPipeline: { ...s.runNodesByPipeline, [pipelineName]: nodes },
            pipelineNodesLoading: { ...s.pipelineNodesLoading, [pipelineName]: false },
          }));
        });
        recordCicdSuccess();
      } catch (e) {
        recordCicdFailure();
        set((s) => ({
          pipelineNodesLoading: { ...s.pipelineNodesLoading, [pipelineName]: false },
          errors: { ...s.errors, nodes: toApiError(e) },
        }));
      }
    },

    loadImages: async (repoName: string) => {
      set((s) => ({ loading: { ...s.loading, images: true }, errors: { ...s.errors, images: null } }));
      try {
        const ds = getDataSource();
        const tags = await ds.listReleaseImages(repoName);
        set((s) => {
          const images = { ...s.images, [repoName]: tags };
          const imageIndex = computeImageIndex(images);
          return {
            images,
            imageIndex,
            loading: { ...s.loading, images: false },
            compatSummary: computeCompatSummary(s.pipelines, imageIndex, s.selectedImage),
          };
        });
        recordCicdSuccess();
      } catch (e) {
        recordCicdFailure();
        set((s) => ({
          loading: { ...s.loading, images: false },
          errors: { ...s.errors, images: toApiError(e) },
        }));
      }
    },

    loadAllImages: async () => {
      const { pipelines } = get();
      const repos = [...new Set(pipelines.map((p) => p.repoName))];
      set((s) => ({ loading: { ...s.loading, images: true }, errors: { ...s.errors, images: null } }));
      try {
        const ds = getDataSource();
        const results = await Promise.all(
          repos.map((repo) => ds.listReleaseImages(repo).then((tags) => [repo, tags] as const))
        );
        set((s) => {
          const images = { ...s.images };
          for (const [repo, tags] of results) {
            images[repo] = tags;
          }
          const imageIndex = computeImageIndex(images);
          return {
            images,
            imageIndex,
            loading: { ...s.loading, images: false },
            compatSummary: computeCompatSummary(s.pipelines, imageIndex, s.selectedImage),
          };
        });
        recordCicdSuccess();
      } catch (e) {
        recordCicdFailure();
        set((s) => ({
          loading: { ...s.loading, images: false },
          errors: { ...s.errors, images: toApiError(e) },
        }));
      }
    },

    loadCanaryState: async (pipeline: string) => {
      try {
        const ds = getDataSource();
        const canary = await ds.getReleaseCanary(pipeline);
        if (canary) {
          set((s) => ({ canaryStates: { ...s.canaryStates, [pipeline]: canary } }));
        }
        recordCicdSuccess();
      } catch {
        recordCicdFailure();
      }
    },

    refreshTrafficPrecheckForPipelines: async (pipelineNames: string[]) => {
      if (pipelineNames.length === 0) return;
      set({ trafficPrecheckLoading: true });
      const ds = getDataSource();
      const next: Record<string, CanarySwitchPreCheck | null> = {
        ...get().trafficPrecheckByPipeline,
      };
      try {
        await Promise.all(
          pipelineNames.map(async (name) => {
            try {
              next[name] = await ds.preCheckReleaseCanarySwitch(name);
            } catch {
              next[name] = { canSwitch: false, reason: "预检请求失败" };
            }
          }),
        );
        set({ trafficPrecheckByPipeline: next, trafficPrecheckLoading: false });
        recordCicdSuccess();
      } catch {
        recordCicdFailure();
        set({ trafficPrecheckLoading: false });
      }
    },

    prepareBatchTrafficDialog: async (pipelineNames: string[]) => {
      const { loadCanaryState, refreshTrafficPrecheckForPipelines } = get();
      await Promise.all(pipelineNames.map((p) => loadCanaryState(p)));
      await refreshTrafficPrecheckForPipelines(pipelineNames);
    },

    submitPipelineRunInput: async (pipelineName, runId, nodeId, stepId, inputId, abort, jenkinsBuildId) => {
      set((s) => ({ errors: { ...s.errors, nodes: null } }));
      try {
        const ds = getDataSource();
        await ds.submitReleasePipelineRunInput(
          pipelineName,
          runId,
          nodeId,
          stepId,
          inputId,
          abort,
          jenkinsBuildId,
        );
        await get().loadPipelineNodes(runId, pipelineName);
        void get().loadStageSummaries();
        recordCicdSuccess();
      } catch (e) {
        recordCicdFailure();
        set((s) => ({ errors: { ...s.errors, nodes: toApiError(e) } }));
        throw e;
      }
    },

    // ─── Manual Refresh Actions ───

    manualRefreshPipelines: async () => {
      const { loadPipelines, loadStageSummaries } = get();
      await Promise.all([loadPipelines(), loadStageSummaries()]);
      set({ lastPipelinesRefresh: Date.now() });
    },

    manualRefreshImages: async () => {
      const { loadAllImages } = get();
      await loadAllImages();
      set({ lastImagesRefresh: Date.now() });
    },

    // ─── Search / Group / Sort ───

    setPipelineSearch: (keyword) => set({ pipelineSearch: keyword }),
    setPipelineGroupBy: (groupBy) => set({ pipelineGroupBy: groupBy }),
    setPipelineSortBy: (sortBy) => set({ pipelineSortBy: sortBy }),
    setPipelineFilterDeployableOnly: (value) =>
      set((s) => {
        if (!value || !s.selectedImage) {
          return { pipelineFilterDeployableOnly: value };
        }
        const pruned = pruneExpandedForSelectedImage(
          s.expandedPipelines,
          s.runNodesByPipeline,
          s.pipelineNodesLoading,
          s.pipelines,
          s.imageIndex,
          s.selectedImage
        );
        return { pipelineFilterDeployableOnly: value, ...pruned };
      }),

    // ─── Selection ───

    togglePipelineSelection: (name) => {
      set((s) => {
        const has = s.selectedPipelines.includes(name);
        return {
          selectedPipelines: has
            ? s.selectedPipelines.filter((n) => n !== name)
            : [...s.selectedPipelines, name],
        };
      });
    },

    selectAllDeployable: () => {
      const { pipelines, imageIndex, selectedImage } = get();
      if (!selectedImage) {
        set({ selectedPipelines: pipelines.map((p) => p.name) });
        return;
      }
      const deployable = pipelines
        .filter((p) => {
          const tags = imageIndex[p.repoName];
          return tags && tags.includes(selectedImage);
        })
        .map((p) => p.name);
      set({ selectedPipelines: deployable });
    },

    deselectAllPipelines: () => set({ selectedPipelines: [] }),

    toggleExpandedPipeline: (name) =>
      set((s) => {
        if (s.expandedPipelines.includes(name)) {
          const nextNodes = { ...s.runNodesByPipeline };
          delete nextNodes[name];
          const nextLoading = { ...s.pipelineNodesLoading };
          delete nextLoading[name];
          return {
            expandedPipelines: s.expandedPipelines.filter((n) => n !== name),
            runNodesByPipeline: nextNodes,
            pipelineNodesLoading: nextLoading,
          };
        }
        return { expandedPipelines: [...s.expandedPipelines, name] };
      }),

    setSelectedImage: (tag) => {
      set((s) => {
        const newSelected = tag
          ? s.selectedPipelines.filter((name) => {
              const p = s.pipelines.find((pp) => pp.name === name);
              if (!p) return false;
              const tags = s.imageIndex[p.repoName];
              return tags && tags.includes(tag);
            })
          : s.selectedPipelines;
        const pipelineFilterDeployableOnly = tag ? s.pipelineFilterDeployableOnly : false;
        let extra: Partial<ReleaseState> = {};
        if (tag && pipelineFilterDeployableOnly) {
          extra = pruneExpandedForSelectedImage(
            s.expandedPipelines,
            s.runNodesByPipeline,
            s.pipelineNodesLoading,
            s.pipelines,
            s.imageIndex,
            tag
          );
        }
        return {
          selectedImage: tag,
          selectedPipelines: newSelected,
          compatSummary: computeCompatSummary(s.pipelines, s.imageIndex, tag),
          pipelineFilterDeployableOnly,
          ...extra,
        };
      });
    },

    // ─── Deploy & Traffic ───

    triggerDeploy: async (pipeline, fullModuleName, imageTag) => {
      set((s) => ({ loading: { ...s.loading, deploying: true }, errors: { ...s.errors, deploy: null } }));
      try {
        const ds = getDataSource();
        const p = get().pipelines.find((x) => x.name === pipeline);
        await ds.triggerReleaseDeploy(pipeline, fullModuleName, imageTag, {
          ksPipelineType: p?.ksPipelineType,
        });
        set((s) => ({ loading: { ...s.loading, deploying: false } }));
        recordCicdSuccess();
      } catch (e) {
        recordCicdFailure();
        set((s) => ({
          loading: { ...s.loading, deploying: false },
          errors: { ...s.errors, deploy: toApiError(e) },
        }));
        throw e;
      }
    },

    batchDeploy: async () => {
      const { selectedPipelines, pipelines, selectedImage, imageIndex } = get();
      const operationId = crypto.randomUUID();
      const deployItems = selectedPipelines
        .map((name) => pipelines.find((p) => p.name === name))
        .filter((p): p is PipelineInfo => {
          if (!p) return false;
          if (!selectedImage) return true;
          const tags = imageIndex[p.repoName];
          return !!tags && tags.includes(selectedImage);
        });

      set((s) => ({
        batchOperationInProgress: true,
        batchProgress: { completed: 0, total: deployItems.length },
        loading: { ...s.loading, deploying: true },
        errors: { ...s.errors, deploy: null },
      }));

      const request: BatchDeployRequest = {
        operationId,
        pipelines: deployItems.map((p) => ({
          pipelineName: p.name,
          fullModuleName: p.fullModuleName,
          imageTag: selectedImage,
          deployOrder: p.deployOrder,
          ksPipelineType: p.ksPipelineType,
        })),
      };

      try {
        const ds = getDataSource();
        const result = await ds.batchReleaseDeploy(request);
        lastBatchFinishedAt = Date.now();
        set((s) => ({
          batchOperationInProgress: false,
          batchProgress: null,
          loading: { ...s.loading, deploying: false },
        }));
        recordCicdSuccess();
        return result;
      } catch (e) {
        recordCicdFailure();
        const err = toApiError(e);
        set((s) => ({
          batchOperationInProgress: false,
          batchProgress: null,
          loading: { ...s.loading, deploying: false },
          errors: { ...s.errors, deploy: err },
        }));
        return { operationId, results: [] };
      }
    },

    shiftTraffic: async (pipeline, weights) => {
      set((s) => ({ loading: { ...s.loading, shifting: true }, errors: { ...s.errors, shift: null } }));
      try {
        const ds = getDataSource();
        const { pipelines: allPipelines, canaryStates } = get();
        const pInfo = allPipelines.find((p) => p.name === pipeline);
        const cs = canaryStates[pipeline];
        const meta = cs
          ? {
              devopsProject: "",
              module: pInfo?.moduleName ?? "",
              env: "prod",
              blueVersion: cs.blueVersion ?? "",
              greenVersion: cs.greenVersion ?? "",
              pipelineRunId: "",
              jenkinsBuildId: "",
              beforeBlue: cs.blueWeight ?? 0,
              beforeGreen: cs.greenWeight ?? 0,
            }
          : undefined;
        await ds.shiftReleaseTraffic(pipeline, weights, meta);
        const canary = await ds.getReleaseCanary(pipeline);
        if (canary) {
          set((s) => ({
            canaryStates: { ...s.canaryStates, [pipeline]: canary },
            loading: { ...s.loading, shifting: false },
          }));
        } else {
          set((s) => ({ loading: { ...s.loading, shifting: false } }));
        }
        recordCicdSuccess();
      } catch (e) {
        recordCicdFailure();
        set((s) => ({
          loading: { ...s.loading, shifting: false },
          errors: { ...s.errors, shift: toApiError(e) },
        }));
        throw e;
      }
    },

    batchShiftTraffic: async (targetGreenPercent) => {
      const { selectedPipelines, pipelines, canaryStates } = get();
      const operationId = crypto.randomUUID();

      const canaryPipelines = selectedPipelines
        .map((name) => pipelines.find((p) => p.name === name))
        .filter((p): p is PipelineInfo => !!p && p.hasCanary);

      set((s) => ({
        batchOperationInProgress: true,
        batchProgress: { completed: 0, total: canaryPipelines.length },
        loading: { ...s.loading, shifting: true },
        errors: { ...s.errors, shift: null },
      }));

      const bluePercent = 100 - targetGreenPercent;
      const request: BatchTrafficShiftRequest = {
        operationId,
        shifts: canaryPipelines.map((p) => {
          const cs = canaryStates[p.name];
          const weights = buildCanaryTrafficWeights(cs, bluePercent, targetGreenPercent);
          return {
            pipeline: p.name,
            namespace: cs?.namespace ?? "",
            deploymentName: cs?.name ?? "",
            cluster: cs?.cluster ?? "",
            weights,
            meta: {
              devopsProject: "",
              module: p.moduleName,
              env: "prod",
              blueVersion: cs?.blueVersion ?? "",
              greenVersion: cs?.greenVersion ?? "",
              pipelineRunId: "",
              jenkinsBuildId: "",
              beforeBlue: cs?.blueWeight ?? 0,
              beforeGreen: cs?.greenWeight ?? 0,
            },
          };
        }),
      };

      try {
        const ds = getDataSource();
        const result = await ds.batchShiftReleaseTraffic(request);
        lastBatchFinishedAt = Date.now();
        set((s) => ({
          batchOperationInProgress: false,
          batchProgress: null,
          loading: { ...s.loading, shifting: false },
        }));
        recordCicdSuccess();
        return result;
      } catch (e) {
        recordCicdFailure();
        const err = toApiError(e);
        set((s) => ({
          batchOperationInProgress: false,
          batchProgress: null,
          loading: { ...s.loading, shifting: false },
          errors: { ...s.errors, shift: err },
        }));
        return { operationId, results: [] };
      }
    },

    cancelBatchOperation: () => {
      set({
        batchOperationInProgress: false,
        batchProgress: null,
      });
    },

    // ─── Polling ───

    startPolling: () => {
      const store = get();
      store.stopPolling();

      const tick = () => {
        if (get().batchOperationInProgress) return;
        void get().loadStageSummaries();

        const { expandedPipelines, stageSummaries, pipelines } = get();
        const manualNames = pipelines
          .filter((p) => {
            const st = stageSummaries[p.name];
            return Boolean(st?.requiresManualAction && st?.runId);
          })
          .map((p) => p.name);
        const refreshNodeTimelines = [...new Set([...expandedPipelines, ...manualNames])];
        for (const pipelineName of refreshNodeTimelines) {
          const stage = stageSummaries[pipelineName];
          if (stage?.runId) {
            void get().loadPipelineNodes(stage.runId, pipelineName);
          }
        }
      };

      tick();

      const stageTimer = setInterval(() => {
        const interval = getPollInterval();
        tick();
        if (interval !== POLL_INTERVALS.stageSummariesIdle) {
          /* already handled by dynamic check */
        }
      }, getPollInterval());

      pollTimers.push(stageTimer);
    },

    stopPolling: () => {
      for (const t of pollTimers) clearInterval(t);
      pollTimers = [];
      pollController.abortAll();
    },

    // ─── Computed ───

    getPipelineDeployability: (pipelineName) => {
      const { pipelines, imageIndex, selectedImage } = get();
      if (!selectedImage) return { deployable: true };
      const p = pipelines.find((pp) => pp.name === pipelineName);
      if (!p) return { deployable: false, reason: "流水线不存在" };
      const tags = imageIndex[p.repoName];
      if (!tags || !tags.includes(selectedImage)) {
        return {
          deployable: false,
          reason: `镜像 ${selectedImage} 在仓库 ${p.repoName} 中不存在`,
        };
      }
      return { deployable: true };
    },
  };
});
