export type NodeStatus =
  | "SUCCESS"
  | "IN_PROGRESS"
  | "PAUSED"
  | "NOT_BUILT"
  | "FAILED"
  | "ABORTED"
  | "UNKNOWN";

export type PipelineStageType =
  | "idle"
  | "deploying"
  | "waiting_release"
  | "waiting_gray_confirm"
  | "waiting_bluegreen_switch"
  | "waiting_manual"
  | "succeeded"
  | "failed"
  | "aborted"
  | "unknown";

export interface PipelineInfo {
  name: string;
  displayName?: string;
  moduleName: string;
  fullModuleName: string;
  repoName: string;
  pipelineType: "canary" | "prod" | "unknown";
  hasCanary: boolean;
  /**
   * KubeSphere `metadata.annotations["pipeline.devops.kubesphere.io/type"]`（如 blue_green、rolling_update）。
   * 存在时发布面板的「蓝绿切流」以该字段为准：仅 `blue_green` 为支持。
   */
  ksPipelineType?: string;
  deployOrder?: number;
  latestRun?: PipelineRunSummary;
  currentStage?: PipelineStageSummary;
  mappingSource?: "config" | "inferred";
}

export interface PipelineRunSummary {
  id: string;
  status: "running" | "succeeded" | "failed" | "paused" | "aborted" | "unknown";
  startTime?: string;
  duration?: number;
  jenkinsBuildId?: string;
}

export interface PipelineNode {
  id: string;
  displayName: string;
  status: NodeStatus;
  rawType?: string;
  startTime?: string;
  duration?: number;
  index: number;
  pauseDescription?: string;
  requiresAction: boolean;
  /** PAUSED 且子 step 含 input 时，供 v1alpha2 SubmitInputStep（id 为 step.input.id，非数字 step id） */
  pausedInput?: { nodeId: string; stepId: string; inputId: string };
}

export interface PipelineStageSummary {
  pipelineName: string;
  runId?: string;
  /** Jenkins build 号，用于 v1alpha2 SubmitInputStep 的 URL 路径 `runs/{id}`；body 仍用 runId 作 runName */
  jenkinsBuildId?: string;
  stageType: PipelineStageType;
  stageLabel: string;
  waitingReason?: string;
  currentNodeName?: string;
  requiresManualAction: boolean;
  action?: ManualActionInfo;
  releaseOrder?: ReleaseOrderSummary;
  updatedAt: string;
}

export interface ReleaseOrderSummary {
  status: "pending" | "partial" | "approved" | "unknown";
  confirmedCount?: number;
  totalCount?: number;
  url?: string;
}

export interface ManualActionInfo {
  kind: "release-order" | "gray-confirm" | "manual-approval" | "bluegreen-confirm" | "custom";
  title: string;
  description?: string;
  externalUrl?: string;
}

export interface ImageTag {
  tag: string;
  createdAt?: string;
  parsed?: {
    branch: string;
    buildNumber: string;
    commitShort: string;
    buildTime: string;
  };
}

export interface CanaryDeployment {
  namespace: string;
  name: string;
  cluster: string;
  weights: Record<string, number>;
  blueVersion: string;
  greenVersion: string;
  blueWeight: number;
  greenWeight: number;
}

export interface TrafficChangeLog {
  pipeline: string;
  operator: string;
  blueVersion: string;
  greenVersion: string;
  beforeBlue: number;
  beforeGreen: number;
  afterBlue: number;
  afterGreen: number;
  timestamp: string;
}

export interface BatchDeployRequest {
  operationId: string;
  dryRun?: boolean;
  pipelines: {
    pipelineName: string;
    fullModuleName: string;
    imageTag: string;
    deployOrder?: number;
    /** KubeSphere `pipeline.devops.kubesphere.io/type`；与 pipelineName 一起用于推断是否带 CICD_CANARY_DEPLOY_HEADER */
    ksPipelineType?: string;
    /** 可选；未传时由 resolveIncludeCanaryDeployHeader 推断 */
    includeCanaryDeployHeader?: boolean;
  }[];
}

