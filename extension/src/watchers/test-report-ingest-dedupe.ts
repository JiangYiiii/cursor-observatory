/**
 * 终端结束与文件监听可能先后触发同一 report.json 的导入；短窗口内去重，避免重复追加 test-history。
 */
const DEDUPE_MS = 4000;
const lastIngestByPath = new Map<string, number>();

export function shouldSkipRecentTestReportIngest(
  reportFilePath: string
): boolean {
  const key = reportFilePath;
  const t = lastIngestByPath.get(key) ?? 0;
  return Date.now() - t < DEDUPE_MS;
}

export function markTestReportIngested(reportFilePath: string): void {
  lastIngestByPath.set(reportFilePath, Date.now());
}
