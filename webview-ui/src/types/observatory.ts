/**
 * `.observatory/` JSON 形状（与 docs/SCHEMA_SPEC.md 对齐，前端消费用）。
 * primary_doc: docs/SCHEMA_SPEC.md, docs/FRONTEND_DESIGN.md §二
 */

export interface SchemaVersioned {
  schema_version: string;
}

/** manifest.json observatory 块（扩展字段与 SDD 集成对齐） */
export interface ManifestObservatory {
  initialized_at?: string;
  last_full_scan?: string;
  extension_version?: string;
  scanners_used?: string[];
  sdd_detected?: boolean;
  sdd_feature_count?: number;
  sdd_status?: "full" | "partial" | "none";
}

export interface Manifest extends SchemaVersioned {
  project: Record<string, unknown>;
  observatory?: ManifestObservatory;
  metadata_sources?: Record<string, unknown>;
}

export interface ArchitectureModule {
  id: string;
  name?: string;
  path?: string;
  type?: string;
  [key: string]: unknown;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  type?: string;
  weight?: number;
  [key: string]: unknown;
}

export interface Architecture extends SchemaVersioned {
  generated_at?: string;
  modules: ArchitectureModule[];
  edges: ArchitectureEdge[];
  layers?: unknown[];
}

export type CapabilityPhase =
  | "planning"
  | "designing"
  | "developing"
  | "testing"
  | "completed"
  | "released"
  | "deprecated";

export type BugRootCause =
  | "SPEC_GAP"
  | "DESIGN_FLAW"
  | "TASK_MISS"
  | "IMPL_DEVIATION"
  | "IMPL_BUG";

export interface SddCapabilityMeta {
  enabled: boolean;
  workspacePath: string;
  activeFeature: boolean;
  documents: {
    spec: boolean;
    sketch: boolean;
    plan: boolean;
    tasks: boolean;
    dataModel: boolean;
    contracts: boolean;
    research: boolean;
  };
  taskStats?: { total: number; completed: number };
  /** 任务全勾选后跳过「测试中」直接标已完成 */
  skipTestingAfterTasks?: boolean;
  /** 阶段来自 specs/<feature>/observatory-sdd.json 的 declaredPhase */
  phaseDeclaredInObservatorySdd?: boolean;
  /** spec.md 首次加入仓库的提交作者 */
  specAuthor?: string;
}

export interface CapabilityBugfixState {
  activeBugs: number;
  resolvedBugs: number;
  rootCauses: BugRootCause[];
}

export interface Capability extends Record<string, unknown> {
  id: string;
  title?: string;
  phase?: CapabilityPhase;
  progress?: number;
  sdd?: SddCapabilityMeta;
  bugfix?: CapabilityBugfixState;
  /** 前端/合并写入常用 */
  updatedAt?: string;
  /** capabilities.json 中与 patchCapability 对齐 */
  updated_at?: string;
}

export interface CapabilitiesDocument extends SchemaVersioned {
  generated_at?: string;
  capabilities: Capability[];
}

/** progress.json timeline[] 单条（与 docs/SCHEMA_SPEC.md §五 对齐） */
export interface ProgressTimelineFile {
  path: string;
  status?: string;
}

export interface ProgressTimelineEvent extends Record<string, unknown> {
  id: string;
  timestamp: string;
  type?: string;
  title?: string;
  author?: string;
  commit?: { hash?: string; branch?: string };
  stats?: {
    files_changed?: number;
    insertions?: number;
    deletions?: number;
  };
  files?: ProgressTimelineFile[];
  capability_ids?: string[];
  session_id?: string | null;
}

export interface Progress extends SchemaVersioned {
  generated_at?: string;
  summary?: Record<string, unknown>;
  timeline: ProgressTimelineEvent[];
}

/** test-results.json test_cases[] 条目 */
export interface TestCaseRow extends Record<string, unknown> {
  id?: string;
  file?: string;
  name?: string;
  status?: string;
  duration_ms?: number;
  capability_id?: string;
  scenario?: string;
  error_message?: string | null;
}

export interface TestResults extends SchemaVersioned {
  last_run: string;
  runner: string;
  summary: Record<string, unknown>;
  test_cases: TestCaseRow[];
  by_capability?: Record<string, unknown>;
}

export interface TestMapping extends SchemaVersioned {
  generated_at?: string;
  generation_method?: string;
  mappings: unknown[];
}

/** 单条期望场景（与 schemas/test-expectations.schema.json 一致） */
export interface ExpectationScenario {
  name: string;
  priority: string;
  covered: boolean;
}

/** 单个能力下的期望场景块 */
export interface CapabilityExpectationBlock {
  scenarios: ExpectationScenario[];
  analysis_method?: string;
  last_analyzed?: string;
}

export interface TestExpectations extends SchemaVersioned {
  generated_at?: string;
  /** capability_id → 场景块 */
  expectations: Record<string, unknown>;
}

export interface TestHistoryEntry {
  v: number;
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  skipped?: number;
  duration_ms: number;
  by_capability?: Record<string, unknown>;
}