export interface BatchTrafficShiftRequest {
  operationId: string;
  shifts: {
    pipeline: string;
    namespace: string;
    deploymentName: string;
    cluster: string;
    weights: Record<string, number>;
    meta: {
      devopsProject: string;
      module: string;
      env: string;
      blueVersion: string;
      greenVersion: string;
      pipelineRunId: string;
      jenkinsBuildId: string;
      beforeBlue: number;
      beforeGreen: number;
    };
  }[];
}

export interface BatchOperationItemResult {
  pipeline: string;
  status: "applied" | "skipped" | "conflicted" | "failed" | "cancelled";
  runId?: string;
  message?: string;
  auditStatus?: "not_needed" | "succeeded" | "failed";
}

export interface ReleaseOrderDetail {
  orderId: string;
  status: "pending" | "partial" | "approved" | "rejected";
  items: { title: string; confirmed: boolean }[];
  url: string;
  createdAt?: string;
}

export interface CanarySwitchPreCheck {
  canSwitch: boolean;
  reason?: string;
  currentStep?: string;
  blockedBy?: string;
}

export interface ReleaseEnvStatus {
  configured: boolean;
  tokenSet: boolean;
  tokenValid: boolean;
  baseUrlValid: boolean;
  devopsProject: string;
  workspace: string;
  cluster: string;
  project: string;
  operator: string;
  issues: string[];
  lastTokenCheckAt?: string;
}

export type ReleaseApiError =
  | { code: "TOKEN_MISSING"; message: string }
  | { code: "TOKEN_EXPIRED"; message: string }
  | { code: "NETWORK_ERROR"; message: string; detail?: string }
  | { code: "API_ERROR"; message: string; status: number; detail?: unknown }
  | { code: "PIPELINE_NOT_FOUND"; message: string }
  | { code: "PIPELINE_CONFLICT"; message: string; pipeline: string }
  | { code: "DEPLOY_FAILED"; message: string; pipeline: string }
  | { code: "TRAFFIC_SHIFT_FAILED"; message: string; pipeline: string }
  | { code: "WEIGHT_INVALID"; message: string; detail: { sum: number; weights: Record<string, number> } }
  | { code: "AUDIT_UPLOAD_FAILED"; message: string; pipeline: string }
  | { code: "BATCH_CANCELLED"; message: string; completedCount: number; cancelledCount: number };

// ---------------------------------------------------------------------------
// Stage inference rules (section 2.4)
// ---------------------------------------------------------------------------

export interface StageInferenceRule {
  pattern: string;
  stageType: PipelineStageType;
  actionKind: ManualActionInfo["kind"];
}

export const DEFAULT_STAGE_INFERENCE_RULES: StageInferenceRule[] = [
  { pattern: "发布单|release.?order", stageType: "waiting_release", actionKind: "release-order" },
  { pattern: "灰度|gray|canary.?confirm", stageType: "waiting_gray_confirm", actionKind: "gray-confirm" },
  { pattern: "蓝绿|blue.?green", stageType: "waiting_bluegreen_switch", actionKind: "bluegreen-confirm" },
  { pattern: "审批|approv", stageType: "waiting_manual", actionKind: "manual-approval" },
];

// ---------------------------------------------------------------------------
// Request / batch execution config (section 5.4)
// ---------------------------------------------------------------------------

export interface CicdRequestConfig {
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  retryOn: (status: number) => boolean;
  /** 仅 `listPipelines`：为 false 时只请求第一页（用于 Token 健康检查，避免拉全量分页） */
  fetchAllPages?: boolean;
}

export interface BatchExecutionConfig {
  concurrency: number;
  delayBetweenMs: number;
  abortPolicy: "never" | "on-first-failure" | "on-user-cancel";
  orderMode: "parallel" | "ordered";
}

// ---------------------------------------------------------------------------
// Pipeline metadata map entry (appendix D)
// ---------------------------------------------------------------------------

export interface PipelineMetadataEntry {
  moduleName?: string;
  fullModuleName?: string;
  repoName?: string;
  pipelineType?: "canary" | "prod";
  hasCanary?: boolean;
  /** 覆盖 KubeSphere 注解；一般无需配置 */
  ksPipelineType?: string;
  deploymentName?: string;
  deployOrder?: number;
}

// ---------------------------------------------------------------------------
// Utility: traffic weight validation (section 9.4)
// ---------------------------------------------------------------------------

