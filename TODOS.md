# TODOs

## Future focus

- **Weak topics.** Weight topics by how often the user misses questions on them, so the quiz returns to them. This needs the review log.

## Later

- **Course suggestions.** When the user keeps missing one topic, suggest a course or a short lesson.
- **Concept graph.** Build a graph of the concepts the user meets across sessions, with mastery per concept.
- **README and prompts doc.** Document the plugin and its prompts in this repo so the prompts are easy to improve.

## Done

- **Review log.** Each answer is written to `learning-galore-notes/review.md` in the project you are working in, outside Claude Code.
- **Anki export.** Cards are written to `learning-galore-notes/anki/session-quiz.tsv` for import into Anki.
- **Focus areas.** `/quiz focus` saves up to 5 areas. Questions about your work link to them when there is a real connection, and a topic check-in every 50 answers asks for more or less of each topic.
