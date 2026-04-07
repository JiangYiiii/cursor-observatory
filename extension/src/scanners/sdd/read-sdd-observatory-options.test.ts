import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  parseDeclaredPhase,
  readObservatorySddFeatureOptions,
  readSkipTestingAfterTasks,
} from "./read-sdd-observatory-options";

describe("readSkipTestingAfterTasks", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("observatory-sdd.json true", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "obs-sdd-"));
    await fs.writeFile(
      path.join(dir, "observatory-sdd.json"),
      JSON.stringify({ skipTestingAfterTasks: true }),
      "utf8"
    );
    expect(await readSkipTestingAfterTasks(dir)).toBe(true);
  });

  it("observatory-sdd.json false wins over plan hint", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "obs-sdd-"));
    await fs.writeFile(
      path.join(dir, "observatory-sdd.json"),
      JSON.stringify({ skipTestingAfterTasks: false }),
      "utf8"
    );
    await fs.writeFile(
      path.join(dir, "plan.md"),
      "- [x] 无需单独测试\n",
      "utf8"
    );
    expect(await readSkipTestingAfterTasks(dir)).toBe(false);
  });

  it("plan.md checked line without json", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "obs-sdd-"));
    await fs.writeFile(
      path.join(dir, "plan.md"),
      "# P\n\n- [x] 无需单独测试\n",
      "utf8"
    );
    expect(await readSkipTestingAfterTasks(dir)).toBe(true);
  });

  it("tasks.md Observatory: skip-testing", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "obs-sdd-"));
    await fs.writeFile(
      path.join(dir, "tasks.md"),
      "- [x] Observatory: skip-testing\n",
      "utf8"
    );
    expect(await readSkipTestingAfterTasks(dir)).toBe(true);
  });

  it("empty feature dir -> false", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "obs-sdd-"));
    expect(await readSkipTestingAfterTasks(dir)).toBe(false);
  });
});

describe("parseDeclaredPhase", () => {
  it("accepts valid enum", () => {
    expect(parseDeclaredPhase("completed")).toBe("completed");
    expect(parseDeclaredPhase("  testing  ")).toBe("testing");
  });

  it("rejects invalid", () => {
    expect(parseDeclaredPhase("done")).toBe(null);
    expect(parseDeclaredPhase(null)).toBe(null);
  });
});

describe("readObservatorySddFeatureOptions", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("declaredPhase completed + skipTesting false", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "obs-sdd-"));
    await fs.writeFile(
      path.join(dir, "observatory-sdd.json"),
      JSON.stringify({
        skipTestingAfterTasks: false,
        declaredPhase: "completed",
      }),
      "utf8"
    );
    const o = await readObservatorySddFeatureOptions(dir);
    expect(o.skipTestingAfterTasks).toBe(false);
    expect(o.declaredPhase).toBe("completed");
  });

  it("declaredPhase ignored when invalid", async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "obs-sdd-"));
    await fs.writeFile(
      path.join(dir, "observatory-sdd.json"),
      JSON.stringify({ declaredPhase: "not-a-phase" }),
      "utf8"
    );
    const o = await readObservatorySddFeatureOptions(dir);
    expect(o.declaredPhase).toBe(null);
  });
});
