import { useState } from "react";
import type { CreateSessionResponse, ModeSummary, SessionSummary } from "../shared";
import { Home } from "./pages/Home";
import { SessionRunner } from "./pages/SessionRunner";
import { SessionSetup } from "./pages/SessionSetup";
import { SummaryPage } from "./pages/SummaryPage";

/** The whole app is four screens; plain state is enough, no router needed. */
type View =
  | { name: "home" }
  | { name: "setup"; mode: ModeSummary }
  | { name: "session"; mode: ModeSummary; data: CreateSessionResponse }
  | { name: "summary"; mode: ModeSummary; summary: SessionSummary };

export function App() {
  const [view, setView] = useState<View>({ name: "home" });
  const home = () => setView({ name: "home" });

  return (
    <div className="app">
      <header className="topbar">
        <button type="button" className="brand" onClick={home}>
          Language Tutor
        </button>
      </header>
      <main>
        {view.name === "home" && <Home onPick={(mode) => setView({ name: "setup", mode })} />}
        {view.name === "setup" && (
          <SessionSetup
            mode={view.mode}
            onBack={home}
            onStarted={(data) => setView({ name: "session", mode: view.mode, data })}
          />
        )}
        {view.name === "session" && (
          <SessionRunner
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
            onHome={home}
          />
        )}
      </main>
    </div>
  );
}
