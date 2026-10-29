# Session Quiz

Session Quiz is a Claude Code plugin that teaches you while Claude works. When Claude starts on a prompt, the plugin reads what your session has covered and asks you one open-ended question about the big ideas behind it. You answer in a pane beside the chat, and a short grade tells you what you got right and what you missed.

It uses Claude Haiku, with a cap on how many questions and tokens each session can use.

## Screenshots

<!-- Add PNGs to docs/screenshots/ with these names. -->

| Free-text question | Multiple choice | Feedback |
| --- | --- | --- |
| ![A free-text question in the Quiz pane](docs/screenshots/free-text.png) | ![A multiple-choice question in the Quiz pane](docs/screenshots/multiple-choice.png) | ![Feedback after an answer](docs/screenshots/feedback.png) |

## Install

This repository is private. To install it, you need read access to it on GitHub, and your computer needs a git credential for github.com (an SSH key, or `gh auth login` and then `gh auth setup-git`).

At the prompt of a Claude Code terminal session:

```text
/plugin install session-quiz --marketplace papihaj/learning-galore
```

From a shell:

```sh
claude plugin install session-quiz --marketplace papihaj/learning-galore
```

Answer `y` to add the marketplace, then pick a scope. The user scope turns it on in every session.

In the desktop app, click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `papihaj/learning-galore`, then **Add plugin**.

## Use it

1. Send Claude a prompt. A question appears in the **Quiz** pane while Claude works. If the pane is not open, run `/quiz`.
   Under the question, a dim line such as `From: hooks/register.tsx` names the file the idea came from. It only names a file the session actually touched, and adds a line number only when the session cites that line. When no file fits, the line is left out.
2. Press **ctrl+x tab** to move into the pane. The pane says so when it does not have the keyboard.
3. Answer the question:
   - **Free text:** type up to 280 characters, then press Enter or **Submit**. Long answers show in full under the box.
   - **Multiple choice:** press **1** to **4** to select an answer. You can change your choice. Then press **a** or **Submit**.
4. Read the feedback, then press **Next question**, or go back to your work. A new question comes the next time Claude starts working.
5. If you missed the question (a wrong pick, or feedback that starts with "Partly." or "Not yet."), press **d** or **Go deeper** for a short lesson on the gap: the core idea, one example, and the one thing to remember. It shows under the feedback.

Press **s** to skip a question and **f** to switch between free text and multiple choice.

### Topics to prioritize

Name up to 5 topics you want to get better at, separated by commas:

```text
/quiz focus data science, distributed systems
```

These are areas you want to grow in, and they do not need to match what you are working on. The question always stays on an idea from your session, but when that idea has a real link to one of your areas, the question carries it there. For example, while you build a search box with a `data science` focus, you might get: "Debouncing waits for a pause before acting. Where does the same idea show up when you batch a stream of events before a model sees them?" A dim line such as `Linked to: data science` shows under the question. When the session works on an area directly, the question asks about it. When there is no honest link, the question is chosen as usual. Run `/quiz focus` to see your topics and `/quiz focus clear` to remove them. Topics are saved across sessions.

The first prompt of a session gives no question, because there is nothing to ask about yet.

### Streaks and stats

The plugin counts every answer across sessions. Once you have answered a question, the top of the pane shows your streak and total, such as `3-day streak · 12 answered`. A streak is the number of days in a row, by your local date, with at least one answer. It ends when a whole day passes with no answer. After each answer, the status line shows your streak until the next question.

Each answer is tallied as Solid, Partly, or Not yet. A free-text answer takes the first word of its grade. A multiple-choice answer is Solid when it is right and Not yet when it is wrong. Run `/quiz stats` to see the totals.

## Privacy

To make a question, the plugin sends Haiku a short digest of the session: the text of the last 40 messages, each cut to 600 characters, and one line per tool call with its file path, command, or search pattern. A tool call shows only as that line, not its output. The digest is at most 6,000 characters. To grade a free-text answer, it sends only the question and your answer.

Before the digest leaves the plugin, likely secrets are replaced with `[redacted key]` or `[redacted secret]`:

