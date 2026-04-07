import { useEffect, useState } from "react";
import type { PreflightResult } from "@/types/observatory";

type Props = {
  branch: string;
  swimlaneDraft: string;
  onSwimlaneDraftChange: (v: string) => void;
  onBlurSaveSwimlane: () => Promise<void>;
  saving: boolean;
  /** 影响服务展示行（已合并分析 / 手工 / 扩展默认） */
  affectedServicesLine: string;
  /** 手工覆盖列表（英文逗号分隔），写入 observatory-sdd.json */
  deployServicesDraft: string;
  onDeployServicesDraftChange: (v: string) => void;
  onBlurSaveDeployServices: () => Promise<void>;
  /** 来自设置 observatory.deploy.defaultServiceList，只读提示 */
  extensionDefaultServices: string;
  impactFreshness: "fresh" | "stale" | "missing" | "invalid";
  preflight: PreflightResult | null;
  onDeployPrompt: () => void;
};

export function DeployCard({
  branch,
  swimlaneDraft,
  onSwimlaneDraftChange,
  onBlurSaveSwimlane,
  saving,
  affectedServicesLine,
  deployServicesDraft,
  onDeployServicesDraftChange,
  onBlurSaveDeployServices,
  extensionDefaultServices,
  impactFreshness,
  preflight,
  onDeployPrompt,
}: Props) {
  const cicd = preflight?.mcpStatus?.cicd;
  const cicdOk = cicd?.status === "configured";
  const cicdServiceMissing = cicd?.status === "service_missing";
  /** 合并后无任何服务（影响分析无应用 + 未填手工 + 无扩展默认） */
  const noMergedServices =
    !affectedServicesLine.trim() || affectedServicesLine === "—";
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    setConfirmed(false);
  }, [impactFreshness, branch, affectedServicesLine]);

  const needConfirm = impactFreshness !== "fresh";
  const canDeploy = !needConfirm || confirmed;

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          环境部署
        </h3>
        <button
          type="button"
          disabled={!canDeploy}
          onClick={onDeployPrompt}
          className="rounded-md bg-cyan-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-cyan-800 disabled:opacity-50"
        >
          部署泳道
        </button>
      </div>
      <p className="text-[10px] text-zinc-600 dark:text-zinc-300">
        分支：<span className="font-mono">{branch || "—"}</span>
      </p>
      <label className="mt-2 block text-[10px] text-zinc-500">
        泳道（写入 observatory-sdd.json）
        <input
          value={swimlaneDraft}
          disabled={saving}
          onChange={(e) => onSwimlaneDraftChange(e.target.value)}
          onBlur={() => void onBlurSaveSwimlane()}
          className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-[11px] dark:border-zinc-600 dark:bg-zinc-950"
          placeholder="例如 dev-foo"
        />
      </label>
      <label className="mt-2 block text-[10px] text-zinc-500">
        影响服务（手工列表，英文逗号分隔；与影响分析、扩展默认合并展示）
        <input
          value={deployServicesDraft}
          disabled={saving}
          onChange={(e) => onDeployServicesDraftChange(e.target.value)}
          onBlur={() => void onBlurSaveDeployServices()}
          className="mt-1 w-full rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-[11px] dark:border-zinc-600 dark:bg-zinc-950"
          placeholder="例如 user-service, order-service"
        />
      </label>
      {noMergedServices || cicdServiceMissing ? (
        <div
          className={`mt-2 rounded border px-2 py-2 text-[10px] leading-relaxed ${
            noMergedServices
              ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100"
              : "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-200"
          }`}
        >
          {noMergedServices ? (
            <p>
              当前无影响分析中的应用服务（或尚未合并到列表）。请在上框手工填写要部署的服务名，英文逗号分隔；失焦后写入{" "}
              <span className="font-mono">observatory-sdd.json</span> 的{" "}
              <span className="font-mono">deployServiceList</span>。
            </p>
          ) : null}
          {cicdServiceMissing ? (
            <p className={noMergedServices ? "mt-1.5 border-t border-sky-200/80 pt-1.5 dark:border-sky-800/80" : ""}>
              CICD MCP 显示 <span className="font-mono">service_missing</span>
              （未配置服务名）。可在 Cursor MCP / Observatory 设置中补全 CICD
              服务标识；部署目标服务仍可在上框手工填写，供生成部署 Prompt。
            </p>
          ) : null}
        </div>
      ) : null}
      {extensionDefaultServices.trim() ? (
        <p className="mt-1 text-[10px] text-zinc-500">
          扩展默认服务（设置项 observatory.deploy.defaultServiceList）：{" "}
          <span className="font-mono text-zinc-700 dark:text-zinc-300">
            {extensionDefaultServices.trim()}
          </span>
        </p>
      ) : null}
      <p className="mt-2 text-[10px] text-zinc-600 dark:text-zinc-300">
        合并后影响服务：{affectedServicesLine}
      </p>
      <div className="mt-2 rounded bg-zinc-50 px-2 py-1 text-[10px] dark:bg-zinc-800/60">
        <div className="text-zinc-500">CICD MCP</div>
        <div className="font-mono text-zinc-800 dark:text-zinc-100">
          {cicdOk
            ? `已配置 · ${cicd?.service ?? ""} / ${cicd?.tool ?? ""}`
            : `未就绪 · ${cicd?.status ?? "unknown"}`}
        </div>
      </div>
      {needConfirm ? (
        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-2 text-[10px] text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="mb-1">
            影响分析非最新：部署前请确认服务列表仍正确。
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            我已确认服务列表
          </label>
        </div>
      ) : null}
    </section>
  );
}
