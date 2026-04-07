/**
 * 数据源接口（与 docs/FRONTEND_DESIGN.md §二 对齐）。
 */
import type {
  AiSession,
  Architecture,
  Capability,
  DataModels,
  DocsHealth,
  Manifest,
  Progress,
  SessionDetail,
  SessionIndex,
  TestExpectations,
  TestHistoryEntry,
  TestMapping,
  TestResults,
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

  /** 切换工作区前释放 WebSocket / 监听器（HTTP 数据源实现） */
  dispose?(): void;
}

export type CreateDataSourceOptions = {
  baseUrl?: string;
  workspaceRoot?: string | null;
};
