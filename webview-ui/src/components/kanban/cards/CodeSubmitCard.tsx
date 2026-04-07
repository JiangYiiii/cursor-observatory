type Props = {
  lastCommitLine: string | null;
  onSubmitCode: () => void;
};

export function CodeSubmitCard({ lastCommitLine, onSubmitCode }: Props) {
  return (
    <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-600">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          提交代码
        </h3>
        <button
          type="button"
          onClick={onSubmitCode}
          className="rounded-md bg-slate-700 px-2 py-1 text-[10px] font-medium text-white hover:bg-slate-800"
        >
          提交代码
        </button>
      </div>
      <p className="text-[10px] text-zinc-500">最近提交</p>
      <p className="mt-1 font-mono text-[11px] text-zinc-700 dark:text-zinc-200">
        {lastCommitLine ?? "（无法读取；请在扩展宿主内打开看板）"}
      </p>
    </section>
  );
}
