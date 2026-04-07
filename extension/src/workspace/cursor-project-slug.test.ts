import { describe, expect, it } from "vitest";
import {
  cursorProjectSlugCandidatesFromWorkspaceRoot,
  cursorProjectSlugFromWorkspaceRoot,
} from "./cursor-project-slug";

describe("cursorProjectSlugFromWorkspaceRoot", () => {
  it("maps path to Cursor projects folder slug", () => {
    expect(
      cursorProjectSlugFromWorkspaceRoot(
        "/Users/jiangyi/Documents/codedev/stock-dashboard"
      )
    ).toBe("Users-jiangyi-Documents-codedev-stock-dashboard");
  });

  it("offers hyphen variant when folder name uses underscores", () => {
    expect(
      cursorProjectSlugCandidatesFromWorkspaceRoot(
        "/Users/jiangyi/Documents/codedev/cursor_vibe_coding"
      )
    ).toEqual([
      "Users-jiangyi-Documents-codedev-cursor_vibe_coding",
      "Users-jiangyi-Documents-codedev-cursor-vibe-coding",
    ]);
  });
});
