import { useState, useCallback } from "react";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clipboard,
  PenLine,
  X,
} from "lucide-react";

interface CurlImportDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ParsedField {
  label: string;
  key: string;
  value: string;
  status: "ok" | "warn" | "missing";
}

const FIELD_LABELS: Record<string, string> = {
  baseUrl: "Base URL",
  namespace: "Namespace",
  workspace: "Workspace",
  cluster: "Cluster",
  project: "Project",
  operator: "Operator",
  cookieToken: "Token",
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  ok: <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />,
  warn: <AlertTriangle className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />,
  missing: <XCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />,
};

function tryParseCurl(raw: string): ParsedField[] {
  const fields: ParsedField[] = [];
  const trimmed = raw.replace(/\\\n/g, " ").trim();

  const urlMatch = trimmed.match(/curl\s+['"]?(https?:\/\/[^\s'"]+)/);
  const baseUrlMatch = urlMatch?.[1]?.match(/^(https?:\/\/[^/]+)/);
  const baseUrl = baseUrlMatch?.[1] ?? "";

  const nsMatch = urlMatch?.[1]?.match(/\/(?:namespaces|devops)\/([^/]+)/);
  const wsMatch = urlMatch?.[1]?.match(/\/workspaces\/([^/]+)/);
  const envMatch = urlMatch?.[1]?.match(/[?&]env=([^&]+)/);

  const cookieMatch = trimmed.match(/-b\s+'([^']+)'/) ?? trimmed.match(/-H\s+'[Cc]ookie:\s*([^']+)'/);
  const cookieVal = cookieMatch?.[1] ?? "";
  const operatorMatch = cookieVal.match(/YQG_EMAIL_PROD=([^;]+)/);
  const operator = operatorMatch?.[1]?.split("@")[0] ?? "";

  let project = "";
  const bodyMatch = trimmed.match(/--data-raw\s+'([^']+)'/) ?? trimmed.match(/-d\s+'([^']+)'/);
  if (bodyMatch?.[1]) {
    try {
      const body = JSON.parse(bodyMatch[1]);
      project = body.project ?? body.PROJECT_NAME ?? "";
      if (!project && Array.isArray(body.parameters)) {
        const pn = body.parameters.find(
          (p: { name?: string }) => p.name === "PROJECT_NAME",
        );
        if (pn && "value" in pn) project = String(pn.value);
      }
    } catch { /* not JSON */ }
  }

  const addField = (key: string, val: string) => {
    const masked = key === "cookieToken" && val ? "***已提取***" : val;
    fields.push({
      label: FIELD_LABELS[key] ?? key,
      key,
      value: masked,
      status: val ? "ok" : "missing",
    });
  };

  addField("baseUrl", baseUrl);
  addField("namespace", nsMatch?.[1] ?? "");
  addField("workspace", wsMatch?.[1] ?? "");
  addField("cluster", envMatch?.[1] ?? "");
  addField("project", project);
  addField("operator", operator);
  addField("cookieToken", cookieVal);

  return fields;
}

export function CurlImportDialog({ open, onClose }: CurlImportDialogProps) {
  const [curlText, setCurlText] = useState("");
  const [parsedFields, setParsedFields] = useState<ParsedField[]>([]);
  const [parsed, setParsed] = useState(false);

  const handleParse = useCallback(() => {
    if (!curlText.trim()) return;
    const newFields = tryParseCurl(curlText);
    setParsedFields((prev) => {
      if (prev.length === 0) return newFields;
      const merged = prev.map((f) => {
        const incoming = newFields.find((n) => n.key === f.key);
        if (incoming && incoming.status === "ok") return incoming;
        return f;
      });
      for (const nf of newFields) {
        if (!merged.find((m) => m.key === nf.key)) merged.push(nf);
      }
      return merged;
    });
    setParsed(true);
  }, [curlText]);

  const handlePasteAnother = useCallback(() => {
    setCurlText("");
    setParsed(false);
  }, []);

  const handleApply = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open) return null;

  const missingCount = parsedFields.filter((f) => f.status === "missing").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-0 shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">从 curl 导入配置</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-4 py-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            粘贴 CICD 平台的 curl 命令（从浏览器 DevTools 复制）：
          </p>
          <textarea
            value={curlText}
            onChange={(e) => setCurlText(e.target.value)}
            rows={5}
            placeholder="curl 'https://cicd.example.com/...' -H '...' ..."
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700 placeholder:text-zinc-400 focus:border-blue-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:placeholder:text-zinc-500 dark:focus:border-blue-500"
          />
          <button
            type="button"
            onClick={handleParse}
            disabled={!curlText.trim()}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            解析
          </button>

          {parsed && parsedFields.length > 0 && (
            <>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-xs">
                  <tbody>
                    {parsedFields.map((f) => (
                      <tr key={f.key} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-700">
                        <td className="w-24 px-3 py-1.5 font-medium text-zinc-600 dark:text-zinc-300">
                          {f.label}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-zinc-700 dark:text-zinc-200">
                          {f.value || <span className="italic text-zinc-400">未提取</span>}
                        </td>
                        <td className="w-8 px-2 py-1.5">{STATUS_ICON[f.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {missingCount > 0 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  可多次粘贴不同 curl 来补全缺失字段
                </p>
              )}
            </>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-zinc-100 px-4 py-3 dark:border-zinc-700">
          {parsed && (
            <button
              type="button"
              onClick={handlePasteAnother}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <Clipboard className="h-3 w-3" />
              再粘贴一条
            </button>
          )}
          {parsed && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <PenLine className="h-3 w-3" />
              手动编辑
            </button>
          )}
          {parsed && (
            <button
              type="button"
              onClick={handleApply}
              disabled={missingCount > 3}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              应用配置
            </button>
          )}
          {!parsed && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              关闭
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
