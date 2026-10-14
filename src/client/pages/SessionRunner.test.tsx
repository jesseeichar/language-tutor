import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, listSnapshot, mockApi, sessionResponse, summary, withMembership } from "../../../tests/support/mock-api";
import { SessionRunner } from "./SessionRunner";

const ok = () => ({ body: { grade: null, pointsAwarded: 0, pointsPossible: 0 } });
const editor = { "GET /api/content/editor": () => ({ body: listSnapshot }) };
/** A fetch stub for the session endpoints; the list snapshot the runner loads is answered separately. */
const sessionFetch = (answer: () => Promise<Response>) => mock((input: RequestInfo | URL) =>
  String(input).includes("/api/content/editor") ? Promise.resolve(Response.json(listSnapshot)) : answer());
const sessionCalls = (calls: { path: string }[]) => calls.map((c) => c.path).filter((p) => !p.includes("/content/editor"));

describe("SessionRunner", () => {
  test("steps through every question and finishes", async () => {
    const calls = mockApi({ ...editor, "POST /api/sessions/s1/answers": ok, "POST /api/sessions/s1/finish": () => ({ body: summary(2) }) });
    const onFinished = mock();
    render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={onFinished} />);

    expect(screen.getByText("1 / 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("2 / 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    await userEvent.click(screen.getByRole("button", { name: /Finish/ }));

    expect(sessionCalls(calls)).toEqual([
      "/api/sessions/s1/answers", "/api/sessions/s1/answers", "/api/sessions/s1/finish",
    ]);
    expect(onFinished).toHaveBeenCalledWith(summary(2));
  });

  test("passes each card its direction and shows the question type", async () => {
    mockApi({ ...editor, "POST /api/sessions/s1/answers": ok });
    render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={() => {}} />);
    expect(screen.getByText("Translation")).toBeTruthy();
    expect(screen.getByText("first")).toBeTruthy(); // c1 is asked English first
    expect(screen.getByText(/English → German/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Fill in the blank")).toBeTruthy();
  });

  test("End session finishes early", async () => {
    mockApi({ ...editor, "POST /api/sessions/s1/finish": () => ({ body: summary(0) }) });
    const onFinished = mock();
    render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={onFinished} />);
    await userEvent.click(screen.getByRole("button", { name: "End session" }));
    expect(onFinished).toHaveBeenCalledWith(summary(0));
  });

  test("reports a mode without a registered view", () => {
    const data = { ...sessionResponse, session: { ...sessionResponse.session, modeId: "unknown" } };
    render(<SessionRunner mode={flashcardMode} data={data} onFinished={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain('No view registered for mode "unknown"');
  });

  test("End session is blocked while a quiz answer is being saved", async () => {
    let release!: (response: Response) => void;
    const saving = new Promise<Response>(resolve => { release = resolve; });
    const calls = mock(() => saving);
    globalThis.fetch = calls as unknown as typeof fetch;
    const data = { ...sessionResponse, session: { ...sessionResponse.session, modeId: "quiz", graded: true },
      questions: [{ id: "q", type: "fill-in-the-blank", categories: ["c"], refs: { words: [], topics: [] }, prompt: "Das ist ___ Tür.", answer: "die" }] };
    render(<SessionRunner mode={{ ...flashcardMode, id: "quiz", graded: true }} data={data} onFinished={() => {}} />);
    await userEvent.type(screen.getByLabelText("Your answer"), "die");
    await userEvent.click(screen.getByRole("button", { name: "Check answer" }));
    const end = screen.getByRole("button", { name: "End session" });
    expect(end.hasAttribute("disabled")).toBe(true);
    fireEvent.click(end);
    expect(calls).toHaveBeenCalledTimes(1);
    release(new Response(JSON.stringify({ grade: { correct: true, score: 1 }, pointsAwarded: 1, pointsPossible: 1 })));
    await screen.findByRole("status");
    expect(end.hasAttribute("disabled")).toBe(false);
  });

  test("a quick flashcard Next waits for the reveal save instead of dropping navigation", async () => {
    let release!: (response: Response) => void;
    const saving = new Promise<Response>(resolve => { release = resolve; });
    globalThis.fetch = sessionFetch(() => saving) as unknown as typeof fetch;
    render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={() => {}} />);
    fireEvent.keyDown(window, { key: " " });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText("1 / 2")).toBeTruthy();
    release(new Response(JSON.stringify({ grade: null, pointsAwarded: 0, pointsPossible: 0 })));
    expect(await screen.findByText("2 / 2")).toBeTruthy();
  });
});

test("flashcards go backward before revealing and restore studied cards without duplicate saves", async () => {
  const calls = mockApi({ ...editor, "POST /api/sessions/s1/answers": ok, "POST /api/sessions/s1/finish": () => ({ body: summary(2) }) });
  render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={() => {}} />);
  expect(screen.getByRole("button", { name: /Previous/ }).hasAttribute("disabled")).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
  await userEvent.click(screen.getByRole("button", { name: /Next/ }));
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  await screen.findByText("1 / 2");
  expect(screen.getByRole("button", { name: "Card answer" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /Next/ }));
  expect(screen.getByRole("button", { name: "Show answer" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
  const previous = screen.getByRole("button", { name: /Previous/ });
  previous.focus();
  await userEvent.keyboard("{Enter}");
  await screen.findByText("1 / 2");
  await userEvent.click(screen.getByRole("button", { name: /Next/ }));
  expect(screen.getByRole("button", { name: "Card answer" })).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: /Finish/ }));
  expect(calls.filter(c => c.path.endsWith("/answers"))).toHaveLength(2);
});

