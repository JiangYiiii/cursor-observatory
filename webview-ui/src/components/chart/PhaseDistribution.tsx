/**
 * 能力阶段分布（横向柱状图）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.1
 */
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEcharts from "echarts-for-react";
import { useMemo } from "react";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);
import type { Capability } from "@/types/observatory";
import { phaseRowsForChart } from "@/lib/overview-aggregates";

type Props = {
  capabilities: Capability[];
  dark: boolean;
  className?: string;
};

export function PhaseDistribution({
  capabilities,
  dark,
  className = "",
}: Props) {
  const rows = useMemo(
    () => phaseRowsForChart(capabilities),
    [capabilities]
  );

  const option = useMemo(() => {
    const text = dark ? "#e4e4e7" : "#3f3f46";
    const line = dark ? "#52525b" : "#d4d4d8";
    const labels = rows.map((r) => r.label);
    const values = rows.map((r) => r.count);
    return {
      grid: { left: 72, right: 16, top: 12, bottom: 8, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
      },
      xAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { lineStyle: { color: line } },
        axisLabel: { color: text },
        splitLine: { lineStyle: { color: dark ? "#3f3f46" : "#e4e4e7" } },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: line } },
        axisLabel: { color: text, fontSize: 12 },
        inverse: true,
      },
      series: [
        {
          type: "bar",
          data: values,
          itemStyle: {
            color: dark ? "#60a5fa" : "#3b82f6",
            borderRadius: [0, 4, 4, 0],
          },
          barMaxWidth: 22,
        },
      ],
    };
  }, [rows, dark]);

  if (capabilities.length === 0) {
    return (
      <p className={`text-sm text-zinc-500 dark:text-zinc-400 ${className}`}>
        暂无需求数据，请先执行全量扫描。
      </p>
    );
  }

  return (
    <div className={className}>
      <ReactEcharts
        echarts={echarts}
        option={option}
        style={{ height: Math.max(220, rows.length * 36 + 40) }}
        notMerge
        lazyUpdate
      />
    </div>
  );
}
