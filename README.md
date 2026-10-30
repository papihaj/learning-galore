# Session Quiz

A lot of the time when you're building now, it's very rare that you're looking at the code. However, I think it's still important to understand and retain high-level systems design and architectural decisions, so I created this plugin to help me do that.

While Claude works, Session Quiz asks you one question about a key term in what you're building, like debounce, and saves what you learn to a Markdown file in your project.

![Claude Code with the Quiz pane beside the chat](docs/screenshots/beside-chat.png)

| A question | Feedback and the key term | Your notes |
|---|---|---|
| ![A question about the session](docs/screenshots/multiple-choice.png) | ![Feedback with the key term highlighted](docs/screenshots/feedback.png) | ![The notes file](docs/screenshots/notes.png) |

## Install

In Claude Code, run:

```
/plugin install session-quiz --marketplace papihaj/learning-galore
```

To update, run this in a terminal and restart Claude Code:

```
claude plugin marketplace update learning-galore && claude plugin update session-quiz@learning-galore
```

## Use it

Use Claude Code normally. When a question is waiting, open it with `/quiz` and answer in the box, or press `v` (Speak) and say your answer: dictate it into the main prompt box with Claude Code's voice input and press Enter. While the Quiz is listening, that prompt goes to the Quiz as your answer, not to Claude. For multiple choice, say the choice's number ("two") or its words. Your terms are saved to `learning-galore-notes/notes.md` in your project.

| Command | What it does |
|---|---|
| `/quiz speak` | Answer the waiting question out loud. |
| `/quiz focus evaluation` | Connect questions to what you're learning. |
| `/quiz free` or `/quiz choice` | Type answers, or pick from choices. |
| `/quiz limit 50000` | Optional daily token limit. There's none unless you set one. |
