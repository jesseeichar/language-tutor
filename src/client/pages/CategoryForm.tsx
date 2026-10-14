import { useState } from "react";
import { expandCategories, type Category, type ContentEdit, type EditorSnapshot } from "../../shared";

interface Props {
  category?: Category;
  data: EditorSnapshot;
  busy: boolean;
  onDirty: () => void;
  onSave: (change: ContentEdit["change"]) => void;
}

export function CategoryForm({ category, data, busy, onDirty, onSave }: Props) {
  const [label, setLabel] = useState(category?.label ?? "");
  const [group, setGroup] = useState(category?.group ?? "Custom");
  const [parent, setParent] = useState(category?.parent ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [isList, setIsList] = useState(category?.isList === true);
  const excluded = category ? expandCategories([category.id], data.categories) : new Set<string>();
  const usage = category ? data.usage[category.id] : undefined;
  const used = usage && Object.values(usage).some((n) => n > 0);

  return (
    <form className="editor-form" onChange={onDirty} onSubmit={(e) => {
      e.preventDefault();
      const fields = {
        label: label.trim(), group: group.trim(), ...(parent ? { parent } : {}),
        ...(description.trim() ? { description: description.trim() } : {}), ...(isList ? { isList: true } : {}),
      };
      onSave(category ? { kind: "update-category", id: category.id, category: fields } : { kind: "create-category", category: fields });
    }}>
      <h3>{category ? `Edit ${category.label}` : "New category"}</h3>
      <fieldset disabled={busy}>
        <label>Name<input required value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label>Group<input required list="category-groups" value={group} onChange={(e) => setGroup(e.target.value)} /></label>
        <datalist id="category-groups">{[...new Set(data.categories.map((c) => c.group))].map((g) => <option key={g} value={g} />)}</datalist>
        <label>Parent category<select value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">None</option>
          {data.categories.filter((c) => !excluded.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.group} / {c.label}</option>)}
        </select></label>
        <label>Description<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="category"><input type="checkbox" checked={isList} onChange={(e) => setIsList(e.target.checked)} />Show in flashcard lists</label>
        <div className="actions">
          <button className="primary" disabled={!label.trim() || !group.trim()}>{busy ? "Saving…" : "Save category"}</button>
          {category && <button type="button" disabled={!!used} onClick={() => {
            if (window.confirm(`Delete category “${category.label}”?`)) onSave({ kind: "delete-category", id: category.id });
          }}>Delete category</button>}
        </div>
      </fieldset>
      {usage && <p className="muted small">Used by {usage.questions} questions, {usage.words} words, {usage.topics} topics, and {usage.children} child categories.</p>}
      {used && <p className="muted small">Only unused categories can be deleted. Reassign their content and children first.</p>}
    </form>
  );
}
