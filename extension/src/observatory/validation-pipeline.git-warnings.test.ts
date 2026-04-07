import { describe, expect, it } from "vitest";
import type { CurrentGitState } from "./git-utils";
import {
  buildIncomingGitMetadataWarnings,
  IMPACT_ANALYSIS_GIT_PLACEHOLDER_FINGERPRINT,
} from "./validation-pipeline";

const git: CurrentGitState = {
  branch: "main",
  headCommit: "abc123def456",
  fingerprint: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

describe("buildIncomingGitMetadataWarnings", () => {
  it("returns empty when all three match", () => {
    expect(
      buildIncomingGitMetadataWarnings(
        {
          workspace_branch: git.branch,
          head_commit: git.headCommit,
          working_tree_fingerprint: git.fingerprint,
        },
        git
      )
    ).toEqual([]);
  });

  it("returns empty for placeholder fingerprint", () => {
    expect(
      buildIncomingGitMetadataWarnings(
        {
          workspace_branch: "wrong",
          head_commit: "wrong",
          working_tree_fingerprint:
            IMPACT_ANALYSIS_GIT_PLACEHOLDER_FINGERPRINT,
        },
        git
      )
    ).toEqual([]);
  });

  it("warns when branch differs", () => {
    const w = buildIncomingGitMetadataWarnings(
      {
        workspace_branch: "other",
        head_commit: git.headCommit,
        working_tree_fingerprint: git.fingerprint,
      },
      git
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("分支");
    expect(w[0]).toContain("覆盖");
  });

  it("warns when fingerprint differs", () => {
    const w = buildIncomingGitMetadataWarnings(
      {
        workspace_branch: git.branch,
        head_commit: git.headCommit,
        working_tree_fingerprint: "f".repeat(64),
      },
      git
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("working_tree_fingerprint");
  });

  it("does not warn when optional strings are empty", () => {
    expect(
      buildIncomingGitMetadataWarnings(
        {
          workspace_branch: "",
          head_commit: "",
          working_tree_fingerprint: "",
        },
        git
      )
    ).toEqual([]);
  });
});
