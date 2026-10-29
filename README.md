# Session Quiz: delight ideas

This branch keeps the extra ideas that are not in the MVP on `main`, so they can be looked at later. It was built before the MVP, so it is not meant to be merged as it is. Anything worth keeping should be added to `main` one idea at a time.

What this branch has on top of a basic quiz:

- **Review log and Anki cards:** every answer is saved to `learning-galore-notes/review.md`, and Anki cards to `learning-galore-notes/anki/session-quiz.tsv`.
- **Spaced review:** a missed question comes back after 1, 3, 7, then 21 days. `/quiz review` asks the most overdue one.
- **Topic check-in:** every 50 answers, choose More or Less of the topics you were asked about. `/quiz topics` opens it.
- **Difficulty levels:** three levels that move up after two right answers and down after two misses. `/quiz level 1|2|3|auto`.
- **Streaks and stats:** a day streak and answer counts, shown in Settings and with `/quiz stats`.
- **Settings:** format, tokens used per day, level, and answer stats. No limits.

Run it with `claude --plugin-dir .` in this folder. Check it with `claude plugin test .` and `claude plugin validate .`.
