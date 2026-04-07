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
