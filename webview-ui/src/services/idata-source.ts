/**
 * 数据源接口（与 docs/FRONTEND_DESIGN.md §二 对齐）。
 */
import type {
  AiSession,
  Architecture,
  BatchDeployRequest,
  BatchOperationItemResult,
  BatchTrafficShiftRequest,
  CanaryDeployment,
  Capability,
  DataModels,
  DocsAiIndicesPayload,
  DocsCatalogDocument,
  DocsConfigPayload,
  DocsFilePayload,
  DocsHealth,
  DocsTreePayload,
  ImageTag,
  Manifest,
  PipelineInfo,
  PipelineNode,
  PipelineRunSummary,
  PipelineStageSummary,
  PreflightResult,
  Progress,
  ReleaseDiffPayload,
  ReleaseEnvStatus,
  SessionDetail,
  SessionIndex,
  TestExpectations,
  TestHistoryEntry,
  TestMapping,
  TestResults,
  TrafficChangeLog,
  CanarySwitchPreCheck,
  Unsubscribe,
  UpdateEvent,
} from "../types/observatory";

export interface IDataSource {
  getManifest(): Promise<Manifest | null>;
  getArchitecture(): Promise<Architecture | null>;
  getCapabilities(): Promise<Capability[]>;
  getProgress(): Promise<Progress | null>;
  getTestResults(): Promise<TestResults | null>;
  getTestMapping(): Promise<TestMapping | null>;
  getTestExpectations(): Promise<TestExpectations | null>;
  /** 全量写入 test-expectations.json（需含 schema_version 与 expectations） */
  saveTestExpectations(doc: TestExpectations): Promise<void>;
  getTestHistory(): Promise<TestHistoryEntry[]>;
  getAiSessions(): Promise<AiSession[]>;
  getDataModels(): Promise<DataModels | null>;
  /** 与扩展「Open Data Model AI Prompt」一致的 Markdown，用于初始化 data-models.json */
  getDataModelAiPromptMarkdown(): Promise<string>;
  getDocsHealth(): Promise<DocsHealth | null>;

  /** 文档根与索引配置（与扩展 observatory.docs.* 一致） */
  getDocsConfig(): Promise<DocsConfigPayload>;
  /** 文档根下 Markdown 树（安全只读） */
  getDocsTree(): Promise<DocsTreePayload>;
  /** 读取文档根下单个 UTF-8 文本文件（主要为 .md） */
  getDocsFile(relativePath: string): Promise<DocsFilePayload>;
  /** 00-meta/docs-catalog.json；不存在时返回 null */
  getDocsCatalog(): Promise<DocsCatalogDocument | null>;
  /** 语义锚点索引摘要列表 */
  getDocsAiIndices(): Promise<DocsAiIndicesPayload>;
  /** 在 VS Code 中打开文档根下文件（浏览器模式无操作） */
  openWorkspaceFile(relativePath: string): Promise<{ ok: boolean }>;
  getSessionList(): Promise<SessionIndex | null>;
  getSession(id: string): Promise<SessionDetail | null>;

  onUpdate(callback: (event: UpdateEvent) => void): Unsubscribe;

  triggerScan(): Promise<void>;
  /** 仅同步单个 specs/<featureName>/ 到 capabilities.json */
  scanSddFeature(featureName: string): Promise<void>;
  triggerTests(capabilityId?: string): Promise<void>;
  updateCapability(
    id: string,
    updates: Partial<Capability>
  ): Promise<void>;

  /** specs/<feature>/observatory-sdd.json */
  getSddConfig(feature: string): Promise<Record<string, unknown>>;
  saveSddConfig(
    feature: string,
    partial: Record<string, unknown>
  ): Promise<Record<string, unknown>>;
  getImpactAnalysis(feature: string): Promise<unknown | null>;
  saveImpactAnalysis(
    feature: string,
    body: unknown
  ): Promise<{ warnings?: string[] }>;
  getTestCasesResult(feature: string): Promise<unknown | null>;
  saveTestCasesResult(feature: string, body: unknown): Promise<void>;
  getPromptTemplate(
    stage: string
  ): Promise<{ content: string; source: string }>;

  getGitInfo(): Promise<{
    branch: string;
    headCommit: string;
    workingTreeFingerprint: string;
    lastCommitLine: string | null;
  }>;

  /** 当前分支相对上游的 diff 与提交摘要（发布说明 / 准入准出） */
  getReleaseDiff(): Promise<ReleaseDiffPayload>;

  getImpactAnalysisMd(feature: string): Promise<string | null>;
  getTestCasesMd(feature: string): Promise<string | null>;

  /** Skill/MCP 预检（与扩展 settings 一致） */
  getPreflight(stage: string): Promise<PreflightResult>;

  /** 部署卡片：扩展级默认服务列表与 Cheetah MCP 标识（与 settings 一致） */
  getDeploySettings(): Promise<{
    defaultServiceList: string;
    cheetahMcpService: string;
  }>;

  // --- Release Workflow ---
  getReleaseEnvStatus(): Promise<ReleaseEnvStatus>;
  listReleasePipelines(): Promise<PipelineInfo[]>;
  listReleaseStageSummaries(): Promise<PipelineStageSummary[]>;
  getLatestPipelineRun(pipelineName: string): Promise<PipelineRunSummary | null>;
  getPipelineRunNodes(runId: string): Promise<PipelineNode[]>;
  listReleaseImages(repoName: string): Promise<ImageTag[]>;
  triggerReleaseDeploy(
    pipelineName: string,
    fullModuleName: string,
    imageTag: string,
    options?: { ksPipelineType?: string; includeCanaryDeployHeader?: boolean },
  ): Promise<{ runId: string }>;
  batchReleaseDeploy(request: BatchDeployRequest): Promise<{ operationId: string; results: BatchOperationItemResult[] }>;
  getReleaseCanary(pipeline: string): Promise<CanaryDeployment | null>;
  preCheckReleaseCanarySwitch(pipeline: string): Promise<CanarySwitchPreCheck>;
  shiftReleaseTraffic(
    pipeline: string,
    weights: Record<string, number>,
    meta?: unknown
  ): Promise<BatchOperationItemResult>;
  batchShiftReleaseTraffic(request: BatchTrafficShiftRequest): Promise<{ operationId: string; results: BatchOperationItemResult[] }>;
  submitReleasePipelineRunInput(
    pipelineName: string,
    runId: string,
    nodeId: string,
    stepId: string,
    inputId: string,
    abort: boolean,
    jenkinsBuildId?: string
  ): Promise<void>;
  getReleaseTrafficLogs(pipeline: string): Promise<TrafficChangeLog[]>;
  checkReleaseRollback(module: string, image: string): Promise<{ canRollback: boolean; reason?: string }>;

  /** 切换工作区前释放 WebSocket / 监听器（HTTP 数据源实现） */
  dispose?(): void;
}

export type CreateDataSourceOptions = {
  baseUrl?: string;
  workspaceRoot?: string | null;
};
