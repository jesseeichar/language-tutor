import { useEffect, useState } from "react";
import { expandCategories, type ContentEdit, type EditorSnapshot } from "../../shared";
import { api } from "../api";
import { CategoryForm } from "./CategoryForm";
import { QuestionCategories } from "./QuestionCategories";
import { ErrorBox } from "./ErrorBox";
import { ProgressBackup } from "./ProgressBackup";

type Selection = { kind: "new" } | { kind: "category"; id: string } | { kind: "question"; id: string; modeId: string };

export function ContentEditorPage({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const [data, setData] = useState<EditorSnapshot | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tab, setTab] = useState<"questions" | "categories">("questions");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");

  useEffect(() => { api.editor().then(setData, setError); }, []);
  useEffect(() => {
    onDirtyChange(dirty);
    const preventClose = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    if (dirty) window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [dirty, onDirtyChange]);

  const discard = () => !dirty || window.confirm("Discard unsaved edits?");
  const choose = (next: Selection | null) => {
    if (!discard()) return false;
    setSelection(next); setDirty(false); setError(null); setMessage("");
    return true;
  };
  const reload = async () => {
    if (!discard()) return;
    setBusy(true);
    try { setData(await api.editor()); setSelection(null); setDirty(false); setError(null); setMessage(""); }
    catch (e) { setError(e); }
    finally { setBusy(false); }
  };
  const save = async (change: ContentEdit["change"]) => {
    if (!data || busy) return;
    setBusy(true); setError(null); setMessage("");
    try {
      const updated = await api.editContent({ revision: data.revision, change });
      setData(updated); setDirty(false); setMessage("Saved. Your changes are ready to use.");
      if (change.kind === "delete-category") setSelection(null);
      if (change.kind === "create-category") setSelection({ kind: "category", id: updated.categories.at(-1)!.id });
    } catch (e) { setError(e); }
    finally { setBusy(false); }
  };

  if (!data) return <><ErrorBox error={error} /><p className="muted">{error ? "Could not load content." : "Loading…"}</p><button onClick={reload}>Reload editor</button></>;
  const selectedCategory = selection?.kind === "category" ? data.categories.find((c) => c.id === selection.id) : undefined;
  const selectedQuestion = selection?.kind === "question" ? data.questions.find((q) => q.id === selection.id && q.modeId === selection.modeId) : undefined;
  const filterIds = expandCategories(categoryFilter ? [categoryFilter] : [], data.categories);
  const needle = search.toLocaleLowerCase();
  const questions = data.questions.filter((q) =>
    (!categoryFilter || q.categories.some((id) => filterIds.has(id))) &&
    `${q.preview} ${q.modeTitle} ${q.id}`.toLocaleLowerCase().includes(needle));
  const categories = data.categories.filter((c) => `${c.label} ${c.group}`.toLocaleLowerCase().includes(needle));
  const key = `${data.revision}:${JSON.stringify(selection)}`;

  return (
    <div className="content-editor">
      <h2>Manage content</h2>
      <p className="muted">Organize questions and categories. Save each edit to apply it immediately.</p>
      <div className="actions editor-tabs">
        <button disabled={busy} aria-pressed={tab === "questions"} onClick={() => { if (choose(null)) { setTab("questions"); setSearch(""); } }}>Questions</button>
        <button disabled={busy} aria-pressed={tab === "categories"} onClick={() => { if (choose(null)) { setTab("categories"); setSearch(""); } }}>Categories</button>
        <button disabled={busy} onClick={() => { if (choose({ kind: "new" })) setTab("categories"); }}>New category</button>
        <button disabled={busy} onClick={reload}>Reload editor</button>
      </div>
      <ErrorBox error={error} />
      {message && <p role="status">{message}</p>}
      <div className="editor-layout">
        <div className="editor-list">
          <label>Search {tab}<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          {tab === "questions" && <label>Filter by category<select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {data.categories.map((c) => <option key={c.id} value={c.id}>{c.group} / {c.label}</option>)}
          </select></label>}
          <ul>
            {tab === "questions" ? questions.map((q) => <li key={`${q.modeId}:${q.id}`}><button disabled={busy} className="editor-item"
              aria-pressed={selectedQuestion === q} onClick={() => choose({ kind: "question", id: q.id, modeId: q.modeId })}>
              <span>{q.preview}</span><small>{q.modeTitle} · {q.categories.map((id) => data.categories.find((c) => c.id === id)?.label ?? id).join(", ")}</small>
            </button></li>) : categories.map((c) => <li key={c.id}><button disabled={busy} className="editor-item"
              aria-pressed={selectedCategory === c} onClick={() => choose({ kind: "category", id: c.id })}>
              <span>{c.label}</span><small>{c.group}{c.parent && ` / ${data.categories.find((p) => p.id === c.parent)?.label}`} · {data.usage[c.id]?.questions ?? 0} questions{c.isList && " · list"}</small>
            </button></li>)}
          </ul>
          {(tab === "questions" ? questions : categories).length === 0 && <p className="muted">No matches.</p>}
        </div>
        <div>
          {(selection?.kind === "new" || selectedCategory) && <CategoryForm key={key} category={selectedCategory} data={data} busy={busy} onDirty={() => setDirty(true)} onSave={save} />}
          {selectedQuestion && <QuestionCategories key={key} question={selectedQuestion} data={data} busy={busy} onDirty={() => setDirty(true)} onSave={save} />}
          {!selection && <p className="muted">Select an item to edit, or create a category.</p>}
        </div>
      </div>
      <ProgressBackup />
    </div>
  );
}
