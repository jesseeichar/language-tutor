import { resolveSessionSize, sizeSuggestions, type SessionSize } from "./sessionSize";

interface Props {
  value: SessionSize;
  onChange: (value: SessionSize) => void;
  /** The mode's usual session size; always among the suggestions. */
  defaultSize: number;
  /** Questions matching the current filters, or null while unknown. */
  poolSize: number | null;
}

/** A dropdown of suggested sizes, "all questions", and a free number. */
export function SessionSizePicker({ value, onChange, defaultSize, poolSize }: Props) {
  const suggestions = sizeSuggestions(defaultSize, poolSize);
  // A preset the pool cannot fill is shown as "all": that is what the server would give anyway.
  const selected =
    value.kind === "preset" ? (suggestions.includes(value.count) ? String(value.count) : "all") : value.kind;

  const select = (choice: string) => {
    if (choice === "all") onChange({ kind: "all" });
    else if (choice === "custom") onChange({ kind: "custom", text: String(resolveSessionSize(value, poolSize, defaultSize)) });
    else onChange({ kind: "preset", count: Number(choice) });
  };

  return (
    <div className="count-input">
      <label>
        Questions in this session
        <select value={selected} onChange={(e) => select(e.target.value)}>
          {suggestions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="all">{poolSize === null ? "All questions" : `All questions (${poolSize})`}</option>
          <option value="custom">Custom…</option>
        </select>
      </label>
      {value.kind === "custom" && (
        <label>
          Number of questions
          <input
            type="number"
            min={1}
            max={poolSize ?? undefined}
            value={value.text}
            onChange={(e) => onChange({ kind: "custom", text: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}
