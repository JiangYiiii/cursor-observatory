import { useEffect, useMemo, useState } from "react";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
} from "@/components/common";
import {
  PromptDialog,
  RequirementDetail,
  RequirementList,
} from "@/components/kanban";
import { generateSpecifyPrompt } from "@/lib/prompt-generators";
import {
  CURRENT_SPEC_AUTHOR_STORAGE_KEY,
  filterRequirements,
  sortByUpdatedDesc,
  specAuthorsMatch,
} from "@/lib/requirement-utils";
import { useObservatoryStore } from "@/store/observatory-store";

export function Capabilities() {
  const isLoading = useObservatoryStore((s) => s.isLoading);
  const loadError = useObservatoryStore((s) => s.loadError);
  const capabilities = useObservatoryStore((s) => s.capabilities);
  const manifest = useObservatoryStore((s) => s.manifest);
  const loadAll = useObservatoryStore((s) => s.loadAll);
  const testResults = useObservatoryStore((s) => s.testResults);
  const testExpectations = useObservatoryStore((s) => s.testExpectations);
  const progress = useObservatoryStore((s) => s.progress);
  const aiSessions = useObservatoryStore((s) => s.aiSessions);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hideCompleted, setHideCompleted] = useState(true);
  const [onlyCurrentUser, setOnlyCurrentUser] = useState(true);
  const [authorFilter, setAuthorFilter] = useState<string>("__all__");
  const [currentUserName, setCurrentUserName] = useState(() => {
    try {
      return localStorage.getItem(CURRENT_SPEC_AUTHOR_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [newReqOpen, setNewReqOpen] = useState(false);
  const [newReqDraft, setNewReqDraft] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_SPEC_AUTHOR_STORAGE_KEY, currentUserName);
    } catch {
      /* ignore */
    }
  }, [currentUserName]);

  const uniqueAuthors = useMemo(() => {
    const set = new Set<string>();
    for (const c of capabilities) {
      const a = c.sdd?.specAuthor;
      if (typeof a === "string" && a.trim()) set.add(a.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [capabilities]);

  const filtered = useMemo(() => {
    let f = filterRequirements(capabilities, hideCompleted);
    if (onlyCurrentUser) {
      const cu = currentUserName.trim();
      if (cu) {
        f = f.filter((c) =>
          specAuthorsMatch(
            typeof c.sdd?.specAuthor === "string" ? c.sdd.specAuthor : undefined,
            cu
          )
        );
      }
    } else if (authorFilter !== "__all__") {
      f = f.filter((c) =>
        specAuthorsMatch(
          typeof c.sdd?.specAuthor === "string" ? c.sdd.specAuthor : undefined,
          authorFilter
        )
      );
    }
    return sortByUpdatedDesc(f);
  }, [
    capabilities,
    hideCompleted,
    onlyCurrentUser,
    currentUserName,
    authorFilter,
  ]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return capabilities.find((c) => c.id === selectedId) ?? null;
  }, [capabilities, selectedId]);

  useEffect(() => {
    if (
      selectedId &&
      !filtered.some((c) => c.id === selectedId)
    ) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  const newReqPrompt = useMemo(
    () => generateSpecifyPrompt(newReqDraft),
    [newReqDraft]
  );

  const showSddHint = useMemo(() => {
    const o = manifest?.observatory;
    if (!o) return false;
    return o.sdd_status === "none" && o.sdd_detected !== true;
  }, [manifest]);

  const inProgressCount = filtered.length;

  if (isLoading) {
    return <LoadingSkeleton variant="card" lines={6} />;
  }

  if (loadError) {
    return (
      <ErrorState
        title="无法加载需求数据"
        message={loadError}
        onRetry={() => void loadAll()}
      />
    );
  }

  if (!capabilities.length) {
    return (
      <EmptyState
        title="暂无需求条目"
        description="请先在工作区执行 Observatory 全量扫描以生成 capabilities 数据。"
        action={{ label: "重试加载", onClick: () => void loadAll() }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            AI 需求进度
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            SDD 驱动 · {inProgressCount} 条
            {hideCompleted ? "（已隐藏已完成）" : ""}
            {onlyCurrentUser && currentUserName.trim()
              ? "（仅本人）"
              : onlyCurrentUser && !currentUserName.trim()
                ? "（当前用户未填，暂不按作者过滤）"
                : ""}
          </p>
        </div>
        <div className="flex max-w-full flex-col items-end gap-2 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="rounded border-zinc-300"
            />
            隐藏已完成
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={onlyCurrentUser}
              onChange={(e) => setOnlyCurrentUser(e.target.checked)}
              className="rounded border-zinc-300"
            />
            当前用户
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
            <span className="shrink-0">我的名字</span>
            <input
              type="text"
              value={currentUserName}
              onChange={(e) => setCurrentUserName(e.target.value)}
              placeholder="与 Git 作者一致"
              className="w-36 rounded border border-zinc-300 bg-white px-1.5 py-1 font-mono text-[11px] dark:border-zinc-600 dark:bg-zinc-900"
              autoComplete="off"
            />
          </label>
          {!onlyCurrentUser ? (
            <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="shrink-0">作者</span>
              <select
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                className="max-w-[10rem] rounded border border-zinc-300 bg-white px-1.5 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
              >
                <option value="__all__">全部</option>
                {uniqueAuthors.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => setNewReqOpen(true)}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
          >
            + 新增需求
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <aside className="min-h-0 w-80 shrink-0 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-[#2a2a3c]">
          <RequirementList
            capabilities={filtered}
            selectedId={selectedId}
            onSelect={(c) => setSelectedId(c.id)}
          />
        </aside>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-[#2a2a3c]">
          <RequirementDetail
            capability={selected}
            testResults={testResults}
            testExpectations={testExpectations}
            progress={progress}
            aiSessions={aiSessions}
          />
        </main>
      </div>

      {showSddHint ? (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          提示：启用 SDD（specs/ 下 spec/sketch）可获得文档驱动的阶段追踪；可在命令面板执行
          Observatory: Configure SDD Integration。
        </p>
      ) : null}

      <PromptDialog
        open={newReqOpen}
        title="新增需求（Specify）"
        prompt={newReqPrompt}
        onClose={() => setNewReqOpen(false)}
      >
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300">
            一句话描述需求
          </label>
          <textarea
            value={newReqDraft}
            onChange={(e) => setNewReqDraft(e.target.value)}
            rows={3}
            autoFocus
            className="mt-1 w-full rounded border border-zinc-200 bg-white p-2 text-xs text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            placeholder="例如：为登录接口增加双因素认证"
          />
        </div>
      </PromptDialog>
    </div>
  );
}
