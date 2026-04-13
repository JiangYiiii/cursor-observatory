/**
 * 发布流程业务处理层 — 聚合 CicdApiClient 调用，为 local-server 路由和 bridge 方法提供统一入口。
 * primary_doc: docs/RELEASE_WORKFLOW_DESIGN.md §5, §6, §9, §10
 */
import * as vscode from "vscode";
import * as fs from "node:fs";
import { CicdApiClient } from "./cicd-api-client";
import {
  PipelineInfo,
  PipelineStageSummary,
  PipelineNode,
  PipelineRunSummary,
  ImageTag,
  CanaryDeployment,
  TrafficChangeLog,
  ReleaseEnvStatus,
  BatchDeployRequest,
  BatchTrafficShiftRequest,
  BatchOperationItemResult,
  ReleaseOrderDetail,
  CanarySwitchPreCheck,
  StageInferenceRule,
  DEFAULT_STAGE_INFERENCE_RULES,
  parsePipelineName,
  BatchExecutionConfig,
  PipelineMetadataEntry,
  validateTrafficWeights,
  pipelineNeedsCicdCanaryDeployHeader,
  resolveIncludeCanaryDeployHeader,
} from "./release-types";

const SECRET_KEY = "observatory.release.cicdToken";

interface ReleaseConfig {
  cicdBaseUrl: string;
  devopsProject: string;
  workspace: string;
  cluster: string;
  project: string;
  operator: string;
  pipelineFilter: string;
  batchConcurrency: number;
  autoPolling: boolean;
  notifications: "all" | "errors-only" | "none";
  stageInferenceRules: StageInferenceRule[];
  pipelineMetadataMap: Record<string, PipelineMetadataEntry>;
}

/** 将 CicdApiClient 抛出的 API_ERROR 的 detail（响应体）拼进 message，便于排查 4xx/5xx */
function formatCicdRequestError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const base = e.message;
  const detail = (e as Error & { detail?: unknown }).detail;
  if (detail === undefined || detail === null) return base;
  let extra: string;
  if (typeof detail === "string") {
    extra = detail;
  } else if (typeof detail === "object" && detail !== null) {
    const o = detail as Record<string, unknown>;
    if (typeof o.message === "string") {
      extra = o.message;
    } else {
      try {
        extra = JSON.stringify(detail);
      } catch {
        extra = String(detail);
      }
    }
  } else {
    extra = String(detail);
  }
  const trimmed = extra.length > 1800 ? `${extra.slice(0, 1800)}…` : extra;
  return `${base} · ${trimmed}`;
}

// ────────────────────────────────────────────
// Simple concurrency limiter (p-limit style)
// ────────────────────────────────────────────
function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    if (queue.length > 0 && active < concurrency) {
      active++;
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        fn().then(
          (val) => {
            active--;
            resolve(val);
            next();
          },
          (err) => {
            active--;
            reject(err);
            next();
          },
        );
      };
      queue.push(run);
      next();
    });
}