export interface AiSessionsDocument extends SchemaVersioned {
  sessions: AiSession[];
}

export interface AiSessionFileChange extends Record<string, unknown> {
  path: string;
  action?: string;
  lines_added?: number;
  lines_removed?: number;
}

export interface AiSession extends Record<string, unknown> {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  started_at?: string;
  ended_at?: string;
  duration_minutes?: number;
  capability_ids?: string[];
  tags?: string[];
  files_modified?: AiSessionFileChange[];
  docs_updated?: string[];
  tests_run?: { total?: number; passed?: number; failed?: number };
  commits?: { hash?: string; message?: string; timestamp?: string }[];
  summary?: string;
  transcript_file?: string;
}

/** data-models.json 表字段（与 docs/SCHEMA_SPEC.md §十 对齐） */
export interface DataModelColumn extends Record<string, unknown> {
  name: string;
  type?: string;
  nullable?: boolean;
  primary_key?: boolean;
  auto_increment?: boolean;
  default?: string | number | boolean | null;
}

export interface DataModelIndex extends Record<string, unknown> {
  name: string;
  columns: string[];
  unique?: boolean;
}

export interface DataModelForeignKey extends Record<string, unknown> {
  name?: string;
  columns?: string[];
  referenced_table?: string;
  referenced_columns?: string[];
}

export interface DataModelTable extends Record<string, unknown> {
  name: string;
  schema?: string;
  description?: string;
  capability_ids?: string[];
  columns?: DataModelColumn[];
  indexes?: DataModelIndex[];
  foreign_keys?: DataModelForeignKey[];
}

export interface DataModelRelationship extends Record<string, unknown> {
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  /** many_to_one | one_to_many | one_to_one | many_to_many */
  type?: string;
}

export interface DataModels extends SchemaVersioned {
  generated_at?: string;
  source_files?: string[];
  tables: DataModelTable[];
  relationships?: DataModelRelationship[];
}

/** docs-health.json checks[]（与 docs/SCHEMA_SPEC.md §十一 对齐） */
export interface DocsHealthCheck extends Record<string, unknown> {
  check: string;
  description?: string;
  score?: number;
  details?: Record<string, unknown>;
}

export interface DocsHealth extends SchemaVersioned {
  generated_at?: string;
  overall_score?: number;
  checks: DocsHealthCheck[];
}

/** GET /api/workspace/docs-config 与 bridge docs.getConfig */
export interface DocsConfigPayload {
  docsRoot: string;
  aiDocIndexRelativePath: string;
  semanticIndexGlob: string;
}

export type DocsTreeNodeType = "file" | "dir";

export interface DocsTreeNode {
  name: string;
  /** 相对文档根，POSIX；根占位可为 "" */
  relativePath: string;
  type: DocsTreeNodeType;
  children?: DocsTreeNode[];
}

/** GET /api/workspace/docs-tree 与 bridge docs.listTree */
export interface DocsTreePayload {
  root: DocsTreeNode;
  truncated: boolean;
  docsRootExists: boolean;
}

/** GET /api/workspace/docs-file 与 bridge docs.readFile */
export interface DocsFilePayload {
  relativePath: string;
  content: string;
  encoding: "utf-8";
}

/** docs-catalog.json（00-meta/docs-catalog.json） */
export interface DocsCatalogTaxonomyItem {
  id: string;
  label: string;
}

export interface DocsCatalogEntry {
  path: string;
  title?: string;
  summary?: string;
  category_id?: string;
  doc_kind?: string;
  tags?: string[];
  audience?: string[];
}

export interface DocsCatalogDocument extends SchemaVersioned {
  generated_at?: string;
  docs_root?: string;
  taxonomy?: DocsCatalogTaxonomyItem[];
  entries?: DocsCatalogEntry[];
}

export interface AiIndexSummaryItem {
  relativePath: string;
  domain?: string;
  flow?: string;
  anchorCount: number;
  docLinks: string[];
}

export interface DocsAiIndicesPayload {
  items: AiIndexSummaryItem[];
  truncated: boolean;
}

/** sessions/index.json entries（与 docs/SCHEMA_SPEC.md §十二 对齐） */
export interface SessionIndexEntry extends Record<string, unknown> {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  project?: string;
  capability_ids?: string[];
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  artifact_count?: number;
  message_count?: number;
}

export interface SessionIndex extends SchemaVersioned {
  generated_at?: string;
  sessions: SessionIndexEntry[];
}

export type SessionDetail = Record<string, unknown>;

export type UpdateEvent = {
  type: string;
  scope?: string;
  [key: string]: unknown;
};

export type Unsubscribe = () => void;

/** 扩展 `getReleaseDiff`：当前分支相对上游的 diff 摘要（供发布/准入准出 Prompt） */
export type ReleaseDiffPayload =
  | {
      ok: true;
      currentBranch: string;
      headCommit: string;
      upstreamRef: string;
      mergeBase: string;
      commitsAhead: number;
      filesChanged: number;
      statBlock: string;
      commitMessagesBlock: string;
      diffPatch: string;
      diffTruncated: boolean;
      workingTreeNote: string;
    }
  | {
      ok: false;
      reason: string;
      currentBranch?: string;
      hint?: string;
    };

