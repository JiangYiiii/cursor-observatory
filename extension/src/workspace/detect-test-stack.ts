/**
 * 按仓库根文件与设置 `observatory.utTest.framework`（旧键 `test.framework` 仍兼容）粗判主测试栈。
 */
import * as fs from "node:fs";
import * as path from "node:path";

export type TestFrameworkSetting = "auto" | "pytest" | "jest" | "junit";

export type TestStack =
  | "python-pytest"
  | "java-maven"
  | "java-gradle"
  | "node"
  | "unknown";

function exists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * 仅根据文件系统信号判断（不读 VS Code 配置）。
 */
export function detectTestStackFromFiles(workspaceRoot: string): TestStack {
  const root = path.normalize(workspaceRoot);
  if (exists(path.join(root, "pom.xml"))) {
    return "java-maven";
  }
  if (
    exists(path.join(root, "build.gradle")) ||
    exists(path.join(root, "build.gradle.kts"))
  ) {
    return "java-gradle";
  }
  const pyMarkers = [
    "pyproject.toml",
    "requirements.txt",
    "setup.py",
    "Pipfile",
    "setup.cfg",
  ];
  for (const m of pyMarkers) {
    if (exists(path.join(root, m))) return "python-pytest";
  }
  const pkg = path.join(root, "package.json");
  if (exists(pkg)) {
    try {
      const raw = fs.readFileSync(pkg, "utf8");
      const j = JSON.parse(raw) as { scripts?: Record<string, string> };
      const scripts = j.scripts ?? {};
      if (typeof scripts.test === "string" && scripts.test.trim().length > 0) {
        return "node";
      }
    } catch {
      /* ignore */
    }
  }
  return "unknown";
}

/**
 * 结合 `observatory.utTest.framework` 与仓库文件。
 */
export function resolveTestStack(
  workspaceRoot: string,
  framework: TestFrameworkSetting
): TestStack {
  if (framework === "pytest") return "python-pytest";
  if (framework === "jest") return "node";
  if (framework === "junit") {
    const root = path.normalize(workspaceRoot);
    if (exists(path.join(root, "pom.xml"))) return "java-maven";
    if (
      exists(path.join(root, "build.gradle")) ||
      exists(path.join(root, "build.gradle.kts"))
    ) {
      return "java-gradle";
    }
    return "unknown";
  }
  return detectTestStackFromFiles(workspaceRoot);
}

/** Run Tests 命令与 onboarding 用的短提示（中文）。 */
export function runTestsHintForStack(stack: TestStack): string {
  switch (stack) {
    case "python-pytest":
      return "在本机终端运行 pytest（建议配合 pytest-json-report 将 JSON 写到 specs/<active>/observatory/pytest-report.json），或使用「导入测试报告」。";
    case "java-maven":
      return "在本机终端运行 mvn test（Surefire 报告可由扩展在测试结束后自动聚合），或使用「导入测试报告」选择 JUnit XML。";
    case "java-gradle":
      return "在本机终端运行 ./gradlew test（或 gradlew.bat test），或使用「导入测试报告」选择 JUnit XML。";
    case "node":
      return "在本机终端运行 npm test / pnpm test / yarn test（按 package.json），或使用「导入测试报告」。";
    default:
      return "在本机运行项目约定的测试命令；规范化结果可放在 specs/<active>/observatory/report.json，或使用「导入测试报告」。";
  }
}
