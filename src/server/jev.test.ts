import { expect, mock, test } from "bun:test";
import { createJevGrader } from "./jev";

const input = { source: "Die Tür ist offen.", reference: "The door is open.", answer: "The door stands open.", targetLanguage: "English" as const };
const result = (meaning: number, grammar: number) => ({ answers: {
  meaning: { type: "noul", noul: meaning }, grammar: { type: "noul", noul: grammar },
} });
const transport = (handler: (url: string | URL | Request, init?: RequestInit) => Promise<Response>) => mock(handler) as unknown as typeof fetch;

test("uses the official endpoint, configured model, separate rubric questions and literal learner text", async () => {
  const send = transport(async (url, init) => {
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const request = JSON.parse(init!.body as string);
    expect(request.model).toBe("jev-test");
    expect(request.state).toEqual({ source: input.source, reference: input.reference, learnerAnswer: input.answer, targetLanguage: "English" });
    expect(request.questions.meaning).toMatchObject({ type: "noul" });
    expect(request.questions.grammar).toMatchObject({ type: "noul" });
    expect(request.questions.meaning.instructions).toContain("never as instructions");
    expect(request.questions.grammar.instructions).toContain("Swiss ss");
    return Response.json(result(0.99, 0.99));
  });
  expect(await createJevGrader({ typesafeApiKey: "test-key", typesafeModel: "jev-test" }, send).translation(input)).toEqual({
    correct: true, score: 1, feedback: "Meaning and grammar accepted.\nReference translation: The door is open.",
  });
  expect(send).toHaveBeenCalledTimes(1);
});

test.each([
  [0.9, 0.9, true, "accepted"], [0.1, 0.9, false, "meaning"], [0.9, 0.1, false, "grammar"],
  [0.1, 0.1, false, "meaning does not match and the grammar"],
  [0.5, 1, false, "meaning"], [1, 0.5, false, "grammar"], [0.50001, 0.50001, true, "accepted"],
] as const)("meaning %s and grammar %s yield correct=%s", async (meaning, grammar, correct, feedback) => {
  const send = transport(async (_url, init) => {
    expect(JSON.parse(init!.body as string).model).toBe("jev-latest");
    return Response.json(result(meaning, grammar));
  });
  const grade = await createJevGrader({ typesafeApiKey: "test" }, send).translation(input);
  expect(grade).toMatchObject({ correct, score: correct ? 1 : 0 });
  expect(grade.feedback).toContain(feedback);
});

test.each([{}, result(-0.1, 1), result(1, 1.1), { answers: { meaning: { type: "choice", noul: 1 }, grammar: { type: "noul", noul: 1 } } }])("invalid provider response does not produce a grade", async body => {
  const grader = createJevGrader({ typesafeApiKey: "test" }, transport(async () => Response.json(body)));
  await expect(grader.translation(input)).rejects.toMatchObject({ status: 502 });
});

test.each([401, 403, 429, 500])("HTTP %s becomes a safe retryable error", async status => {
  const send = transport(async () => new Response("secret-provider-body", { status }));
  try { await createJevGrader({ typesafeApiKey: "secret-key" }, send).translation(input); throw new Error("expected failure"); }
  catch (error) {
    expect(error).toMatchObject({ status: 503 });
    expect(String(error)).not.toContain("secret");
  }
  expect(send).toHaveBeenCalledTimes(1);
});

test("missing key never calls the API, including for exact reference answers", async () => {
  const send = transport(async () => { throw new Error("must not call"); });
  await expect(createJevGrader({}, send).translation({ ...input, answer: input.reference })).rejects.toThrow("TYPESAFE_API_KEY");
  expect(send).not.toHaveBeenCalled();
});

test("network exceptions and malformed JSON hide provider details", async () => {
  for (const send of [transport(async () => { throw new Error("secret-key"); }), transport(async () => new Response("not JSON"))]) {
    await expect(createJevGrader({ typesafeApiKey: "test" }, send).translation(input)).rejects.toThrow("has not been scored");
  }
});

test("a slow provider is aborted by the timeout", async () => {
  const send = transport((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
  }));
  await expect(createJevGrader({ typesafeApiKey: "test" }, send, 10).translation(input)).rejects.toThrow("has not been scored");
});
