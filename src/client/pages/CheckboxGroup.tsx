import { useState } from "react";

export interface CheckboxItem {
  id: string;
  label: string;
  count?: number;
  /** Indentation level, for nested categories. */
  depth?: number;
}

/** A set of checked ids plus one function to check or uncheck several at once. */
export function useCheckedSet(initial: () => Set<string>): [Set<string>, (ids: string[], on: boolean) => void] {
  const [checked, setChecked] = useState(initial);
  const update = (ids: string[], on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  return [checked, update];
}

interface Props {
  legend: string;
  items: CheckboxItem[];
  checked: Set<string>;
  onChange: (ids: string[], on: boolean) => void;
}

/** A titled group of checkboxes with "all" and "none" shortcuts. */
export function CheckboxGroup({ legend, items, checked, onChange }: Props) {
  const ids = items.map((i) => i.id);
  return (
    <fieldset className="category-group" aria-label={legend}>
      <legend>
        {legend}
        <button type="button" className="link small" onClick={() => onChange(ids, true)}>
          all
        </button>
        <button type="button" className="link small" onClick={() => onChange(ids, false)}>
          none
        </button>
      </legend>
      {items.map((item) => (
        <label key={item.id} className="category" style={{ paddingLeft: `${(item.depth ?? 0) * 1.5}rem` }}>
          <input type="checkbox" checked={checked.has(item.id)} onChange={(e) => onChange([item.id], e.target.checked)} />
          <span>{item.label}</span>
          {item.count !== undefined && <span className="count">{item.count}</span>}
        </label>
      ))}
    </fieldset>
  );
}
