import { useEffect, useMemo, useState } from "react";
import type { CategoryCount, CreateSessionResponse, DirectionChoice, ModeSummary } from "../../shared";
import { api } from "../api";
import { CheckboxGroup, useCheckedSet, type CheckboxItem } from "./CheckboxGroup";
import { DirectionPicker } from "./DirectionPicker";
import { ErrorBox } from "./ErrorBox";
import { loadSetup, saveSetup } from "./savedSetup";
import { SessionSizePicker } from "./SessionSizePicker";
import { resolveSessionSize, type SessionSize } from "./sessionSize";

/** Groups categories by `group`, with children listed directly after their parent. */
function grouped(categories: CategoryCount[]): [string, CheckboxItem[]][] {
  const byGroup = new Map<string, CheckboxItem[]>();
  const ids = new Set(categories.map((c) => c.id));
  const visit = (cat: CategoryCount, depth: number) => {
    const list = byGroup.get(cat.group) ?? [];
    list.push({ id: cat.id, label: cat.label, count: cat.count, depth });
    byGroup.set(cat.group, list);
    for (const child of categories.filter((c) => c.parent === cat.id)) visit(child, depth + 1);
  };
  for (const root of categories.filter((c) => !c.parent || !ids.has(c.parent))) visit(root, 0);
  return [...byGroup.entries()];
}

interface Props {
  mode: ModeSummary;
  onBack: () => void;
  onStarted: (data: CreateSessionResponse) => void;
}

export function SessionSetup({ mode, onBack, onStarted }: Props) {
  const saved = useMemo(
    () =>
      loadSetup(mode.id, {
        categoryIds: new Set(mode.categories.map((c) => c.id)),
        questionTypes: new Set(mode.questionTypes.map((t) => t.id)),
      }),
    [mode],
  );
  // The type filter only makes sense when there is more than one type to choose from.
  const showTypes = mode.questionTypes.length > 1;
  const [categories, setCategories] = useCheckedSet(() => new Set(saved.categoryIds));
  const [types, setTypes] = useCheckedSet(() => new Set(showTypes
    ? saved.questionTypes ?? mode.defaultQuestionTypes ?? mode.questionTypes.map((t) => t.id)
    : mode.questionTypes.map((t) => t.id)));
  const [direction, setDirection] = useState<DirectionChoice>(saved.direction);
  const [size, setSize] = useState<SessionSize>({ kind: "preset", count: mode.defaultSessionSize });
  const [poolSize, setPoolSize] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const groups = useMemo(() => grouped(mode.categories), [mode]);
  const typeItems = mode.questionTypes.map((t) => ({ id: t.id, label: t.label, count: t.count }));

  const missing = categories.size === 0 ? "Select at least one category." : showTypes && types.size === 0 ? "Select at least one question type." : null;
  // The type filter as the session request sends it, so "all questions" counts exactly what would start.
  const selectedTypes = () => (mode.questionTypes.length ? [...types] : undefined);

  // How many questions the current filters match. Unknown (null) until the server answers, or if it cannot.
  useEffect(() => {
    if (missing) {
      setPoolSize(null);
      return;
    }
    let current = true;
    api.poolSize(mode.id, [...categories], mode.questionTypes.length ? [...types] : undefined).then(
      (r) => current && setPoolSize(r.count),
      () => current && setPoolSize(null),
    );
    return () => {
      current = false;
    };
  }, [mode, categories, types, missing]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      saveSetup(mode.id, { categoryIds: [...categories], questionTypes: mode.questionTypes.length ? [...types] : null, direction });
      onStarted(
        await api.createSession({
          modeId: mode.id,
          categoryIds: [...categories],
          count: resolveSessionSize(size, poolSize, mode.questionCount),
          questionTypes: selectedTypes(),
          direction: mode.directional ? direction : undefined,
        }),
      );
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
      {groups.map(([group, items]) => (
        <CheckboxGroup key={group} legend={group} items={items} checked={categories} onChange={setCategories} />
      ))}

      {(showTypes || mode.directional) && <h3>Questions</h3>}
      {showTypes && <CheckboxGroup legend="Question types" items={typeItems} checked={types} onChange={setTypes} />}
      {mode.directional && <DirectionPicker value={direction} onChange={setDirection} />}

      <SessionSizePicker value={size} onChange={setSize} defaultSize={mode.defaultSessionSize} poolSize={poolSize} />

      <ErrorBox error={error} />

      <div className="actions">
        <button type="button" className="primary" disabled={missing !== null || starting} onClick={start}>
          {starting ? "Starting…" : "Start"}
        </button>
        {missing && <span className="muted small">{missing}</span>}
      </div>
    </div>
  );
}
