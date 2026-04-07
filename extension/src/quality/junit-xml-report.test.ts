import { describe, expect, it } from "vitest";
import { buildTestResultsFromJUnitXml, mergeJUnitXmlReports } from "./junit-xml-report";

describe("buildTestResultsFromJUnitXml", () => {
  it("parses minimal Surefire TEST-*.xml", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.example.DemoTest" tests="2" failures="1" errors="0" skipped="0" time="0.05">
  <testcase name="testOk" classname="com.example.DemoTest" time="0.01"/>
  <testcase name="testFail" classname="com.example.DemoTest" time="0.02">
    <failure message="assert" type="AssertionError">expected:&lt;1&gt; but was:&lt;2&gt;</failure>
  </testcase>
</testsuite>`;
    const { testResults } = buildTestResultsFromJUnitXml(xml);
    expect(testResults.runner).toBe("junit");
    expect(testResults.test_cases).toHaveLength(2);
    expect(testResults.test_cases[0].status).toBe("passed");
    expect(testResults.test_cases[1].status).toBe("failed");
    expect(testResults.summary.total).toBe(2);
    expect(testResults.summary.passed).toBe(1);
    expect(testResults.summary.failed).toBe(1);
  });
});

describe("mergeJUnitXmlReports", () => {
  it("merges two fragments", () => {
    const a = `<testsuite tests="1" failures="0" time="0.01"><testcase name="a" classname="A" time="0.01"/></testsuite>`;
    const b = `<testsuite tests="1" failures="0" time="0.01"><testcase name="b" classname="B" time="0.01"/></testsuite>`;
    const { testResults } = mergeJUnitXmlReports([
      { xml: a, sourceHint: "a.xml" },
      { xml: b, sourceHint: "b.xml" },
    ]);
    expect(testResults.test_cases).toHaveLength(2);
    expect(testResults.summary.total).toBe(2);
  });
});