export class ReleaseHandler {
  private readonly secrets: vscode.SecretStorage;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.secrets = context.secrets;
  }

  // ──────────── Config helpers ────────────

  getConfig(): ReleaseConfig {
    const cfg = vscode.workspace.getConfiguration("observatory.release");
    return {
      cicdBaseUrl: cfg.get<string>("cicdBaseUrl", "https://cicd.fintopia.tech"),
      devopsProject: cfg.get<string>("devopsProject", "cash-loanjqjjq"),
      workspace: cfg.get<string>("workspace", "cashloan"),
      cluster: cfg.get<string>("cluster", "prod"),
      project: cfg.get<string>("project", "cash-loan"),
      operator: cfg.get<string>("operator", ""),
      pipelineFilter: cfg.get<string>("pipelineFilter", "prod"),
      batchConcurrency: cfg.get<number>("batchConcurrency", 3),
      autoPolling: cfg.get<boolean>("autoPolling", true),
      notifications: cfg.get<"all" | "errors-only" | "none">("notifications", "all"),
      stageInferenceRules: cfg.get<StageInferenceRule[]>("stageInferenceRules", DEFAULT_STAGE_INFERENCE_RULES),
      pipelineMetadataMap: cfg.get<Record<string, PipelineMetadataEntry>>("pipelineMetadataMap", {}),
    };
  }

  // ──────────── Token management (SecretStorage) ────────────

  async getCicdToken(): Promise<string | undefined> {
    return this.secrets.get(SECRET_KEY);
  }

  async setCicdToken(token: string): Promise<void> {
    await this.secrets.store(SECRET_KEY, token);
  }

  async clearCicdToken(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
  }

  // ──────────── Environment status ────────────

  async getEnvStatus(): Promise<ReleaseEnvStatus> {
    const config = this.getConfig();
    const token = await this.getCicdToken();
    const issues: string[] = [];

    if (!token) issues.push("CICD Token 未配置");
    if (!config.cicdBaseUrl) issues.push("CICD Base URL 未配置");
    if (!config.devopsProject) issues.push("DevOps Project 未配置");
    if (!config.operator) issues.push("操作人标识未配置");

    let tokenValid = false;
    let lastTokenCheckAt: string | undefined;

    if (token && config.cicdBaseUrl && config.devopsProject) {
      try {
        const client = this.createClientWith(token);
        // 缩短超时、不重试，避免发布页「环境检查」长时间挂起（默认 GET 会多路重试 + 30s 超时）
        await client.listPipelines(config.pipelineFilter, 1, 1, undefined, {
          timeoutMs: 12_000,
          retries: 0,
          fetchAllPages: false,
        });
        tokenValid = true;
        lastTokenCheckAt = new Date().toISOString();
      } catch {
        issues.push("Token 健康检查失败（可能已过期或网络不可达）");
        lastTokenCheckAt = new Date().toISOString();
      }
    }

    return {
      configured: issues.length === 0,
      tokenSet: !!token,
      tokenValid,
      baseUrlValid: !!config.cicdBaseUrl,
      devopsProject: config.devopsProject,
      workspace: config.workspace,
      cluster: config.cluster,
      project: config.project,
      operator: config.operator,
      issues,
      lastTokenCheckAt,
    };
  }

  // ──────────── Client factory ────────────

  async createClient(): Promise<CicdApiClient> {
    const token = await this.getCicdToken();
    if (!token) {
      throw new Error("CICD Token 未配置，请先运行 'Observatory: Set CICD Token' 命令");
    }
    return this.createClientWith(token);
  }

  private createClientWith(token: string): CicdApiClient {
    const cfg = this.getConfig();
    return new CicdApiClient(
      cfg.cicdBaseUrl,
      token,
      cfg.devopsProject,
      cfg.workspace,
      cfg.cluster,
      cfg.project,
    );
  }

  // ──────────── Pipeline operations ────────────

  async listPipelines(): Promise<PipelineInfo[]> {
    const client = await this.createClient();
    const cfg = this.getConfig();
    const raw = await client.listPipelines(cfg.pipelineFilter);
    const metaMap = cfg.pipelineMetadataMap;

    return raw.map((p) => {
      const meta = metaMap[p.name];
      if (meta) {
        return {
          ...p,
          moduleName: meta.moduleName ?? p.moduleName,
          fullModuleName: meta.fullModuleName ?? p.fullModuleName,
          repoName: meta.repoName ?? p.repoName,
          pipelineType: meta.pipelineType ?? p.pipelineType,
          hasCanary: meta.hasCanary ?? p.hasCanary,
          ksPipelineType: meta.ksPipelineType ?? p.ksPipelineType,
          deployOrder: meta.deployOrder ?? p.deployOrder,
          mappingSource: "config" as const,
        };
      }
      const parsed = parsePipelineName(p.name);
      return {
        ...p,
        moduleName: p.moduleName || parsed.moduleName,
        fullModuleName: p.fullModuleName || parsed.moduleName,
        repoName: p.repoName || parsed.repoName,
        pipelineType: p.pipelineType !== "unknown" ? p.pipelineType : parsed.pipelineType,
        hasCanary: p.hasCanary,
        mappingSource: "inferred" as const,
      };
    });
  }

  async listStageSummaries(): Promise<PipelineStageSummary[]> {
    const pipelines = await this.listPipelines();
    const client = await this.createClient();
    const cfg = this.getConfig();
    const rules = cfg.stageInferenceRules;

    const summaries: PipelineStageSummary[] = [];

    for (const p of pipelines) {
      try {
        const latestRun = await client.getLatestPipelineRun(p.name);
        if (!latestRun) {
          summaries.push({
            pipelineName: p.name,
            stageType: "idle",
            stageLabel: "空闲",
            requiresManualAction: false,
            updatedAt: new Date().toISOString(),
          });
          continue;
        }

        if (latestRun.status === "succeeded") {
          summaries.push({
            pipelineName: p.name,
            runId: latestRun.id,
            jenkinsBuildId: latestRun.jenkinsBuildId,
            stageType: "succeeded",
            stageLabel: "已完成",
            requiresManualAction: false,
            updatedAt: new Date().toISOString(),
          });
          continue;
        }

        if (latestRun.status === "failed") {
          summaries.push({
            pipelineName: p.name,
            runId: latestRun.id,
            jenkinsBuildId: latestRun.jenkinsBuildId,
            stageType: "failed",
            stageLabel: "失败",
            requiresManualAction: false,
            updatedAt: new Date().toISOString(),
          });
          continue;
        }

        if (latestRun.status === "aborted") {
          summaries.push({
            pipelineName: p.name,
            runId: latestRun.id,
            jenkinsBuildId: latestRun.jenkinsBuildId,
            stageType: "aborted",
            stageLabel: "已中止",
            requiresManualAction: false,
            updatedAt: new Date().toISOString(),
          });
          continue;
        }

        const nodes = await client.getPipelineRunNodes(latestRun.id);
        const inferred = inferStage(nodes, rules);
        summaries.push({
          pipelineName: p.name,
          runId: latestRun.id,
          jenkinsBuildId: latestRun.jenkinsBuildId,
          currentNodeName: inferred.currentNodeName,
          ...inferred,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        const hint = formatCicdRequestError(e);
        const short = hint.length > 160 ? `${hint.slice(0, 160)}…` : hint;
        summaries.push({
          pipelineName: p.name,
          stageType: "unknown",
          stageLabel: `获取状态失败 · ${short}`,
          requiresManualAction: false,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return summaries;
  }

  async getLatestRun(pipelineName: string): Promise<PipelineRunSummary | null> {
    const client = await this.createClient();
    return client.getLatestPipelineRun(pipelineName);
  }

  async getRunNodes(runId: string): Promise<PipelineNode[]> {
    const client = await this.createClient();
    return client.getPipelineRunNodes(runId);
  }

  async preCheckCanarySwitch(pipeline: string): Promise<CanarySwitchPreCheck> {
    const client = await this.createClient();
    const cfg = this.getConfig();
    return client.preCheckCanarySwitchStatus(cfg.devopsProject, pipeline, cfg.cluster);
  }

  async submitPipelineRunInput(
    pipelineName: string,
    runId: string,
    nodeId: string,
    stepId: string,
    inputId: string,
    abort: boolean,
    jenkinsBuildId?: string,
  ): Promise<void> {
    const client = await this.createClient();
    let pathRunId = jenkinsBuildId?.trim();
    if (!pathRunId) {
      const forThisRun = await client.getPipelineRunByRunName(runId, pipelineName);
      pathRunId = forThisRun?.jenkinsBuildId?.trim();
    }
    if (!pathRunId) {
      const latest = await client.getLatestPipelineRun(pipelineName);
      pathRunId = latest?.jenkinsBuildId?.trim();
    }
    await client.submitPipelineRunInput(
      pipelineName,
      runId,
      nodeId,
      stepId,
      inputId,
      abort,
      pathRunId || undefined,
    );
  }

  // ──────────── Image operations ────────────

  async listImages(repoName: string): Promise<ImageTag[]> {
    const client = await this.createClient();
    return client.listImageTags(repoName);
  }

  // ──────────── Deploy operations ────────────

  async triggerDeploy(
    pipelineName: string,
    fullModuleName: string,
    imageTag: string,
    options?: { includeCanaryDeployHeader?: boolean; ksPipelineType?: string },
  ): Promise<{ runId: string }> {
    const client = await this.createClient();
    const cfg = this.getConfig();
    const includeCanaryDeployHeader =
      options?.includeCanaryDeployHeader !== undefined
        ? options.includeCanaryDeployHeader
        : pipelineNeedsCicdCanaryDeployHeader({
            name: pipelineName,
            ksPipelineType: options?.ksPipelineType,
          });
    return client.triggerCdPipeline(pipelineName, {
      projectName: cfg.project,
      moduleName: fullModuleName,
      buildEnv: cfg.cluster,
      imageTag,
      includeCanaryDeployHeader,
    });
  }

  async batchDeploy(
    request: BatchDeployRequest,
  ): Promise<{ operationId: string; results: BatchOperationItemResult[] }> {
    const cfg = this.getConfig();
    const concurrency = cfg.batchConcurrency;
    const limit = pLimit(concurrency);
    const abortController = new AbortController();
    const { signal } = abortController;

    const grouped = groupByDeployOrder(request.pipelines);
    const results: BatchOperationItemResult[] = [];

    for (const group of grouped) {
      if (signal.aborted) {
        for (const item of group) {
          results.push({
            pipeline: item.pipelineName,
            status: "cancelled",
            message: "用户取消",
          });
        }
        continue;
      }

      const groupResults = await Promise.all(
        group.map((item) =>
          limit(async (): Promise<BatchOperationItemResult> => {
            if (signal.aborted) {
              return {
                pipeline: item.pipelineName,
                status: "cancelled",
                message: "用户取消",
              };
            }

            if (request.dryRun) {
              return {
                pipeline: item.pipelineName,
                status: "applied",
                message: `[Dry-Run] 将部署 ${item.imageTag} 到 ${item.pipelineName}`,
              };
            }

            try {
              const result = await this.triggerDeploy(
                item.pipelineName,
                item.fullModuleName,
                item.imageTag,
                {
                  includeCanaryDeployHeader: resolveIncludeCanaryDeployHeader(item),
                },
              );
              return {
                pipeline: item.pipelineName,
                status: "applied",
                runId: result.runId,
              };
            } catch (e) {
              const msg = formatCicdRequestError(e);
              if (msg.includes("409") || msg.includes("conflict")) {
                return {
                  pipeline: item.pipelineName,
                  status: "conflicted",
                  message: msg,
                };
              }
              return {
                pipeline: item.pipelineName,
                status: "failed",
                message: msg,
              };
            }
          }),
        ),
      );

      results.push(...groupResults);
    }

    return { operationId: request.operationId, results };
  }

  // ──────────── Canary / traffic operations ────────────

  async getCanary(pipeline: string): Promise<CanaryDeployment | null> {
    const client = await this.createClient();
    const cfg = this.getConfig();

    const metaMap = cfg.pipelineMetadataMap;
    const meta = metaMap[pipeline];
    const parsed = parsePipelineName(pipeline);

    const deploymentName = meta?.deploymentName ?? `java-${parsed.moduleName}`;
    const namespace = cfg.workspace;

    return client.getCanaryDeployment(namespace, deploymentName, cfg.cluster);
  }

  async shiftTraffic(
    pipeline: string,
    weights: Record<string, number>,
    meta?: {
      devopsProject?: string;
      module?: string;
      env?: string;
      blueVersion?: string;
      greenVersion?: string;
      pipelineRunId?: string;
      jenkinsBuildId?: string;
      beforeBlue?: number;
      beforeGreen?: number;
    },
  ): Promise<BatchOperationItemResult> {
    validateTrafficWeights(weights);
    const client = await this.createClient();
    const cfg = this.getConfig();

    // #region agent log
    const _dbgLog = (msg: string, data: Record<string, unknown>) => { try { fs.appendFileSync("/Users/jiangyi/Documents/codedev/cursor_vibe_coding/.cursor/debug-c32067.log", JSON.stringify({ sessionId: "c32067", location: "release-handler.ts:shiftTraffic", message: msg, data, timestamp: Date.now() }) + "\n"); } catch {} };
    _dbgLog("shiftTraffic-entry", { pipeline, weights, meta, hypothesisId: "H1" });
    // #endregion

    const metaMap = cfg.pipelineMetadataMap;
    const pMeta = metaMap[pipeline];
    const parsed = parsePipelineName(pipeline);

    const deploymentName = pMeta?.deploymentName ?? `java-${parsed.moduleName}`;
    const namespace = cfg.workspace;
    const moduleName = pMeta?.moduleName ?? parsed.moduleName;

    try {
      const pre = await client.preCheckCanarySwitchStatus(cfg.devopsProject, pipeline, cfg.cluster);
      if (!pre.canSwitch) {
        return {
          pipeline,
          status: "skipped",
          message: pre.reason?.trim() || "当前阶段不允许切流（预检未通过）",
        };
      }
    } catch (e) {
      return {
        pipeline,
        status: "failed",
        message: `切流预检失败: ${formatCicdRequestError(e)}`,
      };
    }

    try {
      await client.updateCanaryWeight(namespace, deploymentName, cfg.cluster, weights);
    } catch (e) {
      return {
        pipeline,
        status: "failed",
        message: `切流失败: ${formatCicdRequestError(e)}`,
      };
    }

    let auditStatus: "not_needed" | "succeeded" | "failed" = "not_needed";
    if (meta) {
      try {
        const versions = Object.keys(weights);
        const blueVersion = meta.blueVersion ?? versions[0] ?? "";
        const greenVersion = meta.greenVersion ?? versions[1] ?? "";

        // #region agent log
        _dbgLog("uploadTrafficChangeEvent-payload", { blueVersion, greenVersion, blueValue: weights[blueVersion] ?? 0, greenValue: weights[greenVersion] ?? 0, beforeBlue: meta.beforeBlue, beforeGreen: meta.beforeGreen, weightsSum: Object.values(weights).reduce((a, b) => a + b, 0), hypothesisId: "H1" });
        // #endregion

        await client.uploadTrafficChangeEvent({
          devopsProject: meta.devopsProject ?? cfg.devopsProject,
          pipeline,
          project: cfg.project,
          module: meta.module ?? moduleName,
          envName: meta.env ?? cfg.cluster,
          blueVersion,
          greenVersion,
          pipelineRunId: meta.pipelineRunId ?? "",
          blueValue: weights[blueVersion] ?? 0,
          greenValue: weights[greenVersion] ?? 0,
          beforeBlueValue: meta.beforeBlue ?? 0,
          beforeGreenValue: meta.beforeGreen ?? 0,
          jenkinsBuildId: meta.jenkinsBuildId ?? "",
          operator: cfg.operator,
        });
        auditStatus = "succeeded";
      } catch {
        auditStatus = "failed";
      }
    }

    // Read-after-write verification
    try {
      const current = await client.getCanaryDeployment(namespace, deploymentName, cfg.cluster);
      if (current) {
        const allMatch = Object.entries(weights).every(
          ([ver, w]) => current.weights[ver] === w,
        );
        if (!allMatch) {
          return {
            pipeline,
            status: "failed",
            message: "切流已提交但 read-after-write 校验不一致",
            auditStatus,
          };
        }
      }
    } catch {
      // read-after-write failure is non-fatal
    }

    return { pipeline, status: "applied", auditStatus };
  }

  async batchTrafficShift(
    request: BatchTrafficShiftRequest,
  ): Promise<{ operationId: string; results: BatchOperationItemResult[] }> {
    const cfg = this.getConfig();
    const concurrency = cfg.batchConcurrency;
    const limit = pLimit(concurrency);

    const results = await Promise.all(
      request.shifts.map((shift) =>
        limit(async (): Promise<BatchOperationItemResult> => {
          try {
            return await this.shiftTraffic(shift.pipeline, shift.weights, shift.meta);
          } catch (e) {
            return {
              pipeline: shift.pipeline,
              status: "failed",
              message: e instanceof Error ? e.message : String(e),
            };
          }
        }),
      ),
    );

    return { operationId: request.operationId, results };
  }

  async getTrafficLogs(pipeline: string): Promise<TrafficChangeLog[]> {
    const client = await this.createClient();
    const cfg = this.getConfig();
    return client.getTrafficChangeLogs(pipeline, cfg.cluster);
  }

  async checkRollback(
    module: string,
    image: string,
  ): Promise<{ canRollback: boolean; reason?: string }> {
    const client = await this.createClient();
    const cfg = this.getConfig();
    return client.checkCanRollback(module, cfg.cluster, image);
  }
}

// ──────────────────────────────────────────
// Stage inference logic
// ──────────────────────────────────────────

function inferStage(
  nodes: PipelineNode[],
  rules: StageInferenceRule[],
): Omit<PipelineStageSummary, "pipelineName" | "runId" | "updatedAt"> {
  const activeNode = nodes.find(
    (n) => n.status === "IN_PROGRESS" || n.status === "PAUSED",
  );

  if (!activeNode) {
    const allSuccess = nodes.length > 0 && nodes.every((n) => n.status === "SUCCESS");
    if (allSuccess) {
      return {
        stageType: "succeeded",
        stageLabel: "已完成",
        requiresManualAction: false,
      };
    }
    const hasFailed = nodes.some((n) => n.status === "FAILED");
    if (hasFailed) {
      return {
        stageType: "failed",
        stageLabel: "失败",
        requiresManualAction: false,
      };
    }
    return {
      stageType: "deploying",
      stageLabel: "部署中",
      requiresManualAction: false,
    };
  }

  if (activeNode.status === "IN_PROGRESS") {
    return {
      stageType: "deploying",
      stageLabel: activeNode.displayName || "执行中",
      currentNodeName: activeNode.displayName,
      requiresManualAction: false,
    };
  }

  // PAUSED — match against inference rules
  for (const rule of rules) {
    const re = new RegExp(rule.pattern, "i");
    if (re.test(activeNode.displayName)) {
      return {
        stageType: rule.stageType,
        stageLabel: activeNode.displayName,
        waitingReason: activeNode.pauseDescription ?? activeNode.displayName,
        currentNodeName: activeNode.displayName,
        requiresManualAction: true,
        action: {
          kind: rule.actionKind,
          title: activeNode.displayName,
          description: activeNode.pauseDescription,
        },
      };
    }
  }

  // No rule matched — fallback to waiting_manual + custom
  return {
    stageType: "waiting_manual",
    stageLabel: activeNode.displayName,
    waitingReason: activeNode.pauseDescription ?? activeNode.displayName,
    currentNodeName: activeNode.displayName,
    requiresManualAction: true,
    action: {
      kind: "custom",
      title: activeNode.displayName,
      description: activeNode.pauseDescription,
    },
  };
}

// ──────────────────────────────────────────
// Deploy-order grouping for batch operations
// ──────────────────────────────────────────

function groupByDeployOrder<T extends { deployOrder?: number }>(
  items: T[],
): T[][] {
  const map = new Map<number, T[]>();
  for (const item of items) {
    const order = item.deployOrder ?? 0;
    let group = map.get(order);
    if (!group) {
      group = [];
      map.set(order, group);
    }
    group.push(item);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, group]) => group);
}
