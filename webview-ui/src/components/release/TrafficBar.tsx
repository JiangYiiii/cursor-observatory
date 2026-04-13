import { useCallback, useEffect, useState } from "react";
import type { CanaryDeployment, CanarySwitchPreCheck } from "@/types/observatory";
import { AlertTriangle, X } from "lucide-react";
import { TrafficSlider } from "./TrafficSlider";

/** 与 preStepCanarySwitchStatus 预检失败时展示（服务端未返回文案时的默认提示） */
export const CANARY_STAGE_NOT_READY_MESSAGE =
  "该流水线蓝绿部署状态未到canary阶段，请稍后再试！";

interface TrafficBarProps {
  pipeline: string;
  canary: CanaryDeployment;
  precheck?: CanarySwitchPreCheck;
  shifting?: boolean;
  onWeightChange: (greenPercent: number) => void;
}

function shortVersion(v: string): string {
  if (!v) return "—";
  return v.length > 16 ? v.slice(0, 16) + "…" : v;
}

export function TrafficBar({ pipeline, canary, precheck, shifting, onWeightChange }: TrafficBarProps) {
  const greenPercent = canary.greenWeight;
  const bluePercent = canary.blueWeight;
  const trafficBlocked = Boolean(precheck && !precheck.canSwitch);

  const [sliderKey, setSliderKey] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingGreen, setPendingGreen] = useState<number | null>(null);

  const pendingBlue = pendingGreen !== null ? 100 - pendingGreen : 0;

  const handleSliderCommitIntent = useCallback(
    (nextGreen: number) => {
      if (trafficBlocked) return;
      setPendingGreen(nextGreen);
      setConfirmOpen(true);
    },
    [trafficBlocked],
  );

  const handleConfirm = useCallback(() => {
    if (pendingGreen === null) return;
    const g = pendingGreen;
    setConfirmOpen(false);
    setPendingGreen(null);
    onWeightChange(g);
  }, [pendingGreen, onWeightChange]);

  const handleCancel = useCallback(() => {
    setConfirmOpen(false);
    setPendingGreen(null);
    setSliderKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, handleCancel]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-zinc-700 dark:text-zinc-200">
        <span>{pipeline}</span>
        <span className="flex gap-2">
          <button
            type="button"
            disabled={shifting || trafficBlocked}
            className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
            onClick={() => onWeightChange(50)}
          >
            →50%
          </button>
          <button
            type="button"
            disabled={shifting || trafficBlocked}
            className="rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
            onClick={() => onWeightChange(100)}
          >
            →100%
          </button>
        </span>
      </div>

      {trafficBlocked && (
        <p
          className="text-[10px] leading-relaxed text-red-600 dark:text-red-400"
          title={precheck?.reason}
        >
          {CANARY_STAGE_NOT_READY_MESSAGE}
          {precheck?.reason && precheck.reason.trim() && precheck.reason.trim() !== CANARY_STAGE_NOT_READY_MESSAGE ? (
            <span className="mt-0.5 block text-zinc-500 dark:text-zinc-400">{precheck.reason}</span>
          ) : null}
        </p>
      )}

      <div className="flex items-center gap-2 text-[10px]">
        <span className="w-28 shrink-0 truncate text-blue-600 dark:text-blue-400" title={canary.blueVersion}>
          蓝({shortVersion(canary.blueVersion)}) {bluePercent}%
        </span>
        <div className="min-w-0 flex-1">
          <TrafficSlider
            key={sliderKey}
            value={greenPercent}
            onChange={handleSliderCommitIntent}
            disabled={shifting || trafficBlocked}
          />
        </div>
        <span
          className="w-28 shrink-0 truncate text-right text-emerald-600 dark:text-emerald-400"
          title={canary.greenVersion}
        >
          {greenPercent}% 绿({shortVersion(canary.greenVersion)})
        </span>
      </div>

      {confirmOpen && pendingGreen !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="presentation"
          onClick={handleCancel}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="traffic-slider-confirm-title"
            className="w-full max-w-md rounded-xl bg-white p-0 shadow-2xl dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
              <h2 id="traffic-slider-confirm-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                确认切流
              </h2>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-3 px-4 py-3">
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                流水线{" "}
                <span className="font-medium text-zinc-800 dark:text-zinc-200">{pipeline}</span>
                ：是否将流量调整为
                <span className="whitespace-nowrap font-medium text-blue-600 dark:text-blue-400">
                  {" "}
                  蓝 {pendingBlue}%
                </span>
                <span className="whitespace-nowrap font-medium text-emerald-600 dark:text-emerald-400">
                  {" "}
                  / 绿 {pendingGreen}%
                </span>
                ？
              </p>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                当前为 蓝 {bluePercent}% / 绿 {greenPercent}%
              </p>
              {(pendingGreen === 100 || pendingGreen === 0) && (
                <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    {pendingGreen === 100 && <p>将完全切到新版本（绿）流量。</p>}
                    {pendingGreen === 0 && <p>将新版本（绿）流量降至零。</p>}
                  </div>
                </div>
              )}
            </div>
            <footer className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={Boolean(shifting)}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
              >
                确认切流
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
