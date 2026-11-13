import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, ICONS } from "./Icon";

/** How long the button shows that the copy worked (or failed) before returning to normal. */
const FEEDBACK_MS = 1500;

interface Props {
  /** What lands on the clipboard. */
  text: string;
  /** Accessible name and tooltip, e.g. "Copy question". */
  label: string;
  className?: string;
  /** Optional visible caption beside the icon, for cards that show more than one copy button. */
  children?: ReactNode;
}

/** Copies fixed text to the clipboard and briefly confirms the outcome on the button itself. */
export function CopyButton({ text, label, className = "", children }: Props) {
  const [result, setResult] = useState<{ outcome: "copied" | "failed"; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // The confirmation belongs to the text that was copied; once the text changes it no longer applies.
  const state = result?.text === text ? result.outcome : "idle";

  const copy = async () => {
    let outcome: "copied" | "failed" = "copied";
    // The clipboard API is missing on insecure origins and can be refused by the browser.
    try { await navigator.clipboard.writeText(text); } catch { outcome = "failed"; }
    setResult({ outcome, text });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), FEEDBACK_MS);
  };

  const name = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label;
  return (
    <button type="button" className={`icon-button copy-button ${children ? "has-caption" : ""} ${state === "idle" ? "" : `is-${state}`} ${className}`}
      aria-label={name} title={name} onClick={() => void copy()}>
      <Icon d={state === "copied" ? ICONS.check : state === "failed" ? ICONS.cross : ICONS.copy} />
      {children}
    </button>
  );
}
