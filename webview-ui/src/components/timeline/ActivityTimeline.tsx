/**
 * 全页时间线布局（竖线 + 节点）。
 * primary_doc: docs/FRONTEND_DESIGN.md §4.5, §4.6
 */
import type { ReactNode } from "react";

type TimelineItemProps = {
  children: ReactNode;
  /** 最后一项不绘制向下延伸的竖线 */
  isLast?: boolean;
};

export function TimelineItem({ children, isLast = false }: TimelineItemProps) {
  return (
    <li className="flex gap-4">
      <div className="flex w-5 shrink-0 flex-col items-center pt-1">
        <span
          className="size-3 shrink-0 rounded-full border-2 border-white bg-violet-500 shadow-sm dark:border-[#2a2a3c]"
          aria-hidden
        />
        {!isLast ? (
          <div className="mt-2 w-px min-h-[3rem] flex-1 bg-zinc-200 dark:bg-zinc-700" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pb-8">{children}</div>
    </li>
  );
}

type ActivityTimelineProps = {
  children: ReactNode;
};

/** 有序列表容器，子项请使用 {@link TimelineItem} */
export function ActivityTimeline({ children }: ActivityTimelineProps) {
  return (
    <ol className="list-none space-y-0" role="list">
      {children}
    </ol>
  );
}
