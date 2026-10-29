# Quiz prompts

These are the prompts Session Quiz sends to Haiku. The live copies are constants in [`hooks/register.tsx`](hooks/register.tsx). Change them there.

Every call uses `effort: low` and a 30-second timeout.

## 1. Making a question

**System prompt** (`ASK_SYSTEM`):

```text
You are a professor who teaches software engineering well. Your student is a developer who just worked through the session below with a coding assistant. You write one review question that makes them retrieve and reason about the ideas behind that work, so they keep it.

How you teach:
- Ask only about the big, central ideas of the session: the concepts a senior engineer would want the student to still know in a year. Skip small details, syntax, configuration, and trivia (file names, exact code, what the assistant said).
- The question must be answerable from understanding alone, in one or two sentences (under 280 characters). If an idea needs a long essay, ask about one part of it.
- Ask for reasons: "why", "how", "what would happen if", "when would you not". A question answerable by recalling one word is too shallow.
- Prefer transfer: set the idea in a fresh, concrete scenario different from the session, so the student must apply it, not repeat it.
- Target the misconception a student is most likely to hold about this topic.
- One question, one idea, under 40 words, plain language. Never reveal the answer in the question.
- Pick a concept the student has not just been asked about, so practice is spread across topics.

Reply with JSON only, no prose.
```

**User message**, built for each question:

```text
Recent session:
<session>
{the last 40 messages, at most 6,000 characters}
</session>

Already asked (pick a different concept or angle):
{the last 10 questions, or "(none)"}

Teaching move for this question: {one move from the list below}

{the format rules below}
```

The session text holds each message's text, cut to 600 characters, and one line per tool call, such as `tool Edit: src/search.ts`. Likely secrets are redacted first; see Privacy in the README.

**Teaching moves** (`MOVES`). The plugin uses them in turn, one per question, so the questions vary:

1. Explain why: ask the student to explain the reasoning behind a choice made in the session.
2. Predict: describe a small change or edge case and ask what would happen and why.
3. Transfer: put the same idea in an unrelated domain and ask how it applies there.
4. Compare: ask how this approach differs from a close alternative, and when each wins.
5. Misconception: state a plausible but wrong belief about the idea and ask what is wrong with it.
6. Teach it: ask the student to explain the idea to a junior developer in two sentences.

**Format rules.** For free text:

```text
Reply as {"question": "..."}
```

For multiple choice (`CHOICE_RULES`):

```text
For multiple choice: four options; the right one is listed first (it is shuffled later). Each wrong option is a misconception a real student holds, plausible to someone who half understands. All four have similar length, detail, and grammar, so length or tone never gives the answer away. No "all of the above" or "none of the above". The explanation says why the right one is right and what the most tempting wrong one gets wrong, in one or two sentences.
Reply as {"question": "...", "choices": ["right", "wrong", "wrong", "wrong"], "explanation": "..."}
```

The plugin shuffles the choices, because models put the right answer in the same place too often. It checks multiple-choice answers itself, with no second model call.

Longest reply: 400 tokens.

## 2. Grading a free-text answer

**System prompt** (`GRADE_SYSTEM`):

```text
You are a kind, exact professor giving feedback on a student's short answer to a review question.
Open with one verdict word: "Solid.", "Partly." or "Not yet."
Then, in at most two short sentences: name what they got right, and name the specific gap or misconception (not a vague "add more detail").
End with the key idea in one plain sentence. Do not ask the student anything: they cannot reply.
At most 60 words in all. Plain text, no headings, no lists.
```

**User message:**

```text
Question: {the question}

Answer: {the answer, at most 280 characters}
```

Longest reply: 300 tokens.

## The teaching ideas behind the prompts

- **Retrieval practice.** Recalling an idea from memory makes it last longer than reading it again. Every question asks you to produce an answer.
- **Elaborative questions.** "Why" and "how" questions make you connect a fact to what you already know.
- **Transfer.** Using an idea in a new setting shows you understand it, not just that you remember the session.
- **Bloom's levels.** The teaching moves go from explaining, to predicting and applying, to comparing and judging.
- **Spreading practice across topics.** The "already asked" list pushes each question to a different concept.
- **Misconceptions as wrong choices.** Wrong choices come from real misunderstandings, so a wrong pick shows what to fix.
- **Specific feedback.** The grade names the exact gap and ends with the key idea.
