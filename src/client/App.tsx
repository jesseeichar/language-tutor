import { useState } from "react";
import type { CreateSessionResponse, ModeSummary, SessionSummary } from "../shared";
import { api } from "./api";
import { Home } from "./pages/Home";
import { HistoryPage } from "./pages/HistoryPage";
import { SessionRunner } from "./pages/SessionRunner";
import { SessionSetup } from "./pages/SessionSetup";
import { SummaryPage } from "./pages/SummaryPage";
import { ContentEditorPage } from "./pages/ContentEditorPage";

/** The whole app is a handful of screens; plain state is enough, no router needed. */
type View =
  | { name: "home" }
  | { name: "history" }
  | { name: "editor" }
  | { name: "setup"; mode: ModeSummary }
  | { name: "session"; mode: ModeSummary; data: CreateSessionResponse }
  | { name: "summary"; mode: ModeSummary; summary: SessionSummary };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const [editorDirty, setEditorDirty] = useState(false);
  const navigate = (next: View) => {
    if (editorDirty && !window.confirm("Discard unsaved edits?")) return;
    setEditorDirty(false); setView(next);
  };
  const home = () => navigate({ name: "home" });

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
        <button type="button" className="brand" onClick={home}>
          Language Tutor
        </button>
        <button type="button" className="link" onClick={() => { if (view.name !== "editor") navigate({ name: "editor" }); }}>Manage content</button>
        <button type="button" className="link" onClick={() => navigate({ name: "history" })}>
          History
        </button>
      </header>
      <main>
        {view.name === "home" && <Home onPick={(mode) => setView({ name: "setup", mode })} />}
        {view.name === "history" && <HistoryPage onRepeat={repeat} />}
        {view.name === "editor" && <ContentEditorPage onDirtyChange={setEditorDirty} />}
        {view.name === "setup" && (
          <SessionSetup
            mode={view.mode}
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
            onAgain={() => setView({ name: "setup", mode: view.mode })}
            onRepeat={repeat}
            onHome={home}
          />
        )}
      </main>
    </div>
  );
}
