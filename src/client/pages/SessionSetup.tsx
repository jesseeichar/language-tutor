import { useMemo, useState } from "react";
import type { CategoryCount, CreateSessionResponse, ModeSummary } from "../../shared";
import { api } from "../api";
import { ErrorBox } from "./ErrorBox";

const storageKey = (modeId: string) => `language-tutor:last-categories:${modeId}`;

function loadLastSelection(modeId: string, available: Set<string>): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(modeId));
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && available.has(id)) : []);
  } catch {
    return new Set();
  }
}

function saveSelection(modeId: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(modeId), JSON.stringify([...ids]));
  } catch {
    // Storage can be unavailable (private window); remembering the choice is only a convenience.
  }
}

/** Groups categories by `group`, with children listed directly after their parent. */
function grouped(categories: CategoryCount[]): [string, { cat: CategoryCount; depth: number }[]][] {
  const byGroup = new Map<string, { cat: CategoryCount; depth: number }[]>();
  const ids = new Set(categories.map((c) => c.id));
  const visit = (cat: CategoryCount, depth: number) => {
    const list = byGroup.get(cat.group) ?? [];
    list.push({ cat, depth });
    byGroup.set(cat.group, list);
    for (const child of categories.filter((c) => c.parent === cat.id)) visit(child, depth + 1);
  };
  for (const root of categories.filter((c) => !c.parent || !ids.has(c.parent))) visit(root, 0);
  return [...byGroup.entries()];
}

function clampCount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.floor(value), Math.max(max, 1)));
}

interface Props {
  mode: ModeSummary;
  onBack: () => void;
  onStarted: (data: CreateSessionResponse) => void;
}

export function SessionSetup({ mode, onBack, onStarted }: Props) {
  const available = useMemo(() => new Set(mode.categories.map((c) => c.id)), [mode]);
  const [selected, setSelected] = useState<Set<string>>(() => loadLastSelection(mode.id, available));
  // Kept as text so the field can be cleared while typing; clamped when the session starts.
  const [countText, setCountText] = useState(String(Math.min(mode.defaultSessionSize, mode.questionCount)));
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const groups = useMemo(() => grouped(mode.categories), [mode]);

  const setChecked = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      saveSelection(mode.id, selected);
      const count = clampCount(Number(countText), mode.questionCount);
      setCountText(String(count));
      onStarted(await api.createSession({ modeId: mode.id, categoryIds: [...selected], count }));
    } catch (e) {
      setError(e);
      setStarting(false);
    }
  };

  return (
    <div className="setup">
      <button type="button" className="link" onClick={onBack}>
        ← All modes
      </button>
      <h2>{mode.title}</h2>
      <p className="muted">{mode.description}</p>

      <h3>Categories</h3>
      <p className="muted small">Pick one or more. A parent category includes everything under it.</p>
      {groups.map(([group, items]) => {
        const ids = items.map((i) => i.cat.id);
        return (
          <fieldset key={group} className="category-group">
            <legend>
              {group}
              <button type="button" className="link small" onClick={() => setChecked(ids, true)}>
                all
              </button>
              <button type="button" className="link small" onClick={() => setChecked(ids, false)}>
                none
              </button>
            </legend>
            {items.map(({ cat, depth }) => (
              <label key={cat.id} className="category" style={{ paddingLeft: `${depth * 1.5}rem` }}>
                <input type="checkbox" checked={selected.has(cat.id)} onChange={(e) => setChecked([cat.id], e.target.checked)} />
                <span>{cat.label}</span>
                <span className="count">{cat.count}</span>
              </label>
            ))}
          </fieldset>
        );
      })}

      <label className="count-input">
        Questions in this session
        <input
          type="number"
          min={1}
          max={mode.questionCount}
          value={countText}
          onChange={(e) => setCountText(e.target.value)}
        />
      </label>

      <ErrorBox error={error} />

      <div className="actions">
        <button type="button" className="primary" disabled={selected.size === 0 || starting} onClick={start}>
          {starting ? "Starting…" : "Start"}
        </button>
        {selected.size === 0 && <span className="muted small">Select at least one category.</span>}
      </div>
    </div>
  );
}
