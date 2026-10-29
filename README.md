# Session Quiz

Session Quiz is a Claude Code plugin that teaches you while Claude works. When Claude starts on a prompt, the plugin reads what your session has covered and asks you one open-ended question about the big ideas behind it. You answer in a pane beside the chat, and a short grade tells you what you got right and what you missed.

It uses Claude Haiku. There is no limit on how much you learn: the quiz never stops you, and token use shows only in Settings.

## Screenshots

The Quiz pane sits beside the chat while Claude works:

![Claude Code with the Quiz pane open beside the chat](docs/screenshots/beside-chat.png)

| Free-text question | Feedback | Multiple choice |
| --- | --- | --- |
| ![A free-text question with an answer typed in](docs/screenshots/free-text.png) | ![The grade after a free-text answer](docs/screenshots/feedback.png) | ![A multiple-choice question with one answer selected](docs/screenshots/multiple-choice.png) |

| Go deeper | Settings |
| --- | --- |
| ![A short lesson after a missed question](docs/screenshots/go-deeper.png) | ![Settings with token use and answer stats](docs/screenshots/settings.png) |

The screenshots come from a real session. To retake one, see [Develop](#develop).

## Install

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
5. If you missed the question (a wrong pick, or feedback that starts with "Partly." or "Not yet."), press **d** or **Go deeper** for a short lesson on the gap: the core idea, one example, and the one thing to remember, in at most 90 words. It shows under the feedback.

Press **s** to skip a question, **f** to switch between free text and multiple choice, and **g** to open Settings.

<<<<<<< HEAD
The first prompt of a session gives no new question, because there is nothing to ask about yet. A review question can still come then.

### Review of missed questions

A question you miss comes back later, because recalling an idea after a gap makes it last. When you miss one, the plugin saves it in a review queue that is kept across sessions. A multiple-choice question keeps its choices and explanation.

A saved question is due 1 day after the miss. Each time you get it right, the gap grows to 3 days, then 7, then 21. Getting it right at 21 days takes it out of the queue. Missing it again sets the gap back to 1 day.

When a question is due, the plugin asks it in place of a new one, with a dim `Review from 2026-10-20` line that gives the day you first missed it. It asks the most overdue question first. Making a review question needs no model call. A free-text answer is still graded by Haiku. If you skip a review question, it comes back the next day.

The queue holds at most 50 questions. When it is full, the questions due last are dropped first.
=======
### Topics to prioritize

Name up to 5 topics you want to get better at, separated by commas:

```text
/quiz focus data science, distributed systems
```

These are areas you want to grow in, and they do not need to match what you are working on. The question always stays on an idea from your session, but when that idea has a real link to one of your areas, the question carries it there. For example, while you build a search box with a `data science` focus, you might get: "Debouncing waits for a pause before acting. Where does the same idea show up when you batch a stream of events before a model sees them?" A dim line such as `Linked to: data science` shows under the question. When the session works on an area directly, the question asks about it. When there is no honest link, the question is chosen as usual. Run `/quiz focus` to see your topics and `/quiz focus clear` to remove them. Topics are saved across sessions.

### Difficulty

Questions come in three levels. Level 1 asks you to explain a core idea in a familiar setting. Level 2 asks you to apply it to a new scenario. Level 3 asks you to weigh a trade-off, an edge case, or a failure mode. The footer of the pane shows the level, such as `Level 2 of 3`.

Each session starts from your last 5 answers: level 3 if 4 or more were Solid, level 1 if 4 or more were misses, and level 2 otherwise. Two Solid answers in a row move you up a level, and two misses in a row move you down. Run `/quiz level 3` to keep it at one level, and the footer adds `, pinned`. Run `/quiz level auto` to let it move again from where it was.

The first prompt of a session gives no question, because there is nothing to ask about yet.
>>>>>>> origin/idea/focus-topics

### Streaks and stats

The plugin counts every answer across sessions. The quiz itself shows no numbers, so it stays about the ideas. Your streak and totals are in Settings. A streak is the number of days in a row, by your local date, with at least one answer. It ends when a whole day passes with no answer.

Each answer is tallied as Solid, Partly, or Not yet. A free-text answer takes the first word of its grade. A multiple-choice answer is Solid when it is right and Not yet when it is wrong. Run `/quiz stats` to see the totals.

### Review log and Anki cards

The plugin keeps a log of your last 500 answers across sessions: the date, the question, your answer, the verdict, the feedback, the source file if there was one, and for multiple choice the choices and the right answer. Your answer and the feedback go through the same secret redaction as the session text before they are saved.

- Run `/quiz log` to write the log as Markdown to `~/learning/session-quiz.md`. It has one section per day, newest first. In each day, the questions you missed come first and their headings start with "Missed:".
- Run `/quiz anki` to write `~/learning/session-quiz-anki.tsv`, one card per question. The front is the question. The back is the right answer for multiple choice, or the last sentence of the feedback (the key idea) for free text. Each card is tagged `session-quiz` and its verdict, such as `not-yet`. In Anki, choose **File**, then **Import**, and pick the file. The note type is Basic.

Each command replaces the file with the whole log, so you can run it as often as you like. The folder is created if it does not exist.

## Privacy

To make a question, the plugin sends Haiku a short digest of the session: the text of the last 40 messages, each cut to 600 characters, and one line per tool call with its file path, command, or search pattern. A tool call shows only as that line, not its output. The digest is at most 6,000 characters. To grade a free-text answer, it sends only the question and your answer.

Before the digest leaves the plugin, likely secrets are replaced with `[redacted key]` or `[redacted secret]`:

- API keys and tokens in known formats: Anthropic and OpenAI (`sk-`), GitHub (`ghp_`, `github_pat_`), AWS key IDs (`AKIA`), Slack (`xoxb-`), and JWTs.
- Private key blocks (`-----BEGIN ... PRIVATE KEY-----`).
- `Authorization: Bearer ...` and `Basic ...` values.
- Values of upper-case names that contain KEY, TOKEN, SECRET, PASSWORD, or API, as in `.env` files (`STRIPE_API_KEY=...`).
- Long random-looking strings: 32 or more characters of hex, or of mixed-case letters and digits. Commit hashes count, so they are redacted too.

Tool calls on secrets files (`.env`, `.env.*`, `*.pem`, `id_rsa*`, `credentials*`) are left out entirely. The patterns are in [`hooks/redact.ts`](hooks/redact.ts). They catch common shapes, not every secret, so avoid pasting credentials into a session.

The review log stays on your computer, in the plugin's store under your Claude Code configuration folder and in the files you export. Nothing in it is sent anywhere.

## Customize

### Commands

| Command | What it does |
| --- | --- |
| `/quiz` | Open the pane. |
| `/quiz settings` | Open Settings in the pane: format, tokens used today and this session, and your answer stats. |
| `/quiz now` | Ask a question now. A due review question comes first. |
| `/quiz review` | Show how many review questions are due and queued, and ask the most overdue one now. |
| `/quiz stats` | Show your answers, Solid, Partly, and Not yet counts, and your current and best streak. |
<<<<<<< HEAD
| `/quiz log` | Write your review log to `~/learning/session-quiz.md`. |
| `/quiz anki` | Write your review log as Anki cards to `~/learning/session-quiz-anki.tsv`. |
=======
| `/quiz focus data science, distributed systems` | Link questions about your work to these areas when there is a real connection. At most 5. |
| `/quiz focus` | List your focus topics. |
| `/quiz focus clear` | Remove all focus topics. |
>>>>>>> origin/idea/focus-topics
| `/quiz free` | Use free-text questions. |
| `/quiz choice` | Use multiple-choice questions. |
<<<<<<< HEAD

<<<<<<< HEAD
The format, stats, daily token counts, and review queue are saved across sessions. The pane shows no counts while you answer; press **g** in the pane, or run `/quiz settings`, to see them.

### Cost

Each question costs about 300 to 1,000 tokens with its grade. Most of that is the session text sent to Haiku. The source file comes back in the same reply, so it adds no call. A multiple-choice answer is checked by the plugin, with no second call. A review question costs nothing to make, so a multiple-choice review costs no tokens at all. **Go deeper** makes one more call, only when you press it, of about 300 to 600 tokens. Nothing is capped: Settings shows tokens used today, the last week by day, and this session. On a Claude subscription, the calls count toward your plan's usage limits.
=======
The format, question limit, token budget, focus topics, and stats are saved across sessions. `/quiz reset` does not clear stats.

### Cost

Each question costs about 300 to 1,000 tokens with its grade. Most of that is the session text sent to Haiku. The source file and focus topic come back in the same reply, so they add no call. Focus topics add a few dozen tokens to each question. A multiple-choice answer is checked by the plugin, with no second call. **Go deeper** makes one more call, only when you press it, of about 300 to 600 tokens. It counts toward the token budget but not the question limit. On a Claude subscription, the calls count toward your plan's usage limits.
>>>>>>> origin/idea/focus-topics
=======
| `/quiz level 3` | Keep questions at level 3. Use 1, 2, or 3. |
| `/quiz level auto` | Let the level follow your answers. This is the default. |
| `/quiz max 5` | Ask at most 5 questions per session. The default is 10. |
| `/quiz budget 30000` | Use at most 30,000 tokens per session. The default is 20,000. |
| `/quiz reset` | Reset this session's question and token count. |

The format, level setting, question limit, token budget, and stats are saved across sessions. `/quiz reset` does not clear stats.

### Cost

Each question costs about 300 to 1,000 tokens with its grade. Most of that is the session text sent to Haiku. The source file comes back in the same reply, so it adds no call. A multiple-choice answer is checked by the plugin, with no second call. **Go deeper** makes one more call, only when you press it, of about 300 to 500 tokens. It counts toward the token budget but not the question limit. On a Claude subscription, the calls count toward your plan's usage limits.
>>>>>>> origin/pr-8

### In the code

All of these are constants at the top of [`hooks/register.tsx`](hooks/register.tsx):

| Constant | Default | What it controls |
| --- | --- | --- |
| `MODEL` | `haiku` | The model that writes and grades questions. |
| `ASK_MAX_TOKENS` | 400 | Longest reply when making a question. |
| `GRADE_MAX_TOKENS` | 300 | Longest reply when grading. |
| `LESSON_MAX_TOKENS` | 250 | Longest reply for a **Go deeper** lesson. |
| `CONTEXT_CHARS` | 6000 | How much of the session is sent to make a question. |
| `ANSWER_CHARS` | 280 | Longest free-text answer. |
<<<<<<< HEAD
| `DEFAULTS` | free text | The format before you change it. |
=======
| `DEFAULTS` | free text, 20,000 tokens, 10 questions, level auto | Settings before you change them with `/quiz`. |
>>>>>>> origin/pr-8
| `ACCENT` | `claude` | The accent color, a theme key or a hex color such as `#e0a35a`. A theme key follows your Claude Code theme. |

The review gaps and queue size are `INTERVALS` (1, 3, 7, 21 days) and `QUEUE_MAX` (50) in [`hooks/review.ts`](hooks/review.ts).

### Prompts

<<<<<<< HEAD
The prompts that make and grade questions and write **Go deeper** lessons are in [`PROMPTS.md`](PROMPTS.md), with the teaching ideas behind them. Edit the constants `ASK_SYSTEM`, `MOVES`, `CHOICE_RULES`, `SOURCE_RULE`, `FOCUS_RULE`, `GRADE_SYSTEM`, and `LESSON_SYSTEM` in `hooks/register.tsx` to change them.
=======
The prompts that make and grade questions and write **Go deeper** lessons are in [`PROMPTS.md`](PROMPTS.md), with the teaching ideas behind them. Edit the constants `ASK_SYSTEM`, `MOVES`, `LEVELS`, `CHOICE_RULES`, `SOURCE_RULE`, `GRADE_SYSTEM`, and `LESSON_SYSTEM` in `hooks/register.tsx` to change them.
>>>>>>> origin/pr-8

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

To retake a screenshot, run the plugin in a tmux session, capture it with colors, and render it with headless Chrome:

```sh
tmux capture-pane -e -p -t <session> > shot.ansi
python3 scripts/term-shot.py shot.ansi docs/screenshots/<name>.png --cols 125:170 --rows 1:30 --title "Quiz pane" --no-bg
```

`--cols` and `--rows` crop to the Quiz pane. Leave them out for the whole window.

## Roadmap

See [TODOS.md](TODOS.md). Next up is giving more weight to topics you often miss.
