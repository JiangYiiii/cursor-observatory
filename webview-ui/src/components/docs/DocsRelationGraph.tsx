import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { useThemeStore } from "@/store/theme-store";
import type { DocsTreeNode } from "@/types/observatory";

type Props = {
  tree: DocsTreeNode;
  currentFile: string | null;
  markdownContent: string | null;
  onSelectFile: (relativePath: string) => void;
};

interface LinkData {
  source: string;
  target: string;
}

interface NodeData {
  name: string;
  symbolSize: number;
  itemStyle: { color: string };
  category?: number;
}

const NODE_COLORS = [
  "#60a5fa",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

function collectFiles(node: DocsTreeNode): string[] {
  const files: string[] = [];
  const walk = (n: DocsTreeNode) => {
    if (n.type === "file" && n.relativePath) files.push(n.relativePath);
    n.children?.forEach(walk);
  };
  walk(node);
  return files;
}

function extractMdLinks(content: string): string[] {
  const links: string[] = [];
  const mdLinkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  const wikiLinkRe = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;

  while ((m = mdLinkRe.exec(content))) {
    const href = m[2].trim();
    if (!href.startsWith("http") && (href.endsWith(".md") || !href.includes("."))) {
      links.push(href.replace(/^\.\//, ""));
    }
  }
  while ((m = wikiLinkRe.exec(content))) {
    links.push(m[1].trim());
  }
  return links;
}

function resolveLink(currentPath: string, href: string): string | null {
  const hashIdx = href.indexOf("#");
  const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  if (!pathPart) return null;

  const curDir = currentPath.includes("/")
    ? currentPath.slice(0, currentPath.lastIndexOf("/"))
    : "";

  const parts = pathPart.split("/").filter(Boolean);
  const segs = curDir ? curDir.split("/").filter(Boolean) : [];
  for (const p of parts) {
    if (p === "..") {
      if (segs.length === 0) return null;
      segs.pop();
    } else if (p !== ".") {
      segs.push(p);
    }
  }
  const out = segs.join("/");
  return out || null;
}

function getDirColor(path: string): string {
  const dir = path.includes("/") ? path.split("/")[0] : "_root";
  let hash = 0;
  for (let i = 0; i < dir.length; i++) {
    hash = (hash * 31 + dir.charCodeAt(i)) & 0x7fffffff;
  }
  return NODE_COLORS[hash % NODE_COLORS.length];
}

export function DocsRelationGraph({
  tree,
  currentFile,
  markdownContent,
  onSelectFile,
}: Props) {
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);
  const isDark = useThemeStore((s) => s.theme === "dark");

  useEffect(() => {
    if (!chartRef.current) return;

    const allFiles = collectFiles(tree);
    if (allFiles.length === 0) return;

    const fileSet = new Set(allFiles);
    const links: LinkData[] = [];
    const linkedFiles = new Set<string>();

    if (currentFile && markdownContent) {
      const rawLinks = extractMdLinks(markdownContent);
      for (const href of rawLinks) {
        let resolved = resolveLink(currentFile, href);
        if (!resolved) continue;
        if (!resolved.endsWith(".md")) resolved += ".md";
        if (fileSet.has(resolved) && resolved !== currentFile) {
          links.push({ source: currentFile, target: resolved });
          linkedFiles.add(resolved);
          linkedFiles.add(currentFile);
        }
        const wikiMatch = allFiles.find(
          (f) => f.endsWith(`/${href}.md`) || f === `${href}.md`
        );
        if (wikiMatch && wikiMatch !== currentFile) {
          links.push({ source: currentFile, target: wikiMatch });
          linkedFiles.add(wikiMatch);
          linkedFiles.add(currentFile);
        }
      }
    }

    const displayFiles =
      linkedFiles.size > 0
        ? allFiles.filter(
            (f) => linkedFiles.has(f) || f === currentFile
          )
        : allFiles.slice(0, 20);

    const nodes: NodeData[] = displayFiles.map((f) => ({
      name: f,
      symbolSize: f === currentFile ? 55 : 35,
      itemStyle: {
        color: f === currentFile ? "#60a5fa" : getDirColor(f),
      },
    }));

    if (instanceRef.current) {
      instanceRef.current.dispose();
      instanceRef.current = null;
    }
    instanceRef.current = echarts.init(
      chartRef.current,
      isDark ? "dark" : undefined
    );
    const chart = instanceRef.current;

    const labelColor = isDark ? "#d4d4d8" : "#52525b";

    chart.setOption(
      {
        backgroundColor: "transparent",
        tooltip: {
          formatter: (p: { dataType: string; name: string }) =>
            p.dataType === "node" ? p.name : "",
        },
        series: [
          {
            type: "graph",
            layout: "force",
            roam: true,
            draggable: true,
            label: {
              show: true,
              fontSize: 10,
              color: labelColor,
              formatter: (p: { name: string }) => {
                const n = p.name;
                return n.includes("/") ? n.split("/").pop() : n;
              },
            },
            edgeSymbol: ["circle", "arrow"],
            edgeSymbolSize: [4, 8],
            force: { repulsion: 200, edgeLength: 120, gravity: 0.1 },
            data: nodes,
            links,
            lineStyle: { opacity: 0.7, width: 1.5, curveness: 0.1 },
          },
        ],
      },
      true
    );

    chart.off("click");
    chart.on("click", (params) => {
      if (params.dataType === "node" && params.name && fileSet.has(params.name)) {
        onSelectFile(params.name);
      }
    });

    const onResize = () => chart.resize();
    window.addEventListener("resize", onResize);
    const resizeTimer = setTimeout(() => chart.resize(), 100);

    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
    };
  }, [tree, currentFile, markdownContent, onSelectFile, isDark]);

  useEffect(() => {
    return () => {
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div ref={chartRef} className="min-h-0 flex-1" />
      <div className="border-t border-zinc-200 px-3 py-2 text-[10px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-500">
        使用滚轮缩放，拖动节点调整布局。蓝色节点代表当前文档。点击节点可跳转。
      </div>
    </div>
  );
}
