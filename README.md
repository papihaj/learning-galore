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
2. Press **ctrl+x tab** to move into the pane. The pane says so when it does not have the keyboard.
3. Answer the question:
   - **Free text:** type up to 280 characters, then press Enter or **Submit**. Long answers show in full under the box.
   - **Multiple choice:** press **1** to **4** to select an answer. You can change your choice. Then press **a** or **Submit**.
4. Read the feedback, then press **Next question**, or go back to your work. A new question comes the next time Claude starts working.
5. If you missed the question (a wrong pick, or feedback that starts with "Partly." or "Not yet."), press **d** or **Go deeper** for a short lesson on the gap: the core idea, one example, and the one thing to remember. It shows under the feedback.

Press **s** to skip a question and **f** to switch between free text and multiple choice.

The first prompt of a session gives no question, because there is nothing to ask about yet.

## Customize

### Commands

| Command | What it does |
| --- | --- |
| `/quiz` | Open the pane and show this session's usage. |
| `/quiz now` | Ask a question now. |
| `/quiz free` | Use free-text questions. |
| `/quiz choice` | Use multiple-choice questions. |
| `/quiz max 5` | Ask at most 5 questions per session. The default is 10. |
| `/quiz budget 30000` | Use at most 30,000 tokens per session. The default is 20,000. |
| `/quiz reset` | Reset this session's question and token count. |

The format, question limit, and token budget are saved across sessions.

### Cost

Each question costs about 300 to 1,000 tokens with its grade. Most of that is the session text sent to Haiku. A multiple-choice answer is checked by the plugin, with no second call. **Go deeper** makes one more call, only when you press it, of about 300 to 600 tokens. It counts toward the token budget but not the question limit. On a Claude subscription, the calls count toward your plan's usage limits.

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

The prompts that make and grade questions and write **Go deeper** lessons are in [`PROMPTS.md`](PROMPTS.md), with the teaching ideas behind them. Edit the constants `ASK_SYSTEM`, `MOVES`, `CHOICE_RULES`, `GRADE_SYSTEM`, and `LESSON_SYSTEM` in `hooks/register.tsx` to change them.

## Develop

Run a session with the plugin loaded from this folder. It reloads when you save a file:

```sh
claude --plugin-dir .
```

Check the plugin before you push:

```sh
claude plugin validate .
npx -p typescript tsc -p .
```

`types/index.d.ts` declares the values the pane keeps in session state.

## Roadmap

See [TODOS.md](TODOS.md). Next up is letting you name topics to prioritize.
