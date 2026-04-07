import { describe, expect, it } from "vitest";
import {
  extractPathsFromTasksMd,
} from "./git-utils";

describe("extractPathsFromTasksMd", () => {
  it("extracts backtick paths", () => {
    const md = `- [ ] T001 update \`src/main/java/Foo.java\` and \`README.md\``;
    const p = extractPathsFromTasksMd(md);
    expect(p).toContain("src/main/java/Foo.java");
  });

  it("returns sorted unique", () => {
    const md = "`a/b.java` `a/b.java`";
    expect(extractPathsFromTasksMd(md)).toEqual(["a/b.java"]);
  });
});
