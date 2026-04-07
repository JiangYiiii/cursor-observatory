import { describe, expect, it } from "vitest";
import { ObservatoryStateMachine } from "./observatory-state-machine";

describe("ObservatoryStateMachine", () => {
  it("transitions INITIALIZING → READY", () => {
    const m = new ObservatoryStateMachine();
    const seen: string[] = [];
    m.subscribe((s) => seen.push(s));
    expect(m.getPhase()).toBe("INITIALIZING");
    m.markReady();
    expect(m.getPhase()).toBe("READY");
    expect(seen).toEqual(["READY"]);
  });

  it("SCANNING then DEGRADED on failure path", () => {
    const m = new ObservatoryStateMachine();
    m.markReady();
    m.beginScanning();
    expect(m.getPhase()).toBe("SCANNING");
    m.markDegraded();
    expect(m.getPhase()).toBe("DEGRADED");
  });
});
