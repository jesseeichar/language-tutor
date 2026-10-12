import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, mockApi, sessionResponse } from "../../../tests/support/mock-api";
import { SessionSetup } from "./SessionSetup";

const setup = (onStarted = mock()) => render(<SessionSetup mode={flashcardMode} onBack={() => {}} onStarted={onStarted} />);
/** The body of the session request; the setup page also asks for the pool size first. */
const startRequest = (calls: { method: string; body: unknown }[]) => calls.find((c) => c.method === "POST")!.body;
const pool = (count: number) => ({ "GET /api/modes/flashcards/pool": () => ({ body: { count } }) });

async function typeCount(count: string) {
  await userEvent.selectOptions(screen.getByLabelText("Questions in this session"), "custom");
  const input = screen.getByLabelText("Number of questions");
  await userEvent.clear(input);
  await userEvent.type(input, count);
}

describe("SessionSetup", () => {
  test("Start is disabled until a category is selected", async () => {
    setup();
    const start = screen.getByRole("button", { name: "Start" });
    expect(start.hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    expect(start.hasAttribute("disabled")).toBe(false);
  });

  test("starts a session with all selected categories and the count", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }), ...pool(3) });
    const onStarted = mock();
    setup(onStarted);
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByLabelText(/Label grammar-cases/));
    await typeCount("2");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(startRequest(calls)).toEqual({
      modeId: "flashcards",
      categoryIds: ["vocab-time", "grammar-cases"],
      count: 2,
      questionTypes: ["translation", "fill-in-the-blank"],
      direction: "random",
    });
    expect(onStarted).toHaveBeenCalledWith(sessionResponse);
  });

  test("an out-of-range count is clamped to the matching questions", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }), ...pool(2) });
    setup();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await screen.findByRole("option", { name: "All questions (2)" });
    await typeCount("99");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((startRequest(calls) as { count: number }).count).toBe(2);
  });

  test("asks the server how many questions the filters match and can start with all of them", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }), ...pool(2) });
    setup();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByLabelText(/^Translation/));
    await screen.findByRole("option", { name: "All questions (2)" });
    const asked = calls.filter((c) => c.path === "/api/modes/flashcards/pool");
    expect(asked.length).toBeGreaterThanOrEqual(1);
    await userEvent.selectOptions(screen.getByLabelText("Questions in this session"), "all");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((startRequest(calls) as { count: number }).count).toBe(2);
  });

  test("the mode's default size is preselected and sent as is", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }), ...pool(50) });
    setup();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await screen.findByRole("option", { name: "All questions (50)" });
    expect((screen.getByLabelText("Questions in this session") as HTMLSelectElement).value).toBe("20");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((startRequest(calls) as { count: number }).count).toBe(20);
  });

  test("'all' and 'none' toggle a whole group", async () => {
    setup();
    const [vocabAll] = screen.getAllByRole("button", { name: "all" });
    await userEvent.click(vocabAll!);
    expect((screen.getByLabelText(/Label vocab-connectors/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Label vocab-time/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Label grammar-cases/) as HTMLInputElement).checked).toBe(false);
    await userEvent.click(screen.getAllByRole("button", { name: "none" })[0]!);
    expect((screen.getByLabelText(/Label vocab-time/) as HTMLInputElement).checked).toBe(false);
  });

  test("remembers the last selection per mode", async () => {
    mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }) });
    const first = setup();
    await userEvent.click(screen.getByLabelText(/Label grammar-cases/));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    first.unmount();
    setup();
    expect((screen.getByLabelText(/Label grammar-cases/) as HTMLInputElement).checked).toBe(true);
  });

  test("question types: all selected by default, narrowable, at least one required", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }) });
    setup();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    expect((screen.getByLabelText(/^Translation/) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByLabelText(/^Translation/));
    await userEvent.click(screen.getByLabelText(/^Fill in the blank/));
    expect(screen.getByText("Select at least one question type.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByLabelText(/^Fill in the blank/));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((startRequest(calls) as { questionTypes: string[] }).questionTypes).toEqual(["fill-in-the-blank"]);
  });

  test("sends the chosen direction and remembers it", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }) });
    const first = setup();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByLabelText("English → German"));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((startRequest(calls) as { direction: string }).direction).toBe("en-de");
    first.unmount();
    setup();
    expect((screen.getByLabelText("English → German") as HTMLInputElement).checked).toBe(true);
  });

  test("hides the type filter and direction when a mode has no use for them", () => {
    const plain = { ...flashcardMode, questionTypes: [flashcardMode.questionTypes[0]!], directional: false };
    render(<SessionSetup mode={plain} onBack={() => {}} onStarted={() => {}} />);
    expect(screen.queryByText("Question types")).toBeNull();
    expect(screen.queryByText("Direction")).toBeNull();
  });

  test("shows server errors and lets the learner retry", async () => {
    mockApi({ "POST /api/sessions": () => ({ status: 400, body: { error: "No questions match" } }) });
    setup();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((await screen.findByRole("alert")).textContent).toContain("No questions match");
    expect(screen.getByRole("button", { name: "Start" }).hasAttribute("disabled")).toBe(false);
  });

  test("a mode's default types are used until the learner saves a choice", async () => {
    const mode = { ...flashcardMode, id: "quiz", defaultQuestionTypes: ["fill-in-the-blank"] };
    const first = render(<SessionSetup mode={mode} onBack={() => {}} onStarted={() => {}} />);
    expect((screen.getByLabelText(/^Translation/) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(/^Fill in the blank/) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByLabelText(/^Translation/));
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }) });
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    first.unmount();
    render(<SessionSetup mode={mode} onBack={() => {}} onStarted={() => {}} />);
    expect((screen.getByLabelText(/^Translation/) as HTMLInputElement).checked).toBe(true);
  });

  test("a sole type is sent explicitly even when mode defaults name other types", async () => {
    const mode = { ...flashcardMode, id: "quiz", questionTypes: [flashcardMode.questionTypes[0]!], defaultQuestionTypes: ["multiple-choice", "fill-in-the-blank"] };
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }) });
    render(<SessionSetup mode={mode} onBack={() => {}} onStarted={() => {}} />);
    expect(screen.queryByText("Question types")).toBeNull();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((startRequest(calls) as { questionTypes: string[] }).questionTypes).toEqual(["translation"]);
  });
});
