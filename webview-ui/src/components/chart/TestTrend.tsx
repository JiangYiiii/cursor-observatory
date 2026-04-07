/**
 * 测试历史趋势：用例数 + 通过率（近若干次运行）。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §5.4
 */
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEcharts from "echarts-for-react";
import { useMemo } from "react";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
]);

type Point = { ts: string; total: number; passRate: number };

type Props = {
  series: Point[];
  dark: boolean;
  /** 选能力时展示副标题 */
  subtitle?: string;
  className?: string;
};

export function TestTrend({ series, dark, subtitle, className = "" }: Props) {
  const option = useMemo(() => {
    const text = dark ? "#e4e4e7" : "#3f3f46";
    const line = dark ? "#52525b" : "#d4d4d8";
    const labels = series.map((p) => {
      const d = new Date(p.ts);
      return Number.isNaN(d.getTime())
        ? p.ts
        : `${d.getMonth() + 1}/${d.getDate()}`;
    });
    return {
      grid: { left: 48, right: 56, top: subtitle ? 40 : 28, bottom: 28 },
      tooltip: { trigger: "axis" },
      legend: {
        data: ["用例数", "通过率 %"],
        textStyle: { color: text },
        top: 0,
      },
      xAxis: {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: line } },
        axisLabel: { color: text, fontSize: 10 },
      },
      yAxis: [
        {
          type: "value",
          name: "用例",
          minInterval: 1,
          axisLine: { lineStyle: { color: line } },
          axisLabel: { color: text },
          splitLine: { lineStyle: { color: dark ? "#3f3f46" : "#e4e4e7" } },
        },
        {
          type: "value",
          name: "%",
          min: 0,
          max: 100,
          axisLine: { lineStyle: { color: line } },
          axisLabel: {
            color: text,
            formatter: (v: number) => `${v}`,
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "用例数",
          type: "line",
          data: series.map((p) => p.total),
          smooth: true,
          itemStyle: { color: dark ? "#60a5fa" : "#2563eb" },
        },
        {
          name: "通过率 %",
          type: "line",
          yAxisIndex: 1,
          data: series.map((p) => Math.round(p.passRate * 1000) / 10),
          smooth: true,
          itemStyle: { color: dark ? "#34d399" : "#059669" },
        },
      ],
    };
  }, [series, dark, subtitle]);

  if (series.length === 0) {
    return (
      <p className={`text-sm text-zinc-500 dark:text-zinc-400 ${className}`}>
        暂无历史趋势数据（需要 test-history）。
      </p>
    );
  }

  return (
    <div className={className}>
      {subtitle ? (
        <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>
      ) : null}
      <ReactEcharts
        option={option}
        style={{ height: 260 }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
