import { useRef, useState } from "react";
import type { CreateSessionResponse, ModeSummary, SessionSummary } from "../shared";
import { api } from "./api";
import { Home } from "./pages/Home";
import { HistoryPage } from "./pages/HistoryPage";
import { SessionRunner } from "./pages/SessionRunner";
import { SessionSetup, type SetupPreset } from "./pages/SessionSetup";
import { ListsPage } from "./pages/ListsPage";
import { SummaryPage } from "./pages/SummaryPage";
import { ErrorBox } from "./pages/ErrorBox";
import { ContentEditorPage } from "./pages/ContentEditorPage";

/** The whole app is a handful of screens; plain state is enough, no router needed. */
type View =
  | { name: "home" }
  | { name: "history" }
  | { name: "editor" }
  | { name: "lists" }
  | { name: "setup"; mode: ModeSummary; preset?: SetupPreset }
  | { name: "session"; mode: ModeSummary; data: CreateSessionResponse }
  | { name: "summary"; mode: ModeSummary; summary: SessionSummary };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [startError, setStartError] = useState<unknown>(null);
  const [starting, setStarting] = useState(false);
  const startPending = useRef(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const navigate = (next: View) => {
    if (editorDirty && !window.confirm("Discard unsaved edits?")) return;
    setStartError(null); setEditorDirty(false); setView(next);
  };
  const home = () => navigate({ name: "home" });

  const pick = async (mode: ModeSummary) => {
    if (startPending.current) return;
    setStartError(null);
    if (!mode.fixedSession) { setView({ name: "setup", mode }); return; }
    startPending.current = true; setStarting(true);
    try {
      const data = await api.createSession({ modeId: mode.id, categoryIds: mode.categories.map(c => c.id) });
      setView({ name: "session", mode, data });
    } catch (error) { setStartError(error); }
    finally { startPending.current = false; setStarting(false); }
  };

  /** Replays a past session exactly. Rejects so the calling page can show the error. */
  const repeat = async (sessionId: string) => {
    const [data, modes] = await Promise.all([api.repeatSession(sessionId), api.modes()]);
    const mode = modes.find((m) => m.id === data.session.modeId);
    if (!mode) throw new Error(`Mode "${data.session.modeId}" is no longer available`);
    setView({ name: "session", mode, data });
  };

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={home} disabled={starting}>
          Language Tutor
        </button>
        <button type="button" className="link" disabled={starting} onClick={() => navigate({ name: "lists" })}>Lists</button>
        <button type="button" className="link" disabled={starting} onClick={() => { if (view.name !== "editor") navigate({ name: "editor" }); }}>Manage content</button>
        <button type="button" className="link" disabled={starting} onClick={() => navigate({ name: "history" })}>
          History
        </button>
      </header>
      <main>
        <ErrorBox error={startError} />
        {starting && <p role="status">Starting worksheet…</p>}
        {view.name === "home" && <Home onPick={(mode) => { void pick(mode); }} disabled={starting} />}
        {view.name === "history" && <HistoryPage onRepeat={repeat} />}
        {view.name === "editor" && <ContentEditorPage onDirtyChange={setEditorDirty} />}
        {view.name === "lists" && (
          <ListsPage onStudy={(mode, listId) => navigate({ name: "setup", mode, preset: { categoryIds: [listId] } })} onManage={() => navigate({ name: "editor" })} />
        )}
        {view.name === "setup" && (
          <SessionSetup
            mode={view.mode}
            preset={view.preset}
            onBack={home}
            onStarted={(data) => setView({ name: "session", mode: view.mode, data })}
          />
        )}
        {view.name === "session" && (
          <SessionRunner
            key={view.data.session.id}
            mode={view.mode}
            data={view.data}
            onFinished={(summary) => setView({ name: "summary", mode: view.mode, summary })}
          />
        )}
        {view.name === "summary" && (
          <SummaryPage
            mode={view.mode}
            summary={view.summary}
            onAgain={() => { void pick(view.mode); }}
            onRepeat={repeat}
            onHome={home}
          />
        )}
      </main>
    </div>
  );
}
