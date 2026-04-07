import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findTestReportFile,
  isGradleTestCommand,
  isMavenTestCommand,
  isPytestShellCommand,
  projectRootFromReportFile,
  readFreshTestReport,
} from "./terminal-test-report-ingest";

describe("isPytestShellCommand", () => {
  it("matches pytest invocations", () => {
    expect(isPytestShellCommand("pytest tests/")).toBe(true);
    expect(isPytestShellCommand("python -m pytest -q")).toBe(true);
    expect(isPytestShellCommand("python3 -m pytest")).toBe(true);
    expect(isPytestShellCommand("/usr/bin/py.test")).toBe(true);
  });
  it("ignores other test runners", () => {
    expect(isPytestShellCommand("npm test")).toBe(false);
    expect(isPytestShellCommand("vitest run")).toBe(false);
  });
});

describe("isMavenTestCommand / isGradleTestCommand", () => {
  it("detects mvn test", () => {
    expect(isMavenTestCommand("mvn test")).toBe(true);
    expect(isMavenTestCommand("mvnw -q test")).toBe(true);
    expect(isMavenTestCommand("mvn install")).toBe(false);
  });
  it("detects gradle test", () => {
    expect(isGradleTestCommand("./gradlew test")).toBe(true);
    expect(isGradleTestCommand("gradle test")).toBe(true);
    expect(isGradleTestCommand("gradlew.bat test")).toBe(true);
  });
});

describe("projectRootFromReportFile", () => {
  it("strips .observatory/pytest-report.json", () => {
    const root = path.join(tmpdir(), "obs-root-test");
    const report = path.join(root, ".observatory", "pytest-report.json");
    expect(projectRootFromReportFile(report)).toBe(path.normalize(root));
  });

  it("strips specs/<feature>/.observatory/pytest-report.json", () => {
    const root = path.join(tmpdir(), "obs-sdd-root");
    const report = path.join(
      root,
      "specs",
      "my-feature",
      ".observatory",
      "pytest-report.json"
    );
    expect(projectRootFromReportFile(report)).toBe(path.normalize(root));
  });

  it("strips specs/<feature>/test/pytest-report.json", () => {
    const root = path.join(tmpdir(), "obs-sdd-testdir");
    const report = path.join(
      root,
      "specs",
      "my-feature",
      "test",
      "pytest-report.json"
    );
    expect(projectRootFromReportFile(report)).toBe(path.normalize(root));
  });

  it("strips specs/<feature>/test/report.json", () => {
    const root = path.join(tmpdir(), "obs-sdd-report-json");
    const report = path.join(
      root,
      "specs",
      "my-feature",
      "test",
      "report.json"
    );
    expect(projectRootFromReportFile(report)).toBe(path.normalize(root));
  });

  it("strips specs/<feature>/observatory/report.json", () => {
    const root = path.join(tmpdir(), "obs-sdd-obs-report-json");
    const report = path.join(
      root,
      "specs",
      "my-feature",
      "observatory",
      "report.json"
    );
    expect(projectRootFromReportFile(report)).toBe(path.normalize(root));
  });
});

