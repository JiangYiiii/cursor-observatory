/**
 * SDD 特性下本地 Observatory 产物目录：`specs/<active>/observatory/`（建议 gitignore，仅本机）
 * 兼容读取旧路径：`specs/<feature>/test/`、`specs/<feature>/.observatory/`
 * `specs/.active` 首行为当前 feature 目录名（与 sdd-scanner 一致）。
 */
import * as fs from "node:fs";
import * as path from "node:path";

export const SPECS_ACTIVE_REL = path.join("specs", ".active");

/** SDD 下规范化测试结果（与 `.observatory/test-results.json` 同 schema） */
export const SDD_TEST_REPORT_JSON = "report.json";

/** `specs/<feature>/observatory`（绝对路径），读写主路径 */
export function sddFeatureObservatoryDirAbs(
  workspaceRoot: string,
  featureName: string
): string {
  return path.join(workspaceRoot, "specs", featureName, "observatory");
}

/**
 * 迁移过渡期：`specs/<feature>/test`（绝对路径），仅兼容读取。
 */
export function sddFeatureTestDirAbs(
  workspaceRoot: string,
  featureName: string
): string {
  return path.join(workspaceRoot, "specs", featureName, "test");
}

/**
 * 旧约定 `specs/<feature>/.observatory`（绝对路径），仅用于读取兼容。
 */
export function sddLegacyFeatureObservatoryDirAbs(
  workspaceRoot: string,
  featureName: string
): string {
  return path.join(workspaceRoot, "specs", featureName, ".observatory");
}

export function readActiveFeatureNameSync(
  workspaceRoot: string
): string | undefined {
  const p = path.join(workspaceRoot, SPECS_ACTIVE_REL);
  try {
    const text = fs.readFileSync(p, "utf8");
    const line = text.split(/\r?\n/)[0]?.trim();
    return line && line.length > 0 ? line : undefined;
  } catch {
    return undefined;
  }
}

function resolveActiveFeaturePathIfDir(
  workspaceRoot: string
): string | undefined {
  const active = readActiveFeatureNameSync(workspaceRoot);
  if (!active) return undefined;
  const featurePath = path.join(workspaceRoot, "specs", active);
  try {
    if (!fs.statSync(featurePath).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  return active;
}

/**
 * 若存在 `specs/.active` 且 `specs/<name>/` 为目录，返回其下 `observatory` 绝对路径（目录未必已创建）。
 */
export function resolveSddFeatureObservatoryDir(
  workspaceRoot: string
): string | undefined {
  const active = resolveActiveFeaturePathIfDir(workspaceRoot);
  if (!active) return undefined;
  return sddFeatureObservatoryDirAbs(workspaceRoot, active);
}

/**
 * 若存在 `specs/.active` 且 `specs/<name>/` 为目录，返回其下 `test` 绝对路径（兼容旧仓库读取）。
 */
export function resolveSddFeatureTestDir(
  workspaceRoot: string
): string | undefined {
  const active = resolveActiveFeaturePathIfDir(workspaceRoot);
  if (!active) return undefined;
  return sddFeatureTestDirAbs(workspaceRoot, active);
}

/**
 * 旧路径 `specs/<active>/.observatory`，仅用于读取兼容（pytest-report / test-results）。
 */
export function resolveLegacySddObservatoryDir(
  workspaceRoot: string
): string | undefined {
  const active = resolveActiveFeaturePathIfDir(workspaceRoot);
  if (!active) return undefined;
  return sddLegacyFeatureObservatoryDirAbs(workspaceRoot, active);
}

/** `specs/<active>/observatory/report.json` 绝对路径；无 SDD active 时返回 undefined。 */
export function resolveSddReportJsonAbsPath(
  workspaceRoot: string
): string | undefined {
  const dir = resolveSddFeatureObservatoryDir(workspaceRoot);
  return dir ? path.join(dir, SDD_TEST_REPORT_JSON) : undefined;
}
