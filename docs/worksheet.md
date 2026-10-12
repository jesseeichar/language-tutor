# Zeitlicher Ablauf & Verbindungswörter

Select **Zeitlicher Ablauf & Verbindungswörter** on the home screen. The worksheet starts immediately:
all ten sections, in the original order, without filters, counts, or a direction picker. Fill in an
exercise, choose **Check exercise**, review its feedback, and continue with **Next exercise**.

The source is the learner-supplied six-page **Übung zeitlicher Ablauf.pdf**. All original question
sentences, word banks, choices, and writing topics are preserved. Printed answer lines are replaced
with inputs. Section 6 explicitly identifies the word that was bold in the PDF and asks for only its
replacement. The personal word list and sentence list are paired into eight two-field items. The PDF
contains no answer key; the fixed keys and sample answers were authored from its questions.

| Section | Activity | Items | Assessment |
| --- | --- | ---: | --- |
| 1 | Welche Funktion hat das Wort? | 16 | Select the connector's category. |
| 2 | Wähle das passende Wort | 8 | Match the intended word from the bank; ignore outer spaces and capitalization. |
| 3 | Verbinde die Sätze | 6 | Jev checks the given connector, both ideas, and grammar. |
| 4 | Was passt zusammen? | 6 | Match each beginning to its A–F ending. |
| 5 | Welches Wort passt? | 6 | Choose from the original three options. |
| 6 | Ersetze das Wort | 5 | Jev checks a different synonym that fits the original sentence. |
| 7 | Baue einen Satz | 5 | Jev checks the supplied concepts, connector, and grammar. |
| 8 | Schreibe eine kleine Geschichte | 1 | Jev checks the daily-routine text, at least six connectors, and grammar. |
| 9 | Challenge: Eine Geschichte schreiben | 1 | Jev checks the weekend topic, connector-category requirements, and grammar. |
| 10 | Meine persönlichen Lieblingswörter | 8 | Enter a word and sentence in each pair; personal preferences are not judged. |

There are **62 possible points**. Items earn one or zero points; an exercise can earn partial credit.
The summary's correct count refers to fully correct exercises, while points reflect individual items.
The worksheet has no vocabulary/topic references, so it does not change strength scores. Answers and
feedback are saved in History, and **Repeat this session** replays the worksheet in its original order.

Writing assessment needs `TYPESAFE_API_KEY` in server `.env`, as described in README. It uses the same
configured Jev model as translations. The task and rubric are sent with each writing answer; task
fulfillment and grammar must both exceed 0.5 probability. Feedback is fixed text identifying the failed
check, with an authored sample answer where appropriate. Other valid phrasings can pass. Samples are
not exclusive answers. No live linguistic accuracy claim is made; Jev's assessments can be wrong.

If assessment fails, the section stays ungraded and its inputs remain available for retry. All items
must be filled before checking. Personal choices only require both fields to be nonblank, with no
judgment of preferences, vocabulary, or grammar.

Content lives in `data/questions/worksheet.json`. Each section has a stable id, title, instructions,
optional word bank/example, and items. Item kinds are `choice`, `blank`, `writing`, and `personal`.
Keep ids stable and section order intact. Run `bun run validate` after edits. The original PDF is not
required at runtime and is not copied into this repository.
