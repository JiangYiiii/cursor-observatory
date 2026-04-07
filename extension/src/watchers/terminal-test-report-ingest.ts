/**
 * 终端测试结束后定位报告：pytest-json-report、规范化 report.json、Surefire XML。
 * 默认优先：`specs/<active>/observatory/report.json` → `test/`（兼容）→ 旧 `.observatory` → 根 `.observatory`。
 */
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import fg from "fast-glob";
import {
  resolveLegacySddObservatoryDir,
  resolveSddFeatureObservatoryDir,
  resolveSddFeatureTestDir,
  SDD_TEST_REPORT_JSON,
} from "../observatory/sdd-test-paths";

export const PYTEST_REPORT_REL = path.join(".observatory", "pytest-report.json");

export function reportPathUnderRoot(projectRoot: string): string {
  return path.join(projectRoot, PYTEST_REPORT_REL);
}

/**
 * `…/项目/.observatory/*.json` 或 `…/specs/<feature>/(observatory|test|.observatory)/*.json` → 项目根目录
 */
export function projectRootFromReportFile(reportPath: string): string {
  const norm = path.normalize(reportPath);
  const obsDir = path.dirname(norm);
  const parent = path.dirname(obsDir);
  if (path.basename(path.dirname(parent)) === "specs") {
    return path.dirname(path.dirname(parent));
  }
  return parent;
}

const SDD_CANDIDATES = [SDD_TEST_REPORT_JSON, "pytest-report.json"] as const;

function tryTestReportUnderRoot(projectRoot: string): string | undefined {
  const tryDir = (dir: string | undefined): string | undefined => {
    if (!dir) return undefined;
    for (const name of SDD_CANDIDATES) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) return p;
    }
    return undefined;
  };
  const fromObs = tryDir(resolveSddFeatureObservatoryDir(projectRoot));
  if (fromObs) return fromObs;
  const fromTest = tryDir(resolveSddFeatureTestDir(projectRoot));
  if (fromTest) return fromTest;
  const fromLegacyDot = tryDir(resolveLegacySddObservatoryDir(projectRoot));
  if (fromLegacyDot) return fromLegacyDot;
  const obsReport = path.join(projectRoot, ".observatory", SDD_TEST_REPORT_JSON);
  if (fs.existsSync(obsReport)) return obsReport;
  const legacy = reportPathUnderRoot(projectRoot);
  if (fs.existsSync(legacy)) return legacy;
  return undefined;
}

function rootContaining(
  dir: string,
  rootsN: string[]
): string | undefined {
  const d = path.normalize(dir);
  for (const r of rootsN) {
    if (d === r || d.startsWith(r + path.sep)) return r;
  }
  return undefined;
}

/**
 * 优先 `specs/<active>/observatory`，其次兼容 `test/`、旧 `specs/<active>/.observatory`，再根 `.observatory`；先按 cwd 向上解析所属 workspace，再回退各根目录。
 */
export function findTestReportFile(
  cwdFsPath: string | undefined,
  workspaceRoots: string[]
): string | undefined {
  const rootsN = [...workspaceRoots.map((r) => path.normalize(r))].sort(
    (a, b) => b.length - a.length
  );

  if (cwdFsPath) {
    let dir = path.normalize(cwdFsPath);
    for (;;) {
      const root = rootContaining(dir, rootsN);
      if (root) {
        const hit = tryTestReportUnderRoot(root);
        if (hit) return hit;
      }
      const candidate = path.join(dir, ".observatory", SDD_TEST_REPORT_JSON);
      if (fs.existsSync(candidate)) return candidate;
      const candidatePy = reportPathUnderRoot(dir);
      if (fs.existsSync(candidatePy)) return candidatePy;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  for (const r of rootsN) {
    const hit = tryTestReportUnderRoot(r);
    if (hit) return hit;
  }
  return undefined;
}

/** @deprecated 使用 findTestReportFile */
export const findPytestReportFile = findTestReportFile;

const DEFAULT_MAX_AGE_MS = 120_000;
const DEFAULT_RETRIES = 6;
const DEFAULT_DELAY_MS = 120;

/**
 * 带短暂重试的读取；若 mtime 早于「现在」超过 maxAgeMs 则视为陈旧，不导入。
 */
export async function readFreshTestReport(
  filePath: string,
  opts?: { maxAgeMs?: number; retries?: number; delayMs?: number }
): Promise<string | undefined> {
  const maxAgeMs = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  const delayMs = opts?.delayMs ?? DEFAULT_DELAY_MS;

  for (let i = 0; i < retries; i++) {
    try {
      const stat = await fsp.stat(filePath);
      if (Date.now() - stat.mtimeMs > maxAgeMs) return undefined;
      return await fsp.readFile(filePath, "utf8");
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return undefined;
}

export const readFreshPytestReport = readFreshTestReport;

export function isPytestShellCommand(commandLine: string): boolean {
  const c = commandLine.toLowerCase();
  return (
    /\bpytest\b/.test(c) ||
    c.includes("py.test") ||
    c.includes("python -m pytest") ||
    c.includes("python3 -m pytest")
  );
}

export function isMavenTestCommand(commandLine: string): boolean {
  const c = commandLine.toLowerCase();
  return /\bmvn(w)?(\.cmd)?\b/.test(c) && /\btest\b/.test(c);
}

export function isGradleTestCommand(commandLine: string): boolean {
  const c = commandLine.toLowerCase();
  return (
    (/\bgradlew\b/.test(c) || /\bgradle\.bat\b/.test(c) || /\bgradle\b/.test(c)) &&
    /\btest\b/.test(c)
  );
}

/**
 * 收集 workspace 内最近更新的 Surefire / Gradle TEST-*.xml（用于 mvn test / gradlew test 结束后自动导入）。
 */
export async function collectFreshSurefireXmlFiles(
  workspaceRoot: string,
  opts?: { maxAgeMs?: number }
): Promise<string[]> {
  const maxAgeMs = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const now = Date.now();
  const patterns = [
    "**/target/surefire-reports/TEST-*.xml",
    "**/build/test-results/test/TEST-*.xml",
  ];
  const files = await fg(patterns, {
    cwd: workspaceRoot,
    absolute: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**", "**/.git/**"],
  });
  const fresh: string[] = [];
  for (const f of files) {
    try {
      const st = await fsp.stat(f);
      if (now - st.mtimeMs <= maxAgeMs) fresh.push(f);
    } catch {
      /* skip */
    }
  }
  return fresh.sort();
}
