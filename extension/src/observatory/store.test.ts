import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SYNTHETIC_TEST_FILE } from "./normalize-test-results";
import { ObservatoryStore } from "./store";
import type { TestResults } from "./types";

function minimalManifest(): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    project: {
      name: "demo",
      type: "python",
      language: "python",
    },
    observatory: {
      initialized_at: "2026-04-05T10:00:00Z",
      extension_version: "0.1.1",
      scanners_used: [],
    },
  };
}

describe("ObservatoryStore", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp && fsSync.existsSync(tmp)) {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("initialize creates .observatory and sessions", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "obs-test-"));
    const store = new ObservatoryStore(tmp);
    await store.initialize();
    expect(fsSync.existsSync(path.join(tmp, ".observatory"))).toBe(true);
    expect(fsSync.existsSync(path.join(tmp, ".observatory", "sessions"))).toBe(
      true
    );
  });

  it("serializes concurrent writes to the same file", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "obs-test-"));
    const store = new ObservatoryStore(tmp);
    await store.initialize();
    const m = minimalManifest();
    await Promise.all([
      store.writeJson("manifest.json", { ...m, project: { ...m.project as object, name: "a" } }),
      store.writeJson("manifest.json", { ...m, project: { ...m.project as object, name: "b" } }),
      store.writeJson("manifest.json", { ...m, project: { ...m.project as object, name: "c" } }),
    ]);
    const read = await store.readJson<Record<string, unknown>>("manifest.json");
    const proj = read.project as { name?: string };
    expect(["a", "b", "c"]).toContain(proj.name);
  });

  it("appends and reads test-history.jsonl", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "obs-test-"));
    const store = new ObservatoryStore(tmp);
    await store.initialize();
    await store.appendTestHistoryLine({
      v: 1,
      timestamp: "2026-04-05T12:00:00Z",
      total: 1,
      passed: 1,
      failed: 0,
      duration_ms: 10,
    });
    const rows = await store.readParsedTestHistory();
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(1);
  });

  it("readJson normalizes report.json with incomplete test_cases before validate", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "obs-test-"));
    const store = new ObservatoryStore(tmp);
    await store.initialize();
    const bad = {
      schema_version: "1.0.0",
      last_run: "2026-04-07T12:00:00.000Z",
      runner: "agent",
      summary: { total: 1, passed: 1, failed: 0 },
      test_cases: [{ id: "sum", name: "汇总", status: "passed" }],
    };
    await fs.writeFile(
      path.join(tmp, ".observatory", "report.json"),
      JSON.stringify(bad),
      "utf8"
    );
    const doc = await store.readJson<{ test_cases: Array<{ file: string }> }>(
      "report.json"
    );
    expect(doc.test_cases[0].file).toBe(SYNTHETIC_TEST_FILE);
  });

  it("writeTestResults normalizes test_cases missing file before write", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "obs-test-"));
    const store = new ObservatoryStore(tmp);
    await store.initialize();
    const tr: TestResults = {
      schema_version: "1.0.0",
      last_run: "2026-04-07T12:00:00.000Z",
      runner: "agent",
      summary: { total: 1, passed: 1, failed: 0 },
      test_cases: [{ id: "tier-a", name: "Tier A", status: "passed" }],
    };
    await store.writeTestResults(tr);
    const text = await fs.readFile(
      path.join(tmp, ".observatory", "report.json"),
      "utf8"
    );
    const doc = JSON.parse(text) as { test_cases: Array<{ file?: string }> };
    expect(doc.test_cases[0]?.file).toBe(SYNTHETIC_TEST_FILE);
  });

  it("pruneExpiredData filters old timeline rows", async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "obs-test-"));
    const store = new ObservatoryStore(tmp);
    await store.initialize();
    const old = "2020-01-01T00:00:00Z";
    const progress = {
      schema_version: "1.0.0",
      generated_at: "2026-04-05T14:30:00Z",
      timeline: [
        {
          id: "p1",
          timestamp: old,
          type: "commit",
          title: "old",
        },
        {
          id: "p2",
          timestamp: "2026-04-05T11:25:00Z",
          type: "commit",
          title: "new",
        },
      ],
    };
    await store.writeJson("progress.json", progress);
    /* cutoff ≈ 2026-03-11 — keeps 2026-04-05, drops 2020-01-01 */
    await store.pruneExpiredData(new Date("2026-04-10T00:00:00Z"));
    const doc = await store.readJson<{ timeline: unknown[] }>("progress.json");
    expect(doc.timeline).toHaveLength(1);
  });
});
