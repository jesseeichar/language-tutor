import type { DirectionChoice } from "../../shared";
import { DIRECTION_LABELS } from "../directions";

interface Props {
  value: DirectionChoice;
  onChange: (value: DirectionChoice) => void;
}

/** Which language bilingual questions show first. */
export function DirectionPicker({ value, onChange }: Props) {
  return (
    <fieldset className="category-group">
      <legend>Direction</legend>
      {(Object.keys(DIRECTION_LABELS) as DirectionChoice[]).map((choice) => (
        <label key={choice} className="category">
          <input type="radio" name="direction" checked={value === choice} onChange={() => onChange(choice)} />
          <span>{DIRECTION_LABELS[choice]}</span>
        </label>
      ))}
      <p className="muted small">Applies to bilingual questions. Fixed prompts are always shown the same way.</p>
    </fieldset>
  );
}
