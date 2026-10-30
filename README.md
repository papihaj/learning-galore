# Study Buddy

A lot of the time when you're building now, it's very rare that you're looking at the code. However, I think it's still important to understand and retain high-level systems design and architectural decisions, so I created this plugin to help me do that.

While Claude works, Study Buddy asks you one question about a key term in what you're building, and saves what you learn to your project.

![Claude Code fixing a missing rate limit while Study Buddy asks about it](docs/screenshots/demo-question.png)

![Feedback with the key term highlighted and saved to notes](docs/screenshots/demo-feedback.png)

[Watch the 30-second demo](docs/demo.mp4)

## Install

```
/plugin install study-buddy --marketplace papihaj/study-buddy-plugin
```

## Use it

1. Use Claude Code normally.
2. When a question is waiting, open it with `/buddy`.
3. Type your answer, or press `v` and say it with voice input.

Key terms you learn are saved to `study-buddy-notes/notes.md`.

| Command | What it does |
|---|---|
| `/buddy focus evaluation` | Connect questions to what you're learning. |
| `/buddy free` or `/buddy choice` | Type answers, or pick from choices. |
| `/buddy limit 50000` | Optional daily token limit. |

## Update

```
claude plugin marketplace update study-buddy-plugin && claude plugin update study-buddy@study-buddy-plugin
```

Then restart Claude Code.

## License

[MIT](LICENSE)
