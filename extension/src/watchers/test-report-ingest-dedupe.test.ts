import { afterEach, describe, expect, it, vi } from "vitest";
import {
  markTestReportIngested,
  shouldSkipRecentTestReportIngest,
} from "./test-report-ingest-dedupe";

describe("test-report-ingest-dedupe", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not skip before any ingest", () => {
    expect(shouldSkipRecentTestReportIngest("/tmp/a/report.json")).toBe(false);
  });

  it("skips within dedupe window after mark", () => {
    const p = "/proj/specs/foo/test/report.json";
    expect(shouldSkipRecentTestReportIngest(p)).toBe(false);
    markTestReportIngested(p);
    expect(shouldSkipRecentTestReportIngest(p)).toBe(true);
  });

  it("allows ingest again after dedupe window", async () => {
    vi.useFakeTimers();
    const p = "/proj/specs/foo/test/report.json";
    markTestReportIngested(p);
    expect(shouldSkipRecentTestReportIngest(p)).toBe(true);
    await vi.advanceTimersByTimeAsync(4001);
    expect(shouldSkipRecentTestReportIngest(p)).toBe(false);
  });

  it("tracks paths independently", () => {
    markTestReportIngested("/a/x.json");
    expect(shouldSkipRecentTestReportIngest("/b/y.json")).toBe(false);
  });
});
