import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findAgentTranscriptsAncestor } from "./agent-transcripts-ancestry";

describe("findAgentTranscriptsAncestor", () => {
  let tmp: string | undefined;
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it("resolves from nested session jsonl path", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "obs-at-"));
    const at = path.join(tmp, "agent-transcripts");
    const sid = "0b0582dd-82ab-4d7d-84ef-2a7b00ec7bc9";
    const sessionDir = path.join(at, sid);
    fs.mkdirSync(sessionDir, { recursive: true });
    const jsonl = path.join(sessionDir, `${sid}.jsonl`);
    fs.writeFileSync(jsonl, "{}\n", "utf8");

    expect(findAgentTranscriptsAncestor(jsonl)).toBe(at);
    expect(findAgentTranscriptsAncestor(sessionDir)).toBe(at);
    expect(findAgentTranscriptsAncestor(at)).toBe(at);
  });

  it("returns null when agent-transcripts is not in ancestry", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "obs-at-"));
    const loose = path.join(tmp, "somewhere", "x.jsonl");
    fs.mkdirSync(path.dirname(loose), { recursive: true });
    fs.writeFileSync(loose, "{}\n", "utf8");
    expect(findAgentTranscriptsAncestor(loose)).toBeNull();
  });
});
