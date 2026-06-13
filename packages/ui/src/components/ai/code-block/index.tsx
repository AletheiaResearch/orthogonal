"use client";

import { Check, Copy } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../../lib/utils";

/** Default duration the copy button stays in its "copied" state. */
const DEFAULT_COPIED_TIMEOUT_MS = 2000;

/**
 * Internal context that hands the raw code string from {@link CodeBlock} down to
 * any {@link CodeBlockCopyButton} rendered inside it. This keeps the copy button
 * decoupled from where the code lives — consumers slot it in as `children`
 * without re-passing the source.
 */
const CodeBlockContext = createContext<{ code: string }>({ code: "" });

export interface CodeBlockProps {
  /** The raw source to display. Rendered verbatim — no parsing or highlighting. */
  code: string;
  /**
   * Optional language identifier (e.g. `"ts"`, `"python"`). Shown as a label in
   * the header and exposed via `data-language` for any external highlighter.
   */
  language?: string;
  /** Renders a gutter of 1-based line numbers alongside the code. */
  showLineNumbers?: boolean;
  /**
   * Slotted into the header's trailing edge — typically a
   * {@link CodeBlockCopyButton}. The current `code` is provided via context, so
   * the button does not need it passed again.
   */
  children?: ReactNode;
  /** Additional classes merged onto the outer container via `cn`. */
  className?: string;
}

/**
 * Standalone fenced-code display with a language label and a slot for actions
 * (typically a {@link CodeBlockCopyButton}).
 *
 * It is intentionally decoupled from any syntax-highlight engine: code is
 * rendered verbatim inside a `<pre><code>` and degrades gracefully without a
 * highlight theme. A host app may target the emitted `<code>` element (it
 * carries `data-language` and the conventional `language-*` class) with
 * highlight.js / Shiki / Prism if desired.
 */
export function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  children,
  className,
}: CodeBlockProps) {
  const lines = code.split("\n");
  // A trailing newline produces an empty final element; drop it so the gutter
  // count matches the visible lines.
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn(
          "border-border bg-card text-card-foreground overflow-hidden rounded-md border",
          className
        )}
        data-language={language}
      >
        <div className="border-border-muted bg-muted flex items-center justify-between gap-2 border-b px-3 py-1.5">
          <span className="text-muted-foreground font-mono text-xs lowercase">
            {language || "text"}
          </span>
          {children}
        </div>
        <div className="overflow-x-auto">
          <pre className="m-0 p-0 text-sm leading-relaxed">
            <code
              className={cn("block font-mono", language && `language-${language}`)}
              data-language={language}
            >
              {showLineNumbers ? (
                lines.map((line, index) => (
                  // Line index is a stable key here — lines never reorder.
                  <span key={index} className="grid grid-cols-[auto_1fr]">
                    <span
                      aria-hidden="true"
                      className="border-border-muted text-muted-foreground select-none border-r px-3 py-0.5 text-right"
                    >
                      {index + 1}
                    </span>
                    <span className="px-3 py-0.5">{line || " "}</span>
                  </span>
                ))
              ) : (
                <span className="block px-3 py-2">{code}</span>
              )}
            </code>
          </pre>
        </div>
      </div>
    </CodeBlockContext.Provider>
  );
}

export interface CodeBlockCopyButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onCopy" | "onError"
> {
  /** Called with the copied text after a successful clipboard write. */
  onCopy?: (code: string) => void;
  /** Called with the thrown error if the clipboard write fails. */
  onError?: (error: Error) => void;
  /**
   * How long the button shows its "copied" success state before reverting.
   * Defaults to {@link DEFAULT_COPIED_TIMEOUT_MS}.
   */
  timeoutMs?: number;
  /** Additional classes merged onto the button via `cn`. */
  className?: string;
}

/**
 * Copy-to-clipboard button for use inside a {@link CodeBlock}. Reads the code
 * from context, writes it via `navigator.clipboard`, and shows transient
 * success feedback (a check icon) for `timeoutMs`. Degrades gracefully when the
 * Clipboard API is unavailable by invoking `onError`.
 */
export function CodeBlockCopyButton({
  onCopy,
  onError,
  timeoutMs = DEFAULT_COPIED_TIMEOUT_MS,
  className,
  children,
  ...props
}: CodeBlockCopyButtonProps) {
  const { code } = useContext(CodeBlockContext);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      onError?.(new Error("Clipboard API is not available in this environment"));
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopy?.(code);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), timeoutMs);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [code, onCopy, onError, timeoutMs]);

  const Icon = copied ? Check : Copy;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy code"}
      data-copied={copied}
      className={cn(
        "text-muted-foreground hover:bg-accent-muted hover:text-foreground focus-visible:ring-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
        copied && "text-success hover:text-success",
        className
      )}
      {...props}
    >
      {children ?? <Icon aria-hidden="true" className="h-3.5 w-3.5" />}
    </button>
  );
}

export { CodeBlock as default };