describe("findTestReportFile", () => {
  let root: string;
  afterEach(() => {
    if (root && fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("walks upward from cwd", () => {
    root = fs.mkdtempSync(path.join(tmpdir(), "obs-pytest-"));
    fs.mkdirSync(path.join(root, "src", "deep"), { recursive: true });
    fs.mkdirSync(path.join(root, ".observatory"));
    const report = path.join(root, ".observatory", "pytest-report.json");
    fs.writeFileSync(report, "{}");
    const found = findTestReportFile(path.join(root, "src", "deep"), [root]);
    expect(found).toBe(report);
  });

  it("falls back to workspace root", () => {
    root = fs.mkdtempSync(path.join(tmpdir(), "obs-pytest-"));
    fs.mkdirSync(path.join(root, ".observatory"));
    const report = path.join(root, ".observatory", "pytest-report.json");
    fs.writeFileSync(report, "{}");
    const found = findTestReportFile(undefined, [root]);
    expect(found).toBe(report);
  });

  it("prefers specs/<active>/observatory/report.json over pytest-report.json", () => {
    root = fs.mkdtempSync(path.join(tmpdir(), "obs-report-pref-"));
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs", ".active"), "my-feature\n");
    fs.mkdirSync(path.join(root, "specs", "my-feature", "observatory"), {
      recursive: true,
    });
    const reportJson = path.join(
      root,
      "specs",
      "my-feature",
      "observatory",
      "report.json"
    );
    fs.writeFileSync(reportJson, "{}");
    const pytestJson = path.join(
      root,
      "specs",
      "my-feature",
      "observatory",
      "pytest-report.json"
    );
    fs.writeFileSync(pytestJson, "{}");
    const found = findTestReportFile(undefined, [root]);
    expect(found).toBe(reportJson);
  });

  it("prefers specs/<active>/observatory over legacy test/ when both have report.json", () => {
    root = fs.mkdtempSync(path.join(tmpdir(), "obs-pref-obs-vs-test-"));
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs", ".active"), "my-feature\n");
    fs.mkdirSync(path.join(root, "specs", "my-feature", "observatory"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(root, "specs", "my-feature", "test"), {
      recursive: true,
    });
    const obsReport = path.join(
      root,
      "specs",
      "my-feature",
      "observatory",
      "report.json"
    );
    fs.writeFileSync(obsReport, "{}");
    const testReport = path.join(
      root,
      "specs",
      "my-feature",
      "test",
      "report.json"
    );
    fs.writeFileSync(testReport, "{}");
    const found = findTestReportFile(undefined, [root]);
    expect(found).toBe(obsReport);
  });

  it("prefers specs/<active>/observatory/pytest-report.json over root .observatory", () => {
    root = fs.mkdtempSync(path.join(tmpdir(), "obs-pytest-"));
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs", ".active"), "my-feature\n");
    fs.mkdirSync(path.join(root, "specs", "my-feature", "observatory"), {
      recursive: true,
    });
    const sddReport = path.join(
      root,
      "specs",
      "my-feature",
      "observatory",
      "pytest-report.json"
    );
    fs.writeFileSync(sddReport, "{}");
    fs.mkdirSync(path.join(root, ".observatory"));
    fs.writeFileSync(path.join(root, ".observatory", "pytest-report.json"), "{}");
    const found = findTestReportFile(undefined, [root]);
    expect(found).toBe(sddReport);
  });

  it("falls back to specs/<active>/.observatory/pytest-report.json when observatory/ and test/ missing", () => {
    root = fs.mkdtempSync(path.join(tmpdir(), "obs-pytest-"));
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs", ".active"), "my-feature\n");
    fs.mkdirSync(
      path.join(root, "specs", "my-feature", ".observatory"),
      { recursive: true }
    );
    const legacyReport = path.join(
      root,
      "specs",
      "my-feature",
      ".observatory",
      "pytest-report.json"
    );
    fs.writeFileSync(legacyReport, "{}");
    fs.mkdirSync(path.join(root, ".observatory"));
    fs.writeFileSync(path.join(root, ".observatory", "pytest-report.json"), "{}");
    const found = findTestReportFile(undefined, [root]);
    expect(found).toBe(legacyReport);
  });

  it("falls back to specs/<active>/test/report.json when observatory/ missing (compat)", () => {
    root = fs.mkdtempSync(path.join(tmpdir(), "obs-compat-test-only-"));
    fs.mkdirSync(path.join(root, "specs"), { recursive: true });
    fs.writeFileSync(path.join(root, "specs", ".active"), "my-feature\n");
    fs.mkdirSync(path.join(root, "specs", "my-feature", "test"), {
      recursive: true,
    });
    const testReport = path.join(
      root,
      "specs",
      "my-feature",
      "test",
      "report.json"
    );
    fs.writeFileSync(testReport, "{}");
    const found = findTestReportFile(undefined, [root]);
    expect(found).toBe(testReport);
  });
});

describe("readFreshTestReport", () => {
  it("reads a recently written file", async () => {
    const root = fs.mkdtempSync(path.join(tmpdir(), "obs-read-"));
    try {
      const file = path.join(root, "pytest-report.json");
      fs.writeFileSync(file, '{"report":1}');
      const text = await readFreshTestReport(file, { maxAgeMs: 60_000 });
      expect(text).toBe('{"report":1}');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
