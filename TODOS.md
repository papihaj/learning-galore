# TODOs

## Future focus

- **Topics to prioritize.** Let the user name topics they want to get better at (for example "SQL indexes" or "React effects"). When the session touches one of them, the quiz asks about it first. Later, weight topics by how often the user misses questions on them.

## Later

- **Course suggestions.** When the user keeps missing one topic, suggest a course or a short lesson.
- **Concept graph.** Build a graph of the concepts the user meets across sessions, with mastery per concept.
- **README and prompts doc.** Document the plugin and its prompts in this repo so the prompts are easy to improve.

## Done

- **Review log.** Each answer is saved, and `/quiz log` writes the log to `~/learning/session-quiz.md`.
- **Anki export.** `/quiz anki` turns the review log into Anki cards in `~/learning/session-quiz-anki.tsv`.
