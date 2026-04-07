import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveSddReportJsonAbsPath,
  SDD_TEST_REPORT_JSON,
} from "./sdd-test-paths";

describe("resolveSddReportJsonAbsPath", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const r of roots) {
      try {
        fs.rmSync(r, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    roots.length = 0;
  });

  it("returns specs/<active>/observatory/report.json when .active and feature dir exist", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "obs-sdd-path-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "specs", "m0-foo"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs", ".active"), "m0-foo\n");
    const got = resolveSddReportJsonAbsPath(root);
    expect(got).toBe(
      path.join(root, "specs", "m0-foo", "observatory", SDD_TEST_REPORT_JSON)
    );
  });

  it("returns undefined when specs/.active is missing", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "obs-sdd-path-"));
    roots.push(root);
    expect(resolveSddReportJsonAbsPath(root)).toBeUndefined();
  });

  it("uses existing Observatory directory name when casing is not lowercase", () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "obs-sdd-path-"));
    roots.push(root);
    fs.mkdirSync(path.join(root, "specs", "m0-foo", "Observatory"), {
      recursive: true,
    });
    fs.writeFileSync(path.join(root, "specs", ".active"), "m0-foo\n");
    const got = resolveSddReportJsonAbsPath(root);
    expect(got).toBe(
      path.join(root, "specs", "m0-foo", "Observatory", SDD_TEST_REPORT_JSON)
    );
  });
});
