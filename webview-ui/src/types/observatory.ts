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
