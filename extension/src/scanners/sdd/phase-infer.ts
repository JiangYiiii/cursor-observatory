/**
 * 由 SDD 产物推断 CapabilityPhase（docs/SDD_INTEGRATION_DESIGN §2）。
 */

import type { TaskProgress } from "./parse-tasks";

export type SddInferredPhase =
  | "planning"
  | "designing"
  | "developing"
  | "testing"
  | "completed";

export interface ArtifactFlags {
  hasSpec: boolean;
  hasSketch: boolean;
  hasPlan: boolean;
  hasTasksFile: boolean;
  taskProgress: TaskProgress;
  /** 任务全勾选后是否跳过「测试中」直接标为已完成（见 observatory-sdd.json / plan / tasks 约定） */
  skipTestingAfterTasks?: boolean;
}

export function inferPhaseFromSddArtifacts(f: ArtifactFlags): SddInferredPhase {
  const {
    hasSpec,
    hasSketch,
    hasPlan,
    hasTasksFile,
    taskProgress,
    skipTestingAfterTasks,
  } = f;

  if (hasTasksFile && taskProgress.total > 0) {
    if (taskProgress.completed >= taskProgress.total) {
      if (skipTestingAfterTasks) {
        return "completed";
      }
      return "testing";
    }
    return "developing";
  }

  if (hasPlan) {
    return "designing";
  }

  if (hasSpec || hasSketch) {
    return "planning";
  }

  return "planning";
}
