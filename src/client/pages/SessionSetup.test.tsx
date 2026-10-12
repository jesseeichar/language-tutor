import { describe, expect, mock, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { flashcardMode, mockApi, sessionResponse } from "../../../tests/support/mock-api";
import { SessionSetup } from "./SessionSetup";

const setup = (onStarted = mock()) => render(<SessionSetup mode={flashcardMode} onBack={() => {}} onStarted={onStarted} />);

describe("SessionSetup", () => {
  test("Start is disabled until a category is selected", async () => {
    setup();
    const start = screen.getByRole("button", { name: "Start" });
    expect(start.hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    expect(start.hasAttribute("disabled")).toBe(false);
  });

  test("starts a session with all selected categories and the count", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }) });
    const onStarted = mock();
    setup(onStarted);
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByLabelText(/Label grammar-cases/));
    const count = screen.getByLabelText(/Questions in this session/);
    await userEvent.clear(count);
    await userEvent.type(count, "2");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(calls[0]!.body).toEqual({
      modeId: "flashcards",
      categoryIds: ["vocab-time", "grammar-cases"],
      count: 2,
      questionTypes: ["translation", "fill-in-the-blank"],
      direction: "random",
    });
    expect(onStarted).toHaveBeenCalledWith(sessionResponse);
  });

  test("an out-of-range count is clamped to the available questions", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }) });
    setup();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    const count = screen.getByLabelText(/Questions in this session/);
    await userEvent.clear(count);
    await userEvent.type(count, "99");
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((calls[0]!.body as { count: number }).count).toBe(3);
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
    expect((calls[0]!.body as { questionTypes: string[] }).questionTypes).toEqual(["fill-in-the-blank"]);
  });

  test("sends the chosen direction and remembers it", async () => {
    const calls = mockApi({ "POST /api/sessions": () => ({ body: sessionResponse }) });
    const first = setup();
    await userEvent.click(screen.getByLabelText(/Label vocab-time/));
    await userEvent.click(screen.getByLabelText("English → German"));
    await userEvent.click(screen.getByRole("button", { name: "Start" }));
    expect((calls[0]!.body as { direction: string }).direction).toBe("en-de");
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
    expect((calls[0]!.body as { questionTypes: string[] }).questionTypes).toEqual(["translation"]);
  });
});
