"use client";

import { useRef, useState, useCallback } from "react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface ToolbarAction {
  label: string;
  title: string;
  before: string;
  after: string;
  placeholder: string;
  block?: boolean;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: "B", title: "Bold", before: "**", after: "**", placeholder: "bold text" },
  { label: "I", title: "Italic", before: "*", after: "*", placeholder: "italic text" },
  { label: "H1", title: "Heading", before: "# ", after: "", placeholder: "Heading", block: true },
  { label: "H2", title: "Subheading", before: "## ", after: "", placeholder: "Subheading", block: true },
  { label: "↗", title: "Link", before: "[", after: "](url)", placeholder: "link text" },
  { label: "❝", title: "Blockquote", before: "> ", after: "", placeholder: "quote", block: true },
  { label: "•", title: "List item", before: "- ", after: "", placeholder: "list item", block: true },
];

function applyAction(
  textarea: HTMLTextAreaElement,
  action: ToolbarAction
): { value: string; cursorStart: number; cursorEnd: number } {
  const { selectionStart, selectionEnd, value } = textarea;
  const selected = value.slice(selectionStart, selectionEnd) || action.placeholder;

  let prefix = action.before;
  if (action.block && selectionStart > 0 && value[selectionStart - 1] !== "\n") {
    prefix = "\n" + prefix;
  }

  const newValue =
    value.slice(0, selectionStart) + prefix + selected + action.after + value.slice(selectionEnd);

  return {
    value: newValue,
    cursorStart: selectionStart + prefix.length,
    cursorEnd: selectionStart + prefix.length + selected.length,
  };
}

function renderMarkdown(md: string): string {
  if (!md.trim())
    return '<p style="color:#71717a;font-style:italic">Nothing to preview</p>';

  return (
    md
      // Fenced code blocks
      .replace(
        /```(\w*)\n([\s\S]*?)```/g,
        '<pre style="background:#18181b;border-radius:6px;padding:8px 12px;font-size:12px;font-family:monospace;overflow-x:auto;margin:8px 0"><code>$2</code></pre>'
      )
      // Inline code
      .replace(
        /`([^`]+)`/g,
        '<code style="background:#18181b;border-radius:3px;padding:1px 4px;font-size:12px;font-family:monospace">$1</code>'
      )
      // Headings (must be before blockquote since both start with special chars)
      .replace(
        /^### (.+)$/gm,
        '<h3 style="font-size:16px;font-weight:500;color:#e4e4e7;margin:16px 0 4px">$1</h3>'
      )
      .replace(
        /^## (.+)$/gm,
        '<h2 style="font-size:18px;font-weight:500;color:#e4e4e7;margin:16px 0 4px">$1</h2>'
      )
      .replace(
        /^# (.+)$/gm,
        '<h1 style="font-size:20px;font-weight:500;color:#fafafa;margin:16px 0 8px">$1</h1>'
      )
      // Bold & italic
      .replace(
        /\*\*(.+?)\*\*/g,
        '<strong style="color:#e4e4e7">$1</strong>'
      )
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      // Links
      .replace(
        /\[(.+?)\]\((.+?)\)/g,
        '<a href="$2" style="color:#60a5fa;text-decoration:underline">$1</a>'
      )
      // Blockquotes
      .replace(
        /^> (.+)$/gm,
        '<blockquote style="border-left:2px solid #3f3f46;padding-left:12px;color:#a1a1aa;font-style:italic;margin:4px 0">$1</blockquote>'
      )
      // List items
      .replace(
        /^- (.+)$/gm,
        '<li style="margin-left:16px;list-style:disc">$1</li>'
      )
      // Horizontal rules
      .replace(
        /^---$/gm,
        '<hr style="border:none;border-top:1px solid #27272a;margin:16px 0" />'
      )
      // Paragraphs
      .replace(/\n\n/g, '</p><p style="margin-bottom:8px">')
      .replace(/\n/g, "<br/>")
  );
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");

  const handleToolbarAction = useCallback(
    (action: ToolbarAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const result = applyAction(textarea, action);
      onChange(result.value);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.cursorStart, result.cursorEnd);
      });
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;
        const { selectionStart, selectionEnd, value: v } = textarea;
        const next = v.slice(0, selectionStart) + "  " + v.slice(selectionEnd);
        onChange(next);
        requestAnimationFrame(() => {
          textarea.setSelectionRange(selectionStart + 2, selectionStart + 2);
        });
      }
    },
    [onChange]
  );

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/50">
      {/* Toolbar: formatting buttons only in write mode; Write/Preview always */}
      <div className="flex items-stretch border-b border-zinc-800">
        {mode === "write" && (
          <div className="flex min-w-0 flex-1 items-stretch divide-x divide-zinc-800">
            {TOOLBAR_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                title={action.title}
                onClick={() => {
                  setMode("write");
                  handleToolbarAction(action);
                }}
                className="px-2.5 py-1.5 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <div
          className={`flex shrink-0 items-stretch divide-x divide-zinc-800 ${
            mode === "write" ? "border-l border-zinc-800" : "ml-auto"
          }`}
        >
          <button
            type="button"
            onClick={() => setMode("write")}
            className={`px-3 py-1.5 text-[11px] transition-colors ${
              mode === "write"
                ? "bg-zinc-900 text-zinc-200"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
            }`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`px-3 py-1.5 text-[11px] transition-colors ${
              mode === "preview"
                ? "bg-zinc-900 text-zinc-200"
                : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
            }`}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Write / Preview pane */}
      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[200px] resize-y bg-transparent px-4 py-3 font-lector text-xs leading-relaxed text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
        />
      ) : (
        <div
          className="max-h-[300px] min-h-[200px] overflow-y-auto px-4 py-3 font-lector text-xs leading-relaxed text-zinc-300"
          dangerouslySetInnerHTML={{
            __html: renderMarkdown(value),
          }}
        />
      )}
    </div>
  );
}