export function validateTrafficWeights(weights: Record<string, number>): void {
  const versions = Object.keys(weights);
  if (versions.length < 2) {
    throw new Error("至少需要两个版本的权重");
  }
  for (const v of versions) {
    const w = weights[v];
    if (w < 0 || w > 100) {
      throw new Error(`权重值必须在 0-100 之间，版本 ${v} 当前为 ${w}`);
    }
  }
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum !== 100) {
    throw new Error(`权重之和必须为 100，当前为 ${sum}`);
  }
}

// ---------------------------------------------------------------------------
// Utility: pipeline name parser (section 8 + appendix A)
// ---------------------------------------------------------------------------

const NAMESPACE_PREFIX_RE = /^cn-cashloan-/;

export function parsePipelineName(name: string): {
  moduleName: string;
  repoName: string;
  pipelineType: "canary" | "prod" | "unknown";
  hasCanary: boolean;
} {
  let pipelineType: "canary" | "prod" | "unknown" = "unknown";
  let moduleName = name;
  let hasCanary = false;

  if (name.endsWith("-cd-canary")) {
    pipelineType = "canary";
    hasCanary = true;
    moduleName = name.slice(0, -"-cd-canary".length);
  } else if (name.endsWith("-cd-prod")) {
    pipelineType = "prod";
    hasCanary = false;
    moduleName = name.slice(0, -"-cd-prod".length);
  }

  const repoName = moduleName.replace(NAMESPACE_PREFIX_RE, "");

  return { moduleName, repoName, pipelineType, hasCanary };
}

/**
 * Jenkins 参数 CICD_CANARY_DEPLOY_HEADER：*-cd-canary 与 KubeSphere 标注 `blue_green` 的流水线需附带（与控制台一致）。
 */
export function pipelineNeedsCicdCanaryDeployHeader(input: {
  name: string;
  ksPipelineType?: string;
}): boolean {
  if (input.name.endsWith("-cd-canary")) return true;
  return input.ksPipelineType?.trim() === "blue_green";
}

/** 批量部署项：显式布尔优先，否则按流水线名 + ksPipelineType 推断 */
export function resolveIncludeCanaryDeployHeader(item: {
  pipelineName: string;
  ksPipelineType?: string;
  includeCanaryDeployHeader?: boolean;
}): boolean {
  if (typeof item.includeCanaryDeployHeader === "boolean") {
    return item.includeCanaryDeployHeader;
  }
  return pipelineNeedsCicdCanaryDeployHeader({
    name: item.pipelineName,
    ksPipelineType: item.ksPipelineType,
  });
}

/**
 * KubeSphere CICD `GET .../image/tags` 的 `repoName` 查询参数通常与流水线解析出的短 `repoName` 不一致：
 * 控制台多为 `cn-cashloan-<module>` 全限定名；传短名时接口可能返回空列表。
 * （Jenkins MODULE_NAME 触发：先短名再全名重试，见 cicd-api-client.triggerCdPipeline。）
 */
export function repoNameForKubeSphereImageTags(repoName: string): string {
  const t = repoName.trim();
  if (!t) return t;
  if (t.startsWith("cn-cashloan-")) return t;
  return `cn-cashloan-${t}`;
}

// ---------------------------------------------------------------------------
// Utility: image tag parser (section 8 + appendix B)
// ---------------------------------------------------------------------------

const IMAGE_TAG_RE =
  /^(?<branch>[a-zA-Z][a-zA-Z0-9._-]*?)-(?<date>\d{8})-(?<buildNumber>\d+)-(?<commit>[0-9a-f]{6,40})-(?<buildTime>\d{14})$/;

export function parseImageTag(tag: string): {
  branch: string;
  date: string;
  buildNumber: string;
  commitShort: string;
  buildTime: string;
  displayLabel: string;
} | null {
  const m = IMAGE_TAG_RE.exec(tag);
  if (!m?.groups) return null;

  const { branch, date, buildNumber, commit, buildTime } = m.groups;
  const ts = buildTime.replace(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/,
    "$1-$2-$3 $4:$5:$6",
  );

  return {
    branch,
    date,
    buildNumber,
    commitShort: commit.slice(0, 8),
    buildTime: ts,
    displayLabel: `${branch}#${buildNumber} (${commit.slice(0, 8)}) ${ts}`,
  };
}