// --- 需求面板 V2（specs/<feature>/observatory-sdd.json & observatory/*.json）---

export type DataFreshness = "fresh" | "stale" | "missing" | "invalid";

export type SkillStatus = "found" | "missing" | "invalid";

export type McpStatus =
  | "configured"
  | "service_missing"
  | "tool_missing"
  | "malformed";

/** specs/<feature>/observatory/observatory-sdd.json（兼容旧路径 specs/<feature>/observatory-sdd.json）中与需求级缓存相关的字段 */
export interface ObservatorySddConfig extends Record<string, unknown> {
  schema_version?: string;
  requirementUrl?: string;
  swimlane?: string;
  /** 英文逗号分隔；与扩展「默认服务列表」合并，用于部署卡片在影响分析为空时的展示 */
  deployServiceList?: string;
  declaredPhase?: string;
}

export interface ImpactScenario {
  id: string;
  name: string;
  impact: "high" | "medium" | "low";
  anchor_id?: string;
  description?: string;
  related_files: string[];
  module: string;
}

export interface AffectedModule {
  name: string;
  path: string;
  is_application: boolean;
  entry_class?: string;
  scenario_count: number;
  scenario_ids?: string[];
}

export interface ChangedFile {
  path: string;
  change_type: "modified" | "added" | "deleted";
  module: string;
  has_ai_doc?: boolean;
  anchor_ids?: string[];
}

export interface ImpactAnalysisSummary {
  total_scenarios: number;
  high_impact: number;
  medium_impact: number;
  low_impact: number;
  affected_modules: number;
  affected_applications: number;
}

export interface ImpactAnalysisResult extends SchemaVersioned {
  analyzed_at: string;
  base_ref: string;
  workspace_branch: string;
  head_commit: string;
  working_tree_fingerprint: string;
  generated_from_changed_files: string[];
  summary: ImpactAnalysisSummary;
  scenarios: ImpactScenario[];
  affected_modules: AffectedModule[];
  changed_files: ChangedFile[];
}

export interface TestCasesSummary {
  total_scenarios: number;
  generated_cases: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface TestCaseEntry {
  id: string;
  scenario_id: string;
  scenario_name: string;
  description: string;
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
  actual?: Record<string, unknown>;
  redacted_fields?: string[];
  status: "passed" | "failed" | "skipped" | "pending";
  error_message?: string;
}

export interface TestCasesResult extends SchemaVersioned {
  executed_at: string;
  source_impact_analysis_head_commit: string;
  source_impact_analysis_fingerprint: string;
  workspace_branch: string;
  head_commit: string;
  working_tree_fingerprint: string;
  summary: TestCasesSummary;
  cases: TestCaseEntry[];
}

/** 与扩展 `runPreflight` / `resolveSkillStatus` 返回一致 */
export interface SkillStatusEntry {
  status: SkillStatus;
  path?: string;
}

export interface McpStatusEntry {
  status: McpStatus;
  service?: string;
  tool?: string;
}

export interface PreflightResult {
  skillStatus: Record<string, SkillStatusEntry>;
  mcpStatus: {
    cicd: McpStatusEntry;
    testRunner: McpStatusEntry;
  };
  dataFreshness: Record<string, DataFreshness>;
}

// ─── Release Workflow Types ───

export type NodeStatus =
  | "SUCCESS"
  | "IN_PROGRESS"
  | "PAUSED"
  | "NOT_BUILT"
  | "FAILED"
  | "ABORTED"
  /** API 偶发仅给出 result=UNKNOWN；若含 input 会在归一化中视为 PAUSED */
  | "UNKNOWN";

export type PipelineStageType =
  | "idle" | "deploying" | "waiting_release" | "waiting_gray_confirm"
  | "waiting_bluegreen_switch" | "waiting_manual" | "succeeded" | "failed" | "aborted" | "unknown";

export interface PipelineInfo {
  name: string;
  displayName?: string;
  moduleName: string;
  fullModuleName: string;
  repoName: string;
  pipelineType: "canary" | "prod" | "unknown";
  hasCanary: boolean;
  /** KubeSphere `pipeline.devops.kubesphere.io/type`；有值时 hasCanary 以 `blue_green` 为准 */
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
  /** PAUSED 且子 step 含 input 时，供流水线继续/终止（inputId 为 Jenkins input UUID） */
  pausedInput?: { nodeId: string; stepId: string; inputId: string };
}

export interface CanarySwitchPreCheck {
  canSwitch: boolean;
  reason?: string;
  currentStep?: string;
  blockedBy?: string;
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

export interface PipelineStageSummary {
  pipelineName: string;
  runId?: string;
  /** Jenkins build 号，提交交互步骤时拼进 API 路径 */
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
    ksPipelineType?: string;
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
