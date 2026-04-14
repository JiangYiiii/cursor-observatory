import * as https from "node:https";
import * as http from "node:http";
import type {
  CicdRequestConfig,
  PipelineInfo,
  PipelineNode,
  PipelineRunSummary,
  ImageTag,
  ReleaseOrderDetail,
  CanaryDeployment,
  TrafficChangeLog,
  CanarySwitchPreCheck,
  PipelineMetadataEntry,
} from "./release-types";
import {
  parsePipelineName,
  parseImageTag,
  repoNameForKubeSphereImageTags,
} from "./release-types";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const TRIGGER_CD_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1_000;

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const DEFAULT_RETRY_ON = (status: number) => RETRYABLE_STATUS.has(status);

const AONE_EXTRA_BASE = "https://aone-extra.fintopia.tech";

/** KubeSphere Pipeline 注解：蓝绿能力与控制台「类型」一致 */
const KS_PIPELINE_TYPE_ANNOTATION = "pipeline.devops.kubesphere.io/type";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RawResponse<T = unknown> {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRedirectToLogin(status: number, headers: http.IncomingHttpHeaders): boolean {
  if (status === 302 || status === 301) {
    const loc = headers.location ?? "";
    return /login/i.test(loc);
  }
  return false;
}

function coerceInputId(input: Record<string, unknown>): string {
  const raw = input.id;
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return "";
}

function findPausedInputStep(
  stage: Record<string, unknown>,
): { nodeId: string; stepId: string; inputId: string } | undefined {
  const stageId = String(stage.id ?? "");
  const steps = stage.steps as Array<Record<string, unknown>> | undefined;
  if (!steps?.length) return undefined;
  for (const step of steps) {
    if (!step.input) continue;
    const input = step.input as Record<string, unknown>;
    const inputId = coerceInputId(input);
    const sid = String(step.id ?? "");
    if (stageId && sid && inputId) return { nodeId: stageId, stepId: sid, inputId };
  }
  return undefined;
}

/** nodedetails 阶段：PAUSED 时常伴 result=UNKNOWN，不能优先用 result 覆盖 state */
function resolveKsStageStatus(node: Record<string, unknown>): string {
  const steps = node.steps as Array<Record<string, unknown>> | undefined;
  /** 子 step 已 PAUSED（如 Wait for interactive input）时，阶段也应视为暂停 */
  const anyStepPaused = steps?.some((s) => String(s.state ?? "").toUpperCase() === "PAUSED");
  if (anyStepPaused) return "PAUSED";

  const state = String(node.state ?? "").trim().toUpperCase();
  if (state === "PAUSED") return "PAUSED";
  if (state === "RUNNING") return "IN_PROGRESS";

  const primary = (node.result ?? node.state) as string | undefined;
  let status = (primary ?? "NOT_BUILT").toUpperCase();
  if (status === "UNKNOWN") {
    const hasInteractiveInput = steps?.some((s) => Boolean(s.input));
    if (hasInteractiveInput) return "PAUSED";
  }
  if (status === "FINISHED") {
    const r = typeof node.result === "string" ? node.result.toUpperCase() : "";
    if (r === "SUCCESS") return "SUCCESS";
    if (r === "FAILURE" || r === "FAILED") return "FAILED";
    if (r === "ABORTED") return "ABORTED";
    return "NOT_BUILT";
  }
  return status;
}

function extractInputMessageFromSteps(stage: Record<string, unknown>): string | undefined {
  const steps = stage.steps as Array<Record<string, unknown>> | undefined;
  if (!steps?.length) return undefined;
  for (const step of steps) {
    const input = step.input as Record<string, unknown> | undefined;
    const msg = input?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return undefined;
}

/**
 * Jenkins MODULE_NAME choice 在不同流水线上不一致：有的只允许短名，有的只允许 cn-cashloan-*。
 * {@link CicdApiClient.triggerCdPipeline} 会先传短名，失败后再用全名重试一次（短名与全名相同时只请求一次）。
 */
function shortModuleNameForCdTrigger(moduleName: string): string {
  const t = moduleName.trim();
  if (t.startsWith("cn-cashloan-")) return t.slice("cn-cashloan-".length);
  return t;
}

function fullModuleNameForCdTrigger(moduleName: string): string {
  const t = moduleName.trim();
  if (!t) return t;
  if (t.startsWith("cn-cashloan-")) return t;
  return `cn-cashloan-${t}`;
}

function coerceBoolish(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  if (typeof v === "number") return v !== 0;
  return undefined;
}

/** kapis 常见外壳里的 HTTP 业务码；非 0 表示预检失败 */
function readKsEnvelopeStatusCode(obj: Record<string, unknown> | undefined): number | undefined {
  const st = obj?.status;
  if (st && typeof st === "object" && st !== null && "code" in st) {
    const c = (st as { code?: unknown }).code;
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return undefined;
}

/**
 * 解析 preStepCanarySwitchStatus 响应。
 *
 * 平台常见形态：`{ status: { code }, body: { ... } }`，切流许可字段可能在 `body` 内。
 * 注意：`body.enabled` 与控制台是否允许手动调权重**不是同一语义**（可出现 enabled:false 仍可切流），
 * 解析时**不得**用 `enabled` 推导 canSwitch。
 */
function parseCanarySwitchPreCheckResponse(data: Record<string, unknown>): CanarySwitchPreCheck {
  const innerRaw = data.data;
  const inner =
    innerRaw !== undefined && innerRaw !== null && typeof innerRaw === "object"
      ? (innerRaw as Record<string, unknown>)
      : data;

  const bodyPayload =
    inner.body !== undefined && inner.body !== null && typeof inner.body === "object" && !Array.isArray(inner.body)
      ? (inner.body as Record<string, unknown>)
      : undefined;

  const nested =
    inner.result !== undefined && inner.result !== null && typeof inner.result === "object"
      ? (inner.result as Record<string, unknown>)
      : undefined;

  const pickFirst = (obj: Record<string, unknown> | undefined, keys: string[]): unknown => {
    if (!obj) return undefined;
    for (const k of keys) {
      if (k in obj && obj[k] !== undefined) return obj[k];
    }
    return undefined;
  };

  const pickFirstAcross = (keys: string[]): unknown =>
    pickFirst(bodyPayload, keys) ??
    pickFirst(inner, keys) ??
    (nested ? pickFirst(nested, keys) : undefined) ??
    pickFirst(data, keys);

  const pickReason = (obj: Record<string, unknown> | undefined): string | undefined => {
    const v = pickFirst(obj, ["reason", "message", "msg", "detail"]);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };

  const reasonFrom =
    pickReason(bodyPayload) ??
    pickReason(inner) ??
    pickReason(data) ??
    (nested ? pickReason(nested) : undefined);

  const flagKeys = ["canSwitch", "can_switch", "switchable", "allowSwitch", "allow_switch"] as const;
  const flagRaw = pickFirstAcross([...flagKeys]);

  const statusCode = readKsEnvelopeStatusCode(inner) ?? readKsEnvelopeStatusCode(data);
  const coerced = coerceBoolish(flagRaw);

  let canSwitch: boolean;
  if (statusCode !== undefined && statusCode !== 0) {
    canSwitch = false;
  } else if (coerced === false) {
    canSwitch = false;
  } else {
    /** 无明确 false 时默认可切；勿用 body.enabled（见函数注释） */
    canSwitch = true;
  }

  const stepRaw = pickFirstAcross(["currentStep", "current_step"]);
  const blockedRaw = pickFirstAcross(["blockedBy", "blocked_by"]);

  return {
    canSwitch,
    reason: reasonFrom,
    currentStep: typeof stepRaw === "string" ? stepRaw : undefined,
    blockedBy: typeof blockedRaw === "string" ? blockedRaw : undefined,
  };
}

// ---------------------------------------------------------------------------
// CicdApiClient
// ---------------------------------------------------------------------------

export class CicdApiClient {
  constructor(
    private baseUrl: string,
    private cookieToken: string,
    private defaultNamespace: string,
    private defaultWorkspace: string,
    private defaultCluster: string,
    private defaultProject: string,
  ) {}

  // -----------------------------------------------------------------------
  // Generic request
  // -----------------------------------------------------------------------

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    opts?: {
      extraHeaders?: Record<string, string>;
      config?: Partial<CicdRequestConfig>;
    },
  ): Promise<T> {
    const config: CicdRequestConfig = {
      timeoutMs: opts?.config?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retries: method === "GET" ? (opts?.config?.retries ?? DEFAULT_RETRIES) : 0,
      retryDelayMs: opts?.config?.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      retryOn: opts?.config?.retryOn ?? DEFAULT_RETRY_ON,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= config.retries; attempt++) {
      if (attempt > 0) {
        const delay = config.retryDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      try {
        const raw = await this.doRequest<T>(method, url, body, opts?.extraHeaders, config.timeoutMs);

        if (raw.status === 401 || isRedirectToLogin(raw.status, raw.headers)) {
          const err = new Error("CICD Token 已过期或无效") as Error & { code: string; status: number };
          err.code = "TOKEN_EXPIRED";
          err.status = raw.status;
          throw err;
        }

        if (raw.status >= 400) {
          if (config.retryOn(raw.status) && attempt < config.retries) {
            lastError = new Error(`HTTP ${raw.status}`);
            continue;
          }
          const err = new Error(`API 请求失败: HTTP ${raw.status}`) as Error & {
            code: string;
            status: number;
            detail: unknown;
          };
          err.code = "API_ERROR";
          err.status = raw.status;
          err.detail = raw.body;
          throw err;
        }

        return raw.body;
      } catch (e: unknown) {
        const error = e as Error & { code?: string };
        if (error.code === "TOKEN_EXPIRED" || error.code === "API_ERROR") throw error;

        if (error.name === "AbortError" || error.code === "ABORT_ERR") {
          const err = new Error("请求超时") as Error & { code: string };
          err.code = "NETWORK_ERROR";
          throw err;
        }

        lastError = error;
        if (attempt >= config.retries) {
          const err = new Error(`网络错误: ${error.message}`) as Error & { code: string; detail: string };
          err.code = "NETWORK_ERROR";
          err.detail = error.message;
          throw err;
        }
      }
    }

    const err = new Error(lastError?.message ?? "请求失败") as Error & { code: string };
    err.code = "NETWORK_ERROR";
    throw err;
  }

  private doRequest<T>(
    method: string,
    url: string,
    body: unknown | undefined,
    extraHeaders: Record<string, string> | undefined,
    timeoutMs: number,
  ): Promise<RawResponse<T>> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const transport = isHttps ? https : http;

      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "*/*",
        cookie: this.cookieToken,
        ...extraHeaders,
      };

      const payload = body != null ? JSON.stringify(body) : undefined;
      if (payload) {
        headers["content-length"] = Buffer.byteLength(payload).toString();
      }

      const req = transport.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method,
          headers,
          timeout: timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf-8");
            let parsed: unknown;
            try {
              parsed = raw ? JSON.parse(raw) : undefined;
            } catch {
              parsed = raw;
            }
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: parsed as T,
            });
          });
        },
      );

      req.on("timeout", () => {
        req.destroy();
        const err = new Error("请求超时") as Error & { code: string };
        err.code = "ABORT_ERR";
        reject(err);
      });

      req.on("error", reject);

      if (payload) req.write(payload);
      req.end();
    });
  }

  // -----------------------------------------------------------------------
  // URL builders
  // -----------------------------------------------------------------------

  private ksDevopsUrl(subpath: string): string {
    return `${this.baseUrl}/kapis/devops.kubesphere.io/v1alpha3${subpath}`;
  }

  /** Jenkins input / SubmitInputStep（与 KubeSphere Console 一致，见 ks-devops v1alpha2） */
  private ksDevopsV2Url(subpath: string): string {
    return `${this.baseUrl}/kapis/devops.kubesphere.io/v1alpha2${subpath}`;
  }

  private ksCicdUrl(subpath: string): string {
    return `${this.baseUrl}/kapis/cicd.kubesphere.io/v1alpha4${subpath}`;
  }

  // -----------------------------------------------------------------------
  // Pipeline management
  // -----------------------------------------------------------------------

  async listPipelines(
    filter?: string,
    _page = 1,
    limit = 100,
    metadataMap?: Record<string, PipelineMetadataEntry>,
    /** 健康检查等场景可缩短超时、关闭重试；`fetchAllPages: false` 只拉第一页 */
    requestConfig?: Partial<CicdRequestConfig>,
  ): Promise<PipelineInfo[]> {
    const pageSize = Math.min(Math.max(limit, 1), 500);
    const fetchAllPages = requestConfig?.fetchAllPages !== false;
    const out: PipelineInfo[] = [];
    let page = 1;
    const reqOpts =
      requestConfig && Object.keys(requestConfig).length > 0 ? { config: requestConfig } : undefined;

    for (;;) {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        sortBy: "name",
        ascending: "true",
      });
      if (filter) params.set("filter", filter);

      const url = this.ksDevopsUrl(`/devops/${this.defaultNamespace}/pipelines?${params}`);
      const data = await this.request<{ items?: Array<Record<string, unknown>> }>(
        "GET",
        url,
        undefined,
        reqOpts,
      );

      const items = data?.items ?? [];
      for (const item of items) {
        const rawMeta = item.metadata as Record<string, unknown> | undefined;
        const name = String(item.name ?? rawMeta?.name ?? "").trim();
        if (!name) continue;
        const annotations = (rawMeta?.annotations ?? {}) as Record<string, unknown>;
        const rawType = annotations[KS_PIPELINE_TYPE_ANNOTATION];
        const ksPipelineType =
          typeof rawType === "string" && rawType.trim() ? rawType.trim() : undefined;
        out.push(this.buildPipelineInfo(name, metadataMap, ksPipelineType));
      }

      if (!fetchAllPages) break;
      if (items.length < pageSize) break;
      page += 1;
      if (page > 200) break;
    }

    return out;
  }

  private buildPipelineInfo(
    name: string,
    metadataMap?: Record<string, PipelineMetadataEntry>,
    ksPipelineTypeFromApi?: string,
  ): PipelineInfo {
    const inferred = parsePipelineName(name);

    const hasCanaryFromKs = (ks?: string): boolean | undefined => {
      if (ks === undefined || ks === "") return undefined;
      return ks === "blue_green";
    };

    const meta = metadataMap?.[name];
    const ksFromConfig = meta?.ksPipelineType?.trim();
    const ksEffective = ksFromConfig || ksPipelineTypeFromApi;
    const inferredCanary = hasCanaryFromKs(ksEffective);

    if (meta) {
      const hasCanary =
        meta.hasCanary !== undefined && meta.hasCanary !== null
          ? Boolean(meta.hasCanary)
          : inferredCanary !== undefined
            ? inferredCanary
            : meta.pipelineType === "canary" || inferred.hasCanary;

      return {
        name,
        moduleName: meta.moduleName ?? inferred.moduleName,
        fullModuleName: meta.fullModuleName ?? this.inferFullModuleName(meta.moduleName ?? inferred.moduleName),
        repoName: meta.repoName ?? inferred.repoName,
        pipelineType: meta.pipelineType ?? inferred.pipelineType,
        hasCanary,
        ksPipelineType: ksEffective,
        deployOrder: meta.deployOrder,
        deploymentName: meta.deploymentName,
        mappingSource: "config",
      } as PipelineInfo & { deploymentName?: string };
    }

    const hasCanary = inferredCanary !== undefined ? inferredCanary : inferred.hasCanary;

    return {
      name,
      moduleName: inferred.moduleName,
      fullModuleName: this.inferFullModuleName(inferred.moduleName),
      repoName: inferred.repoName,
      pipelineType: inferred.pipelineType,
      hasCanary,
      ksPipelineType: ksPipelineTypeFromApi,
      mappingSource: "inferred",
    };
  }

  private inferFullModuleName(moduleName: string): string {
    if (moduleName.startsWith("cn-cashloan-")) return moduleName;
    return `cn-cashloan-${moduleName}`;
  }

  /** 与 list/get 返回的单条 PipelineRun 结构对齐，供 getLatest / getPipelineRunByRunName 共用 */
  private parsePipelineRunRecord(run: Record<string, unknown>): PipelineRunSummary {
    const meta = run.metadata as Record<string, unknown> | undefined;
    const st = run.status as Record<string, unknown> | undefined;
    const spec = run.spec as Record<string, unknown> | undefined;
    const annotations = meta?.annotations as Record<string, unknown> | undefined;
    const labels = meta?.labels as Record<string, unknown> | undefined;
    const runName = String(meta?.name ?? run.name ?? run.id ?? "").trim();

    const buildFromAnnotations =
      typeof annotations?.["devops.kubesphere.io/jenkins-build"] === "string"
        ? String(annotations["devops.kubesphere.io/jenkins-build"]).trim()
        : "";
    const buildFromLabels =
      typeof labels?.["devops.kubesphere.io/jenkins-build"] === "string"
        ? String(labels["devops.kubesphere.io/jenkins-build"]).trim()
        : "";

    const rawStatus = String(
      run.phase ?? st?.phase ?? run.result ?? st?.result ?? "unknown",
    ).toLowerCase();
    const statusMap: Record<string, PipelineRunSummary["status"]> = {
      running: "running",
      pending: "running",
      succeeded: "succeeded",
      completed: "succeeded",
      successful: "succeeded",
      failed: "failed",
      error: "failed",
      paused: "paused",
      aborted: "aborted",
    };

    const jenkinsBuildId = String(
      run.buildId ?? st?.buildId ?? spec?.buildId
        ?? buildFromAnnotations ?? buildFromLabels ?? "",
    ).trim();

    if (!jenkinsBuildId) {
      console.warn(
        `[Observatory] parsePipelineRunRecord: jenkinsBuildId 为空，runName=${runName}，` +
        `已检查字段: run.buildId=${run.buildId}, status.buildId=${st?.buildId}, ` +
        `spec.buildId=${spec?.buildId}, annotation=${buildFromAnnotations}, label=${buildFromLabels}`,
      );
    }

    return {
      id: runName,
      status: statusMap[rawStatus] ?? "unknown",
      startTime: (run.startTime ?? st?.startTime) as string | undefined,
      duration: (run.durationInMillis ?? st?.durationInMillis) as number | undefined,
      jenkinsBuildId: jenkinsBuildId || undefined,
    };
  }

  /**
   * 按 PipelineRun 名称拉取单次运行，解析 Jenkins build 号（SubmitInputStep URL 中 `runs/{id}` 需要）。
   * 依次尝试 namespaced pipelinerun 与 pipeline 子资源两种路径。
   */
  async getPipelineRunByRunName(runName: string, pipelineName: string): Promise<PipelineRunSummary | null> {
    const name = runName.trim();
    const pl = pipelineName.trim();
    if (!name || !pl) return null;

    const safe = encodeURIComponent(name);
    const plEnc = encodeURIComponent(pl);
    const ns = this.defaultNamespace;

    const urls = [
      this.ksDevopsUrl(`/namespaces/${ns}/pipelineruns/${safe}`),
      this.ksDevopsUrl(`/namespaces/${ns}/pipelines/${plEnc}/pipelineruns/${safe}`),
    ];

    for (const url of urls) {
      try {
        const run = await this.request<Record<string, unknown>>("GET", url);
        if (run && typeof run === "object") {
          return this.parsePipelineRunRecord(run);
        }
      } catch {
        /* try next path */
      }
    }
    return null;
  }

  async getPipelineRunNodes(runId: string): Promise<PipelineNode[]> {
    const safe = encodeURIComponent(runId);
    const url = this.ksDevopsUrl(`/namespaces/${this.defaultNamespace}/pipelineruns/${safe}/nodedetails`);
    const data = await this.request<Array<Record<string, unknown>>>("GET", url);

    const nodes = Array.isArray(data) ? data : [];
    return nodes.map((node, idx) => {
      const status = resolveKsStageStatus(node);
      const pausedInput = findPausedInputStep(node);
      const pauseDesc =
        (node.pauseDescription as string | undefined)
        ?? extractInputMessageFromSteps(node)
        ?? undefined;
      return {
        id: String(node.id ?? idx),
        displayName: String(node.displayName ?? node.name ?? `节点 ${idx + 1}`),
        status: status as PipelineNode["status"],
        rawType: node.type as string | undefined,
        startTime: node.startTime as string | undefined,
        duration: node.durationInMillis as number | undefined,
        index: idx,
        pauseDescription: pauseDesc,
        requiresAction: status === "PAUSED",
        pausedInput,
      };
    });
  }

  /**
   * 流水线暂停节点「继续 / 终止」—— ks-devops 注册为
   * `POST .../namespaces/{devops}/pipelines/{pipeline}/runs/{run}/nodes/{node}/steps/{step}`（无尾 `/`）。
   * 部分集群网关另有 `/devops/{devops}/...` 路由，一并尝试。
   * Body：`{ id, runName }`；`runs/{run}` 可能是 Jenkins build 号或 PipelineRun 名，逐个尝试。
   */
  async submitPipelineRunInput(
    pipelineName: string,
    runId: string,
    nodeId: string,
    stepId: string,
    inputId: string,
    abort: boolean,
    urlRunsSegment?: string,
  ): Promise<void> {
    const enc = encodeURIComponent;
    const ns = enc(this.defaultNamespace);
    const pl = enc(pipelineName);
    const nid = enc(nodeId);
    const sid = enc(stepId);

    const runCandidates = [
      ...new Set(
        [urlRunsSegment?.trim() ?? "", runId.trim()].filter((s) => s.length > 0),
      ),
    ];

    const body: Record<string, unknown> = abort
      ? { id: inputId, abort: true }
      : { id: inputId, runName: runId };

    const pathVariants = (runSeg: string) => {
      const r = enc(runSeg);
      return [
        `/devops/${ns}/pipelines/${pl}/runs/${r}/nodes/${nid}/steps/${sid}/`,
        `/namespaces/${ns}/pipelines/${pl}/runs/${r}/nodes/${nid}/steps/${sid}/`,
      ];
    };

    let lastErr: unknown;
    for (const runSeg of runCandidates) {
      for (const path of pathVariants(runSeg)) {
        const url = this.ksDevopsV2Url(path);
        try {
          await this.request<unknown>("POST", url, body);
          return;
        } catch (e: unknown) {
          lastErr = e;
          const err = e as { code?: string; status?: number };
          if (err.code === "API_ERROR" && (err.status === 404 || err.status === 500)) continue;
          throw e;
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error("SubmitInputStep：所有 run/路径组合均失败");
  }

  /**
   * 通过 v1alpha2（Jenkins wrapper）列出 pipeline runs，按 runName 匹配出数字 build ID。
   * v1alpha2 返回的 run 对象天然包含数字 `id` 字段。
   */
  async getJenkinsBuildIdViaV2(pipelineName: string, runName: string): Promise<string | null> {
    const enc = encodeURIComponent;
    const ns = enc(this.defaultNamespace);
    const pl = enc(pipelineName);

    const pathVariants = [
      `/devops/${ns}/pipelines/${pl}/runs/`,
      `/namespaces/${ns}/pipelines/${pl}/runs/`,
    ];

    for (const path of pathVariants) {
      const url = this.ksDevopsV2Url(path);
      try {
        const data = await this.request<Array<Record<string, unknown>>>("GET", url);
        const runs = Array.isArray(data) ? data : [];
        for (const r of runs) {
          const name = String(r.name ?? r.pipeline ?? "").trim();
          const id = String(r.id ?? "").trim();
          if (name === runName && /^\d+$/.test(id)) {
            return id;
          }
        }
      } catch {
        /* try next path variant */
      }
    }
    return null;
  }

  async getLatestPipelineRun(pipelineName: string): Promise<PipelineRunSummary | null> {
    const params = new URLSearchParams({ limit: "1", page: "1" });
    const url = this.ksDevopsUrl(
      `/namespaces/${this.defaultNamespace}/pipelines/${pipelineName}/pipelineruns?${params}`,
    );
    const data = await this.request<{ items?: Array<Record<string, unknown>> }>("GET", url);

    const run = data?.items?.[0];
    if (!run) return null;

    return this.parsePipelineRunRecord(run);
  }

  // -----------------------------------------------------------------------
  // Image management
  // -----------------------------------------------------------------------

  async listImageTags(
    repoName: string,
    imageFilter = "release*",
    page = 1,
    limit = 50,
  ): Promise<ImageTag[]> {
    /** 镜像仓库在 KubeSphere 登记的 repoName 不一致：有的仅短名有 tag，有的仅 cn-cashloan-* 有 tag（见 scripts/probe-pipelines-image-tags.mjs）。 */
    const short = repoName.trim();
    const prefixed = repoNameForKubeSphereImageTags(short);
    const candidates = prefixed === short ? [short] : [short, prefixed];

    let items: Array<Record<string, unknown> | string> = [];
    for (const rn of candidates) {
      const params = new URLSearchParams({
        repoName: rn,
        env: this.defaultCluster,
        imageFilter,
        searchFilter: "",
      });
      if (page > 1) params.set("page", String(page));
      if (limit !== 50) params.set("limit", String(limit));

      const url = this.ksCicdUrl(`/namespaces/${this.defaultNamespace}/image/tags?${params}`);
      const data = await this.request<Array<Record<string, unknown>> | { items?: Array<Record<string, unknown>> }>(
        "GET",
        url,
      );

      const batch = Array.isArray(data)
        ? data
        : ((data as Record<string, unknown>)?.items as Array<Record<string, unknown>> ?? []);
      if (batch.length > 0) {
        items = batch;
        break;
      }
    }

    return items.map((item) => {
      const tag =
        typeof item === "string"
          ? item
          : String((item as Record<string, unknown>).tag ?? (item as Record<string, unknown>).name ?? item);
      return {
        tag,
        createdAt:
          typeof item === "object" && item && "createdAt" in item
            ? (item as Record<string, unknown>).createdAt as string | undefined
            : undefined,
        parsed: parseImageTag(tag) ?? undefined,
      };
    });
  }

  // -----------------------------------------------------------------------
  // Deploy trigger
  // -----------------------------------------------------------------------

  async triggerCdPipeline(
    pipelineName: string,
    params: {
      projectName: string;
      moduleName: string;
      buildEnv: string;
      imageTag: string;
      includeCanaryDeployHeader: boolean;
    },
  ): Promise<{ runId: string }> {
    const url = this.ksDevopsUrl(
      `/namespaces/${this.defaultNamespace}/pipelines/${pipelineName}/pipelineruns`,
    );

    /** 与浏览器控制台一致；*-cd-canary 或 blue_green 流水线需带该参数，缺省会导致 Jenkins 侧失败 */
    const canaryDeployHeaderValue = JSON.stringify({
      headers: [],
      queryParams: [],
      cookies: [],
    });

    const shortMn = shortModuleNameForCdTrigger(params.moduleName);
    const fullMn = fullModuleNameForCdTrigger(params.moduleName);

    const buildBody = (moduleNameValue: string) => {
      const parameters: Array<{ name: string; value: string }> = [
        { name: "PROJECT_NAME", value: params.projectName },
        { name: "MODULE_NAME", value: moduleNameValue },
        { name: "BUILD_ENV", value: params.buildEnv },
        { name: "IMAGE_TAG", value: params.imageTag },
      ];
      if (params.includeCanaryDeployHeader) {
        parameters.push({
          name: "CICD_CANARY_DEPLOY_HEADER",
          value: canaryDeployHeaderValue,
        });
      }
      return { parameters, summary: "" };
    };

    const parseRunId = (data: Record<string, unknown>): string => {
      const meta = data?.metadata as Record<string, unknown> | undefined;
      return String(data?.name ?? data?.id ?? meta?.name ?? "");
    };

    const post = (moduleNameValue: string) =>
      this.request<Record<string, unknown>>("POST", url, buildBody(moduleNameValue), {
        config: { timeoutMs: TRIGGER_CD_TIMEOUT_MS },
      });

    if (shortMn === fullMn) {
      const data = await post(shortMn);
      return { runId: parseRunId(data) };
    }

    try {
      const data = await post(shortMn);
      return { runId: parseRunId(data) };
    } catch (e: unknown) {
      const err = e as Error & { code?: string; status?: number };
      if (err.code === "TOKEN_EXPIRED") throw e;
      if (err.code === "API_ERROR" && err.status === 409) throw e;
      const data = await post(fullMn);
      return { runId: parseRunId(data) };
    }
  }

  // -----------------------------------------------------------------------
  // Release order (aone-extra)
  // -----------------------------------------------------------------------

  async queryReleaseOrder(
    module: string,
    env: string,
    image: string,
  ): Promise<ReleaseOrderDetail> {
    const url = `${AONE_EXTRA_BASE}/api/v1/releaseOrder/queryByParams`;
    const body = {
      project: this.defaultProject,
      module,
      env,
      image,
      detail: true,
    };

    const data = await this.request<Record<string, unknown>>("POST", url, body);
    return this.parseReleaseOrderResponse(data);
  }

  private parseReleaseOrderResponse(data: Record<string, unknown>): ReleaseOrderDetail {
    const inner = (data?.data ?? data) as Record<string, unknown>;
    const items = (inner.items as Array<{ title: string; confirmed: boolean }>) ?? [];
    const confirmed = items.filter((i) => i.confirmed).length;
    let status: ReleaseOrderDetail["status"] = "pending";
    if (confirmed === items.length && items.length > 0) status = "approved";
    else if (confirmed > 0) status = "partial";

    return {
      orderId: String(inner.orderId ?? inner.id ?? ""),
      status,
      items,
      url: String(inner.url ?? ""),
      createdAt: inner.createdAt as string | undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Canary deployment (blue-green)
  // -----------------------------------------------------------------------

  /**
   * 控制台与生产环境 uploadChangeTrafficEvent 使用 0–1 比例；扩展内部与 updateForCanaryWeight 仍用 0–100。
   */
  private trafficRatioFromPercent(percent: number): number {
    return percent / 100;
  }

  async getCanaryDeployment(
    namespace: string,
    name: string,
    cluster: string,
  ): Promise<CanaryDeployment | null> {
    const params = new URLSearchParams({ namespace, name, cluster });
    const url = this.ksCicdUrl(
      `/workspaces/${this.defaultWorkspace}/canary-deploy/canaryDeployment?${params}`,
    );

    try {
      const data = await this.request<Record<string, unknown>>("GET", url);
      if (!data) return null;
      return this.parseCanaryDeployment(namespace, name, cluster, data);
    } catch {
      return null;
    }
  }

  private parseCanaryDeployment(
    namespace: string,
    name: string,
    cluster: string,
    data: Record<string, unknown>,
  ): CanaryDeployment {
    // API returns full K8s CRD — weights live at spec.stages.canary.weight
    const spec = data.spec as Record<string, unknown> | undefined;
    const stages = spec?.stages as Record<string, unknown> | undefined;
    const canary = stages?.canary as Record<string, unknown> | undefined;
    const weights = (
      canary?.weight ?? canary?.weights ?? data.weight ?? data.weights ?? {}
    ) as Record<string, number>;

    const versions = Object.keys(weights);
    const sorted = [...versions].sort((a, b) => a.localeCompare(b));
    const blueVersion = sorted[0] ?? "";
    const greenVersion = sorted[1] ?? sorted[0] ?? "";

    return {
      namespace,
      name,
      cluster,
      weights,
      blueVersion,
      greenVersion,
      blueWeight: weights[blueVersion] ?? 0,
      greenWeight: weights[greenVersion] ?? 0,
    };
  }

  async updateCanaryWeight(
    namespace: string,
    name: string,
    cluster: string,
    weights: Record<string, number>,
  ): Promise<void> {
    const url = this.ksCicdUrl(
      `/workspaces/${this.defaultWorkspace}/canary-deploy/updateForCanaryWeight`,
    );
    await this.request<unknown>("POST", url, { namespace, name, cluster, weight: weights });
  }

  async uploadTrafficChangeEvent(event: {
    devopsProject: string;
    pipeline: string;
    project: string;
    module: string;
    envName: string;
    blueVersion: string;
    greenVersion: string;
    pipelineRunId: string;
    blueValue: number;
    greenValue: number;
    beforeBlueValue: number;
    beforeGreenValue: number;
    jenkinsBuildId: string;
    operator: string;
  }): Promise<void> {
    const url = this.ksCicdUrl(`/workspaces/default/bluegreen/uploadChangeTrafficEvent`);
    await this.request<unknown>("POST", url, {
      devops_project: event.devopsProject,
      pipeline: event.pipeline,
      project: event.project,
      module: event.module,
      env_name: event.envName,
      blue_version: event.blueVersion,
      green_version: event.greenVersion,
      pipeline_run_id: event.pipelineRunId,
      blue_value: this.trafficRatioFromPercent(event.blueValue),
      green_value: this.trafficRatioFromPercent(event.greenValue),
      before_blue_value: this.trafficRatioFromPercent(event.beforeBlueValue),
      before_green_value: this.trafficRatioFromPercent(event.beforeGreenValue),
      jenkins_build_id: event.jenkinsBuildId,
      operator: event.operator,
    });
  }

  async getTrafficChangeLogs(
    pipeline: string,
    env: string,
    page = 1,
    limit = 10,
  ): Promise<TrafficChangeLog[]> {
    const params = new URLSearchParams({
      pipeline,
      env,
      page: String(page),
      limit: String(limit),
    });
    const url = this.ksCicdUrl(`/workspaces/default/bluegreen/log?${params}`);
    const data = await this.request<{
      items?: Array<Record<string, unknown>>;
      data?: Array<Record<string, unknown>>;
    }>("GET", url);

    const items = data?.items ?? data?.data ?? [];
    return items.map((item) => ({
      pipeline: String(item.pipeline ?? ""),
      operator: String(item.operator ?? ""),
      blueVersion: String(item.blue_version ?? item.blueVersion ?? ""),
      greenVersion: String(item.green_version ?? item.greenVersion ?? ""),
      beforeBlue: Number(item.before_blue_value ?? item.beforeBlue ?? 0),
      beforeGreen: Number(item.before_green_value ?? item.beforeGreen ?? 0),
      afterBlue: Number(item.blue_value ?? item.afterBlue ?? 0),
      afterGreen: Number(item.green_value ?? item.afterGreen ?? 0),
      timestamp: String(item.created_at ?? item.timestamp ?? ""),
    }));
  }

  // -----------------------------------------------------------------------
  // Rollback check (aone-extra)
  // -----------------------------------------------------------------------

  async checkCanRollback(
    module: string,
    env: string,
    image: string,
  ): Promise<{ canRollback: boolean; reason?: string }> {
    const params = new URLSearchParams({
      project: this.defaultProject,
      module,
      env,
      image,
    });
    const url = `${AONE_EXTRA_BASE}/api/v1/releaseOrder/checkCanRollBack?${params}`;
    const data = await this.request<Record<string, unknown>>("GET", url);

    const inner = (data?.data ?? data) as Record<string, unknown>;
    return {
      canRollback: Boolean(inner.canRollBack ?? inner.canRollback ?? false),
      reason: inner.reason as string | undefined,
    };
  }

  // -----------------------------------------------------------------------
  // Canary switch pre-check
  // -----------------------------------------------------------------------

  async preCheckCanarySwitchStatus(
    devops: string,
    pipeline: string,
    buildEnv: string,
  ): Promise<CanarySwitchPreCheck> {
    const url = this.ksCicdUrl(
      `/workspaces/${this.defaultWorkspace}/bluegreen/preStepCanarySwitchStatus`,
    );
    const data = await this.request<Record<string, unknown>>("POST", url, {
      devops,
      pipeline,
      buildEnv,
    });

    return parseCanarySwitchPreCheckResponse(data);
  }
}
