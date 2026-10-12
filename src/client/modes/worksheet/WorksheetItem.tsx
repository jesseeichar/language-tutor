import { useId } from "react";
import type { WorksheetQuestion } from "../../../shared";

type Value = string | { word: string; sentence: string };
interface Props {
  item: WorksheetQuestion["items"][number];
  number: number;
  value: Value | undefined;
  disabled: boolean;
  onChange: (value: Value) => void;
}

export function WorksheetItem({ item, number, value, disabled, onChange }: Props) {
  const controlId = useId();
  const label = `${number}. ${item.prompt}`;
  if (item.kind === "personal") {
    const pair = typeof value === "object" ? value : { word: "", sentence: "" };
    return <fieldset className="worksheet-item" disabled={disabled}>
      <legend>{item.prompt}</legend>
      <label>Wort {number}<input value={pair.word} onChange={e => onChange({ ...pair, word: e.target.value })} /></label>
      <label>Eigener Satz {number}<textarea rows={2} value={pair.sentence} onChange={e => onChange({ ...pair, sentence: e.target.value })} /></label>
    </fieldset>;
  }
  const answer = typeof value === "string" ? value : "";
  if (item.kind === "choice" && item.options.length === 3) return <fieldset className="worksheet-item" disabled={disabled}>
    <legend>{label}</legend>
    {item.options.map(option => <label className="worksheet-option" key={option.value}>
      <input type="radio" name={item.id} value={option.value} checked={answer === option.value} onChange={() => onChange(option.value)} />{option.label}
    </label>)}
  </fieldset>;
  return <div className="worksheet-item">
    <label htmlFor={controlId}>{label}</label>
    {item.kind === "choice" ? <select id={controlId} value={answer} disabled={disabled} onChange={e => onChange(e.target.value)}>
      <option value="">Bitte wählen…</option>
      {item.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select> : item.kind === "writing" ? <textarea id={controlId} rows={item.rows} value={answer} disabled={disabled} onChange={e => onChange(e.target.value)} />
      : <input id={controlId} value={answer} disabled={disabled} autoComplete="off" onChange={e => onChange(e.target.value)} />}
  </div>;
}
