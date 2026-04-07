/**
 * 手动维护某能力的期望测试场景（test-expectations.json）。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §四, docs/FRONTEND_DESIGN.md §4.7
 */
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  buildTestExpectationsDocument,
  parseCapabilityBlock,
  syncCoveredFromTestResults,
} from "@/lib/test-expectations-sync";
import { getDataSource } from "@/services/data-source-instance";
import type {
  CapabilityExpectationBlock,
  ExpectationScenario,
  TestExpectations,
  TestResults,
} from "@/types/observatory";

const PRIORITIES = ["critical", "high", "medium", "low"] as const;

type Props = {
  capabilityId: string;
  testExpectations: TestExpectations | null;
  testResults: TestResults | null;
  onSaved: () => Promise<void>;
};

export function ExpectationScenarioEditor({
  capabilityId,
  testExpectations,
  testResults,
  onSaved,
}: Props) {
  const [block, setBlock] = useState<CapabilityExpectationBlock>({
    scenarios: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = testExpectations?.expectations?.[capabilityId];
    setBlock(parseCapabilityBlock(raw));
    setError(null);
  }, [capabilityId, testExpectations]);

  function updateScenario(
    index: number,
    patch: Partial<ExpectationScenario>
  ): void {
    setBlock((b) => ({
      ...b,
      scenarios: b.scenarios.map((s, i) =>
        i === index ? { ...s, ...patch } : s
      ),
    }));
  }

  function removeScenario(index: number): void {
    setBlock((b) => ({
      ...b,
      scenarios: b.scenarios.filter((_, i) => i !== index),
    }));
  }

  function addScenario(): void {
    setBlock((b) => ({
      ...b,
      scenarios: [
        ...b.scenarios,
        { name: "", priority: "medium", covered: false },
      ],
    }));
  }

  function onSyncFromResults(): void {
    setBlock((b) =>
      syncCoveredFromTestResults(capabilityId, b, testResults)
    );
  }

  async function onSave(): Promise<void> {
    const names = block.scenarios.map((s) => s.name.trim());
    if (names.some((n) => !n)) {
      setError("请填写所有场景名称（或删除空行）。");
      return;
    }
    if (new Set(names).size !== names.length) {
      setError("场景名称在同一能力下需唯一。");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const normalizedScenarios = block.scenarios.map((s) => ({
        ...s,
        priority: PRIORITIES.includes(
          s.priority as (typeof PRIORITIES)[number]
        )
          ? s.priority
          : "medium",
      }));
      const doc = buildTestExpectationsDocument(
        testExpectations,
        capabilityId,
        {
          ...block,
          scenarios: normalizedScenarios,
          analysis_method: block.analysis_method || "manual",
        }
      );
      await getDataSource().saveTestExpectations(doc);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => addScenario()}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          <Plus className="size-3.5" aria-hidden />
          添加场景
        </button>
        <button
          type="button"
          onClick={() => onSyncFromResults()}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          title="根据已通过用例的 scenario 标记与场景名称匹配，将 covered 置为 true"
        >
          <RefreshCw className="size-3.5" aria-hidden />
          从测试结果同步覆盖
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave()}
          className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          <Save className="size-3.5" aria-hidden />
          {saving ? "保存中…" : "保存到 .observatory"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-600">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-600 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">场景名称</th>
              <th className="w-32 px-3 py-2 font-medium">优先级</th>
              <th className="w-24 px-3 py-2 font-medium">已覆盖</th>
              <th className="w-12 px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {block.scenarios.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-zinc-500"
                >
                  暂无场景。点击「添加场景」或使用「从测试结果同步」前先添加名称行。
                </td>
              </tr>
            ) : (
              block.scenarios.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-zinc-100 dark:border-zinc-700/80"
                >
                  <td className="px-3 py-2">
                    <input
                      className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                      value={row.name}
                      onChange={(e) =>
                        updateScenario(i, { name: e.target.value })
                      }
                      placeholder="与 @pytest.mark.scenario 或设计文档一致"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                      value={
                        PRIORITIES.includes(
                          row.priority as (typeof PRIORITIES)[number]
                        )
                          ? row.priority
                          : "medium"
                      }
                      onChange={(e) =>
                        updateScenario(i, { priority: e.target.value })
                      }
                    >
                      {PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={row.covered}
                        onChange={(e) =>
                          updateScenario(i, { covered: e.target.checked })
                        }
                      />
                      <span className="text-xs">covered</span>
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeScenario(i)}
                      className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                      aria-label="删除场景"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        保存后写入工作区{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
          .observatory/test-expectations.json
        </code>
        ；「同步覆盖」依赖用例上的{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">
          scenario
        </code>{" "}
        字段与场景名称一致。
      </p>
    </div>
  );
}
