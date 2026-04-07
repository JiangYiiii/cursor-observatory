/**
 * 工作区扫描时忽略的目录：依赖与构建产物，避免读「包」内文档/脚本。
 * 与 fast-glob 的 ignore 语法一致。
 */
export const OBSERVATORY_WORKSPACE_SCAN_IGNORE: string[] = [
  "**/node_modules/**",
  "**/.venv/**",
  "**/venv/**",
  "**/__pycache__/**",
  "**/__pypackages__/**",
  "**/site-packages/**",
  "**/vendor/**",
  "**/.git/**",
  "**/dist/**",
  "**/.tox/**",
  "**/.eggs/**",
  "**/*.egg-info/**",
];