test("backward navigation waits for saving and ignores competing navigation", async () => {
  let release!: (response: Response) => void;
  const saving = new Promise<Response>(resolve => { release = resolve; });
  const answers = mock(() => Promise.resolve(Response.json(ok().body)));
  globalThis.fetch = sessionFetch(answers) as unknown as typeof fetch;
  render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
  await userEvent.click(screen.getByRole("button", { name: /Next/ }));
  answers.mockImplementation(() => saving);
  fireEvent.keyDown(window, { key: " " });
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  fireEvent.keyDown(window, { key: "ArrowRight" });
  expect(screen.getByText("2 / 2")).toBeTruthy();
  release(Response.json(ok().body));
  await screen.findByText("1 / 2");
  expect(answers).toHaveBeenCalledTimes(2);
});

test("list controls save membership against the loaded content and show it again when revisiting a card", async () => {
  let snapshot = listSnapshot;
  const calls = mockApi({
    "GET /api/content/editor": () => ({ body: snapshot }),
    "POST /api/content/editor": (body) => {
      const change = (body as { change: { questionId: string; categoryId: string; member: boolean } }).change;
      snapshot = withMembership(snapshot, change.questionId, change.categoryId, change.member);
      return { body: snapshot };
    },
    "POST /api/sessions/s1/answers": ok,
  });
  render(<SessionRunner mode={flashcardMode} data={sessionResponse} onFinished={() => {}} />);
  await userEvent.click(await screen.findByRole("button", { name: "Add to Needs work" }));
  expect(await screen.findByRole("button", { name: "Remove from Needs work" })).toBeTruthy();
  expect(calls.find((c) => c.method === "POST" && c.path === "/api/content/editor")!.body).toEqual({
    revision: "list-1", change: { kind: "set-list-membership", modeId: "flashcards", questionId: "c1", categoryId: "needs-work", member: true },
  });
  await userEvent.click(screen.getByRole("button", { name: /Flip/ }));
  await userEvent.click(screen.getByRole("button", { name: /Next/ }));
  expect(screen.getByRole("button", { name: "Add to Needs work" })).toBeTruthy();
  fireEvent.keyDown(window, { key: "ArrowLeft" });
  expect(await screen.findByRole("button", { name: "Remove from Needs work" })).toBeTruthy();
  // Card memberships never count as study: only the reveal was recorded.
  expect(calls.filter((c) => c.path.endsWith("/answers"))).toHaveLength(1);
});

test("quizzes load no list content and show no list controls", async () => {
  const calls = mockApi({});
  const data = { ...sessionResponse, session: { ...sessionResponse.session, modeId: "quiz", graded: true },
    questions: [{ id: "q", type: "fill-in-the-blank", categories: ["c"], refs: { words: [], topics: [] }, prompt: "Das ist ___ Tür.", answer: "die" }] };
  render(<SessionRunner mode={{ ...flashcardMode, id: "quiz", graded: true }} data={data} onFinished={() => {}} />);
  expect(screen.getByLabelText("Your answer")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Add to/ })).toBeNull();
  expect(calls).toHaveLength(0);
});
