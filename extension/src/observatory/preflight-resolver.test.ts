import { describe, expect, it } from "vitest";
import { resolveMcpStatusFromStrings } from "./mcp-preflight";

describe("resolveMcpStatusFromStrings", () => {
  it("returns service_missing when service empty", () => {
    expect(resolveMcpStatusFromStrings("", "tool")).toMatchObject({
      status: "service_missing",
    });
  });
  it("returns tool_missing when tool empty", () => {
    expect(resolveMcpStatusFromStrings("svc", "")).toMatchObject({
      status: "tool_missing",
    });
  });
  it("returns configured", () => {
    expect(resolveMcpStatusFromStrings("cicd", "swimlane_deploy")).toEqual({
      status: "configured",
      service: "cicd",
      tool: "swimlane_deploy",
    });
  });
});
