import { useRef, useEffect } from "react";

export default function CodeEditor({
  value = "",
  onChange,
  readOnly = false,
  allowPaste = true,
  placeholder = "// เขียนโค้ด Java ของคุณที่นี่...",
  minHeight = "280px",
  className = "",
  language = "Java",
}) {
  const textareaRef = useRef(null);
  const lineNumbersRef = useRef(null);

  const lines = (value || "").split("\n");
  const lineCount = Math.max(lines.length, 1);

  // Sync scroll between textarea and line numbers gutter
  const handleScroll = (e) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.target.scrollTop;
    }
  };

  const handleKeyDown = (e) => {
    if (readOnly) return;

    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      const tabSpaces = "    ";
      const nextVal = val.substring(0, start) + tabSpaces + val.substring(end);
      if (onChange) onChange(nextVal);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + tabSpaces.length;
      }, 0);
    } else if (e.key === "Enter") {
      // Auto-indentation
      const target = e.target;
      const start = target.selectionStart;
      const currentLine = target.value.substring(0, start).split("\n").pop();
      const indentMatch = currentLine.match(/^\s*/);
      const currentIndent = indentMatch ? indentMatch[0] : "";
      const extraIndent = currentLine.trim().endsWith("{") ? "    " : "";
      const fullIndent = currentIndent + extraIndent;

      if (fullIndent.length > 0) {
        e.preventDefault();
        const end = target.selectionEnd;
        const val = target.value;
        const nextVal =
          val.substring(0, start) + "\n" + fullIndent + val.substring(end);
        if (onChange) onChange(nextVal);
        setTimeout(() => {
          target.selectionStart = target.selectionEnd =
            start + 1 + fullIndent.length;
        }, 0);
      }
    }
  };

  const handlePaste = (e) => {
    if (!allowPaste && !readOnly) {
      e.preventDefault();
      alert("⚠️ ไม่อนุญาตให้วางข้อความ (Paste) ในข้อสอบนี้ กรุณาเขียนโค้ดด้วยตนเอง");
    }
  };

  const handleCopyCut = (e) => {
    if (!allowPaste && !readOnly) {
      e.preventDefault();
      alert("⚠️ ไม่อนุญาตให้คัดลอก (Copy/Cut) โค้ดในข้อสอบนี้");
    }
  };

  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-900 overflow-hidden shadow-md flex flex-col font-mono text-sm ${className}`}
    >
      {/* Top Editor Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950 border-b border-slate-800 text-xs text-slate-400 select-none">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
          <span className="ml-2 font-semibold text-slate-300">{language}</span>
          {readOnly && (
            <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] ml-1">
              Read-Only
            </span>
          )}
          {!allowPaste && !readOnly && (
            <span className="bg-rose-950 text-rose-300 border border-rose-800 px-2 py-0.5 rounded text-[10px] ml-1">
              🚫 Paste Disabled
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>{lineCount} lines</span>
          <span>{(value || "").length} chars</span>
        </div>
      </div>

      {/* Code Editor Body */}
      <div className="relative flex flex-1 overflow-hidden" style={{ minHeight }}>
        {/* Line Numbers Gutter */}
        <div
          ref={lineNumbersRef}
          aria-hidden="true"
          className="w-12 py-3 bg-slate-950/60 text-slate-500 text-right pr-3 select-none overflow-hidden border-r border-slate-800 font-mono text-xs leading-6"
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Textarea Code Input */}
        <textarea
          ref={textareaRef}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange && onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onPaste={handlePaste}
          onCopy={handleCopyCut}
          onCut={handleCopyCut}
          placeholder={placeholder}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          className="flex-1 p-3 bg-transparent text-emerald-300 font-mono text-xs leading-6 resize-y focus:outline-none placeholder-slate-600 caret-white selection:bg-indigo-600 selection:text-white"
          style={{ minHeight, tabSize: 4 }}
        />
      </div>
    </div>
  );
}

