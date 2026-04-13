import { useState, useCallback, useEffect, useMemo } from "react";
import { buildCanaryTrafficWeights } from "@/lib/canary-traffic-weights";
import { isAtBlueGreenTrafficStage } from "@/lib/release-traffic-stage";
import { useReleaseStore } from "@/store/release-store";
import { Minus, Plus } from "lucide-react";
import { TrafficBar } from "./TrafficBar";

const PRESETS = [0, 25, 50, 75, 100] as const;
const STEP = 5;

export function TrafficControlPanel() {
  const selectedPipelines = useReleaseStore((s) => s.selectedPipelines);
  const pipelines = useReleaseStore((s) => s.pipelines);
  const stageSummaries = useReleaseStore((s) => s.stageSummaries);
  const canaryStates = useReleaseStore((s) => s.canaryStates);
  const shiftTraffic = useReleaseStore((s) => s.shiftTraffic);
  const shifting = useReleaseStore((s) => s.loading.shifting);
  const trafficPrecheckByPipeline = useReleaseStore((s) => s.trafficPrecheckByPipeline);
  const refreshTrafficPrecheckForPipelines = useReleaseStore((s) => s.refreshTrafficPrecheckForPipelines);

  const [batchInput, setBatchInput] = useState("");

  const canaryPipelines = useMemo(
    () =>
      selectedPipelines.filter((name) => {
        const p = pipelines.find((pp) => pp.name === name);
        return p?.hasCanary && canaryStates[name];
      }),
    [selectedPipelines, pipelines, canaryStates],
  );

  const anyTrafficPrecheckBlocked = useMemo(
    () =>
      canaryPipelines.some((name) => trafficPrecheckByPipeline[name]?.canSwitch === false),
    [canaryPipelines, trafficPrecheckByPipeline],
  );

  const notAtBlueGreenSwitchStage = useMemo(() => {
    return canaryPipelines.filter((name) => {
      const st = stageSummaries[name];
      const p = pipelines.find((x) => x.name === name);
      return Boolean(st && !isAtBlueGreenTrafficStage(st, p?.ksPipelineType));
    });
  }, [canaryPipelines, stageSummaries, pipelines]);

  useEffect(() => {
    if (canaryPipelines.length === 0) return;
    void refreshTrafficPrecheckForPipelines(canaryPipelines);
  }, [canaryPipelines, refreshTrafficPrecheckForPipelines]);

  const handleWeightChange = useCallback(
    (pipeline: string, greenPercent: number) => {
      const pre = trafficPrecheckByPipeline[pipeline];
      if (pre && pre.canSwitch === false) return;
      const clamped = Math.max(0, Math.min(100, greenPercent));
      const canary = canaryStates[pipeline];
      if (!canary) return;
      const bluePercent = 100 - clamped;
      void shiftTraffic(pipeline, buildCanaryTrafficWeights(canary, bluePercent, clamped));
    },
    [canaryStates, shiftTraffic, trafficPrecheckByPipeline],
  );

  const applyPreset = useCallback(
    (percent: number) => {
      if (anyTrafficPrecheckBlocked) return;
      for (const name of canaryPipelines) {
        handleWeightChange(name, percent);
      }
    },
    [anyTrafficPrecheckBlocked, canaryPipelines, handleWeightChange],
  );

  const applyStep = useCallback(
    (delta: number) => {
      if (anyTrafficPrecheckBlocked) return;
      for (const name of canaryPipelines) {
        const canary = canaryStates[name];
        if (!canary) continue;
        handleWeightChange(name, canary.greenWeight + delta);
      }
    },
    [anyTrafficPrecheckBlocked, canaryPipelines, canaryStates, handleWeightChange],
  );

  const applyBatch = useCallback(() => {
    const num = Number(batchInput);
    if (Number.isNaN(num) || num < 0 || num > 100) return;
    applyPreset(Math.round(num));
  }, [batchInput, applyPreset]);

  if (canaryPipelines.length === 0) return null;

  return (
    <section
      className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-[#2a2a3c]"
      aria-label="蓝绿切流"
    >
      <header className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">蓝绿切流</h2>
      </header>

      <div className="space-y-4 px-4 py-3">
        {notAtBlueGreenSwitchStage.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50/90 px-3 py-2 text-[10px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">阶段提示</p>
            <p className="mt-0.5">
              下列流水线尚未处于「待蓝绿切流」阶段，此时调整比例可能无效；建议先在 KubeSphere
              流水线推进到灰度/切流步骤后再操作。
            </p>
            <ul className="mt-1 list-inside list-disc">
              {notAtBlueGreenSwitchStage.map((name) => (
                <li key={name}>
                  <span className="font-mono">{name}</span>
                  {stageSummaries[name] && (
                    <span className="text-amber-800 dark:text-amber-300/90">
                      {" "}
                      — {stageSummaries[name].stageLabel}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {canaryPipelines.map((name) => {
          const canary = canaryStates[name]!;
          return (
            <TrafficBar
              key={name}
              pipeline={name}
              canary={canary}
              precheck={trafficPrecheckByPipeline[name] ?? undefined}
              shifting={shifting}
              onWeightChange={(g) => handleWeightChange(name, g)}
            />
          );
        })}

        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-700">
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={shifting || anyTrafficPrecheckBlocked}
                onClick={() => applyPreset(p)}
                className="rounded border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                {p === 0 ? "←0%" : `→${p}%`}
              </button>
            ))}
            <span className="mx-1 text-zinc-300 dark:text-zinc-600">|</span>
            <button
              type="button"
              disabled={shifting || anyTrafficPrecheckBlocked}
              onClick={() => applyStep(-STEP)}
              className="inline-flex items-center gap-0.5 rounded border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <Minus className="h-3 w-3" />5%
            </button>
            <button
              type="button"
              disabled={shifting || anyTrafficPrecheckBlocked}
              onClick={() => applyStep(STEP)}
              className="inline-flex items-center gap-0.5 rounded border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <Plus className="h-3 w-3" />5%
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">批量设置绿版本比例:</label>
          <input
            type="number"
            min={0}
            max={100}
            value={batchInput}
            onChange={(e) => setBatchInput(e.target.value)}
            className="w-16 rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200"
            placeholder="%"
          />
          <button
            type="button"
            disabled={shifting || anyTrafficPrecheckBlocked || !batchInput}
            onClick={applyBatch}
            className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            应用到所有已选
          </button>
        </div>
      </div>
    </section>
  );
}
