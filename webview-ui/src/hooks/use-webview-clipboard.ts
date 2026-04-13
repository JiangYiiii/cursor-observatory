/**
 * VS Code Webview iframe 环境下的剪贴板支持。
 *
 * 架构：React 应用被嵌入 WebviewPanel 的 iframe（src=localhost），
 * Cmd/Ctrl+C/V/X/A 被 VS Code/Cursor 拦截，不传递到 iframe 内的输入框。
 *
 * 方案：
 * - 外层 webview HTML（panel-provider）重写 execCommand、keydown（仅当焦点在外层时生效），
 *   通过 postMessage 把剪贴板指令/文本转发到 iframe。
 * - 本 hook：① 监听父窗口 postMessage；② 在 iframe 内 capture 阶段拦截 Cmd/Ctrl+C/V/X/A
 *   （焦点在输入框时宿主常拦不到子 frame，必须在子窗口自行处理）。
 * - iframe 内 paste 若 readText 失败，postMessage 请求父帧再读一次剪贴板（obs-request-paste）。
 * - 在普通浏览器顶栏打开时无父帧 postMessage，仅 ② 生效，行为与原生一致。
 */
import { useEffect } from "react";

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

function isEditable(el: Element | null): el is EditableElement {
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    if (el.disabled) return false;
    const t = el.type;
    return (
      t === "text" ||
      t === "url" ||
      t === "search" ||
      t === "tel" ||
      t === "password" ||
      t === "email" ||
      t === "number" ||
      t === "date" ||
      t === "time" ||
      t === "datetime-local" ||
      t === "week" ||
      t === "month" ||
      t === "color" ||
      t === ""
    );
  }
  if (el instanceof HTMLTextAreaElement) {
    return !el.disabled;
  }
  return false;
}

function canPasteInto(el: EditableElement): boolean {
  return !el.readOnly && !el.disabled;
}

function getSelection(el: EditableElement): string {
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  return s !== e ? el.value.slice(s, e) : "";
}

function setNativeValue(el: EditableElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    (el as EditableElement).value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertText(el: EditableElement, text: string) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  setNativeValue(el, before + text + after);
  const cursor = start + text.length;
  el.selectionStart = cursor;
  el.selectionEnd = cursor;
}

function deleteSelection(el: EditableElement) {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  if (start === end) return;
  setNativeValue(el, el.value.slice(0, start) + el.value.slice(end));
  el.selectionStart = start;
  el.selectionEnd = start;
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

function handleCopy(el: EditableElement) {
  const text = getSelection(el);
  if (text) void writeClipboard(text);
}

function handleCut(el: EditableElement) {
  const text = getSelection(el);
  if (text) {
    void writeClipboard(text);
    deleteSelection(el);
  }
}

function processCommand(cmd: string, pasteText?: string) {
  const el = document.activeElement;
  if (!isEditable(el)) return;

  switch (cmd) {
    case "copy":
      handleCopy(el);
      break;
    case "cut":
      if (el.readOnly) return;
      handleCut(el);
      break;
    case "paste":
      if (pasteText != null && canPasteInto(el)) {
        insertText(el, pasteText);
      }
      break;
    case "selectAll":
      el.select();
      break;
  }
}

function requestPasteFromParentFrame() {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "obs-request-paste" }, "*");
    }
  } catch {
    /* cross-origin parent */
  }
}

export function useWebviewClipboard() {
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;

      if (d.type === "obs-cmd" && typeof d.cmd === "string") {
        processCommand(d.cmd);
      } else if (d.type === "obs-paste" && typeof d.text === "string") {
        processCommand("paste", d.text);
      }
    };

    /** 焦点在 iframe 内时，外层 webview 的 keydown 监听收不到事件；在子窗口捕获快捷键兜底。 */
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (!["a", "c", "v", "x"].includes(key)) return;

      const el = document.activeElement;
      if (!isEditable(el)) return;

      if (key === "a") {
        e.preventDefault();
        el.select();
        return;
      }
      if (key === "c") {
        e.preventDefault();
        handleCopy(el);
        return;
      }
      if (key === "x") {
        if (el.readOnly) return;
        e.preventDefault();
        handleCut(el);
        return;
      }
      if (key === "v") {
        if (!canPasteInto(el)) return;
        e.preventDefault();
        navigator.clipboard.readText().then(
          (text) => {
            insertText(el, text);
          },
          () => {
            requestPasteFromParentFrame();
          }
        );
      }
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}
