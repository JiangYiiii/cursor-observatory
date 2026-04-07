/**
 * SDD 扫描与 capabilities 合并类型。
 * primary_doc: docs/SDD_INTEGRATION_DESIGN.md §五
 */

export type BugRootCause =
  | "SPEC_GAP"
  | "DESIGN_FLAW"
  | "TASK_MISS"
  | "IMPL_DEVIATION"
  | "IMPL_BUG";

export interface SddDocumentsPresence {
  spec: boolean;
  sketch: boolean;
  plan: boolean;
  tasks: boolean;
  dataModel: boolean;
  contracts: boolean;
  research: boolean;
}

export interface SddCapabilityMeta {
  enabled: true;
  workspacePath: string;
  activeFeature: boolean;
  documents: SddDocumentsPresence;
  taskStats?: { total: number; completed: number };
  /** 与 observatory-sdd.json / plan.md / tasks.md 约定一致 */
  skipTestingAfterTasks?: boolean;
  /** 为 true 表示 phase 来自 observatory-sdd.json 的 declaredPhase（全量扫描仍保留该阶段） */
  phaseDeclaredInObservatorySdd?: boolean;
  /** spec.md 首次加入仓库的提交作者（Git）；无法解析时与扫描回退一致 */
  specAuthor?: string;
}

export interface CapabilityBugfixState {
  activeBugs: number;
  resolvedBugs: number;
  rootCauses: BugRootCause[];
}

/** 与 detectSddStatus 输出对齐（docs/SDD_INTEGRATION_DESIGN §7.4） */
export type SddIntegrationStatus = "full" | "partial" | "none";

export interface SddDetectionResult {
  status: SddIntegrationStatus;
  /** specs/ 存在且至少有一个有效 feature */
  hasSpecsDir: boolean;
  featureCount: number;
  hasSddRules: boolean;
  hasSddPluginCache: boolean;
}

export interface RunFullScanSddSummary {
  sddDetected: boolean;
  sddFeatureCount: number;
  sddStatus: SddIntegrationStatus;
}
