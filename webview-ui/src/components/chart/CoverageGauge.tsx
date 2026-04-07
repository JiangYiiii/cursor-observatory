/**
 * 场景覆盖率仪表盘（0–100%）。
 * primary_doc: docs/QUALITY_MONITOR_DESIGN.md §5.1
 */
import * as echarts from "echarts/core";
import { GaugeChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEcharts from "echarts-for-react";
import { useMemo } from "react";

echarts.use([GaugeChart, TooltipComponent, CanvasRenderer]);

type Props = {
  /** 0–1 */
  ratio: number;
  label: string;
  dark: boolean;
  className?: string;
};

export function CoverageGauge({
  ratio,
  label,
  dark,
  className = "",
}: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10;

  const option = useMemo(() => {
    const text = dark ? "#e4e4e7" : "#3f3f46";
    return {
      series: [
        {
          type: "gauge",
          startAngle: 200,
          endAngle: -20,
          min: 0,
          max: 100,
          splitNumber: 5,
          radius: "88%",
          center: ["50%", "58%"],
          axisLine: {
            lineStyle: {
              width: 12,
              color: [
                [0.35, "#ef4444"],
                [0.65, "#f59e0b"],
                [1, "#22c55e"],
              ],
            },
          },
          pointer: { show: true, length: "70%", width: 5 },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: true, distance: -36, color: text, fontSize: 10 },
          detail: {
            valueAnimation: true,
            formatter: "{value}%",
            color: text,
            fontSize: 22,
            offsetCenter: [0, "18%"],
          },
          data: [{ value: pct, name: label }],
          title: {
            show: true,
            offsetCenter: [0, "72%"],
            fontSize: 11,
            color: dark ? "#a1a1aa" : "#71717a",
          },
        },
      ],
    };
  }, [pct, label, dark]);

  return (
    <div className={className}>
      <ReactEcharts
        option={option}
        style={{ height: 220 }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