- API keys and tokens in known formats: Anthropic and OpenAI (`sk-`), GitHub (`ghp_`, `github_pat_`), AWS key IDs (`AKIA`), Slack (`xoxb-`), and JWTs.
- Private key blocks (`-----BEGIN ... PRIVATE KEY-----`).
- `Authorization: Bearer ...` and `Basic ...` values.
- Values of upper-case names that contain KEY, TOKEN, SECRET, PASSWORD, or API, as in `.env` files (`STRIPE_API_KEY=...`).
- Long random-looking strings: 32 or more characters of hex, or of mixed-case letters and digits. Commit hashes count, so they are redacted too.

Tool calls on secrets files (`.env`, `.env.*`, `*.pem`, `id_rsa*`, `credentials*`) are left out entirely. The patterns are in [`hooks/redact.ts`](hooks/redact.ts). They catch common shapes, not every secret, so avoid pasting credentials into a session.

## Customize

### Commands

| Command | What it does |
| --- | --- |
| `/quiz` | Open the pane and show this session's usage. |
| `/quiz now` | Ask a question now. |
| `/quiz stats` | Show your answers, Solid, Partly, and Not yet counts, and your current and best streak. |
| `/quiz focus data science, distributed systems` | Link questions about your work to these areas when there is a real connection. At most 5. |
| `/quiz focus` | List your focus topics. |
| `/quiz focus clear` | Remove all focus topics. |
| `/quiz free` | Use free-text questions. |
| `/quiz choice` | Use multiple-choice questions. |
| `/quiz max 5` | Ask at most 5 questions per session. The default is 10. |
| `/quiz budget 30000` | Use at most 30,000 tokens per session. The default is 20,000. |
| `/quiz reset` | Reset this session's question and token count. |

The format, question limit, token budget, focus topics, and stats are saved across sessions. `/quiz reset` does not clear stats.

### Cost

Each question costs about 300 to 1,000 tokens with its grade. Most of that is the session text sent to Haiku. The source file and focus topic come back in the same reply, so they add no call. Focus topics add a few dozen tokens to each question. A multiple-choice answer is checked by the plugin, with no second call. **Go deeper** makes one more call, only when you press it, of about 300 to 600 tokens. It counts toward the token budget but not the question limit. On a Claude subscription, the calls count toward your plan's usage limits.

### In the code

All of these are constants at the top of [`hooks/register.tsx`](hooks/register.tsx):

| Constant | Default | What it controls |
| --- | --- | --- |
| `MODEL` | `haiku` | The model that writes and grades questions. |
| `ASK_MAX_TOKENS` | 400 | Longest reply when making a question. |
| `GRADE_MAX_TOKENS` | 300 | Longest reply when grading. |
| `LESSON_MAX_TOKENS` | 350 | Longest reply for a **Go deeper** lesson. |
| `CONTEXT_CHARS` | 6000 | How much of the session is sent to make a question. |
| `ANSWER_CHARS` | 280 | Longest free-text answer. |
| `DEFAULTS` | free text, 20,000 tokens, 10 questions | Settings before you change them with `/quiz`. |
| `ACCENT` | `claude` | The accent color, a theme key or a hex color such as `#e0a35a`. A theme key follows your Claude Code theme. |

### Prompts

The prompts that make and grade questions and write **Go deeper** lessons are in [`PROMPTS.md`](PROMPTS.md), with the teaching ideas behind them. Edit the constants `ASK_SYSTEM`, `MOVES`, `CHOICE_RULES`, `SOURCE_RULE`, `FOCUS_RULE`, `GRADE_SYSTEM`, and `LESSON_SYSTEM` in `hooks/register.tsx` to change them.

## Develop

Run a session with the plugin loaded from this folder. It reloads when you save a file:

```sh
claude --plugin-dir .
```

Check the plugin before you push:

```sh
claude plugin validate .
claude plugin test .
npx -p typescript tsc -p .
```

`types/index.d.ts` declares the values the pane keeps in session state.

## Roadmap

See [TODOS.md](TODOS.md). Next up is giving more weight to topics you often miss.
