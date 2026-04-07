import { formatDateTimeZhFull } from "@/lib/format-time";

export type ActivityItem = {
  id: string;
  kind: "session" | "record";
  title: string;
  subtitle?: string;
  timestamp: string;
};

type Props = {
  activities: ActivityItem[];
};

export function ActivityCard({ activities }: Props) {
  if (activities.length === 0) return null;

  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
      <h3 className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
        相关活动
      </h3>
      <ul className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300">
        {activities.map((a) => (
          <li
            key={a.id}
            className="border-l-2 border-zinc-200 pl-2 dark:border-zinc-600"
          >
            <span className="font-medium text-zinc-700 dark:text-zinc-200">
              {a.kind === "session" ? "会话" : "记录"} · {a.title}
            </span>
            {a.subtitle ? (
              <span className="ml-1 text-[10px] text-zinc-400">
                {a.subtitle}
              </span>
            ) : null}
            <div className="text-[10px] text-zinc-400">
              {formatDateTimeZhFull(a.timestamp)}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
