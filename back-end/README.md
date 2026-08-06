# back-end

BioDesigner's API. A thin Express server that fronts the OpenAI API with
[BIDARA](https://github.com/nasa-petal/bidara) — NASA PeTaL's biomimetic design
and research assistant — as its system prompt.

Node + TypeScript (`tsx` + `nodemon` for dev), Express 5, OpenAI SDK.

## Setup

```bash
cp .env.example .env   # then fill in OPENAI_API_KEY
npm install
npm run dev            # :4000, restarts on change
```

`npm run build` compiles to `dist/`; `npm start` runs the compiled output.
`npm run typecheck` is `tsc --noEmit`.

## Endpoints

### `GET /health`

```json
{ "status": "ok", "model": "gpt-4o-mini", "summaryModel": "gpt-4o-mini" }
```

### `POST /api/chat`

The server is stateless — BIDARA's process is a back-and-forth, so the client
sends the whole conversation back on every request. Send either a single turn:

```json
{ "prompt": "I want to reduce water loss in rooftop gardens." }
```

or the full history:

```json
{
  "messages": [
    { "role": "user", "content": "I want to reduce water loss in rooftop gardens." },
    { "role": "assistant", "content": "Let's start with step 1, Define..." },
    { "role": "user", "content": "The impact I want is..." }
  ]
}
```

`role` is `user` or `assistant` only — the BIDARA system message is prepended
server-side and is not accepted from the client.

Two optional fields drive step progression:

| Field | Default | Meaning |
|---|---|---|
| `currentStep` | `"Define"` | Which step BIDARA must work within. |
| `forcedAdvance` | `false` | The user moved on before BIDARA was satisfied. |

The client owns the step — see [The step protocol](#the-step-protocol).

#### Streaming (default)

The response is `text/event-stream`. Three event shapes:

```
data: {"delta":"Let's "}          ← one per token, no event name
data: {"delta":"start "}

event: done                        ← normal end of stream
data: {"model":"gpt-5.6-luna","step":"Define","stepComplete":false}

event: error                       ← failure after streaming began
data: {"error":"terminated"}
```

`stepComplete` on the `done` event is BIDARA's recommendation that the current
step is satisfied. It is a suggestion, not a transition — the client decides.

Because `EventSource` is GET-only and this is a POST, consume it with `fetch`:

```ts
const response = await fetch("http://localhost:4000/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages }),
  signal: abortController.signal,
});

if (!response.ok) {
  const { error } = await response.json();
  throw new Error(error);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const frames = buffer.split("\n\n");
  buffer = frames.pop() ?? "";

  for (const frame of frames) {
    // ...parse `event:` / `data:` lines and append `delta` to the transcript
  }
}
```

Aborting that `fetch` cancels the OpenAI request too, so a user who navigates
away mid-answer stops burning tokens.

Failures *before* the first token — a bad key, an unreachable API — come back as
a normal JSON error with a real status code, not a 200 with an error event. The
SSE headers are deliberately held back until the first token arrives to make
that possible. Only failures *after* streaming has begun use `event: error`.

#### Non-streaming

Pass `stream: false` for a single JSON response — handy for `curl` and tests:

```json
{ "reply": "...", "model": "gpt-4o-mini" }
```

Errors are `{ "error": "..." }` — `400` for a malformed body, the upstream
status for OpenAI failures, `500` otherwise.

### `POST /api/summarize`

Compresses one turn into a single third-person sentence for the session ledger
the front-end shows beside the chat.

```json
{ "text": "I want to help jobseekers focus on valuable leads", "speaker": "user" }
```

`speaker` picks the subject noun — `user` → "Human", `assistant` →
"BioDesigner" — so both sides of the conversation get a consistent record:

```json
{ "summary": "Human expressed interest in solving jobseeking energy expenditure.", "model": "gpt-5-nano" }
```

Not streamed; the output is one line. Assistant turns can only be summarized
once their stream has finished, since the full text is the input.

No step is returned. An earlier version had this endpoint classify the turn into
a design step and it was unreliable — 4 to 7 correct out of 9 depending on the
model, failing in both directions. One turn plus a step label is not enough
context, and a turn doesn't really have a step: the *conversation* has a current
step and turns happen while it sits there. The client owns the step and tags
entries itself.

## The step protocol

The client owns `currentStep`, not the model. It is passed in on every chat
request, BIDARA works within it, and BIDARA never moves it.

BIDARA signals that a step looks satisfied by emitting a sentinel token at the
end of its reply. The route strips every occurrence before anything reaches the
client — including tokens split across stream chunks — and reports it as
`stepComplete` on the `done` event. The token is never visible to the user.

The client then asks whether to move on or keep working. If the user moves on
before BIDARA is satisfied, it sends `forcedAdvance: true` with the next step,
and the server tells BIDARA the move was forced and asks it to open by naming
what remains unresolved. Recording that gap is what makes a second pass through
the cycle worth doing.

**Expect forced advancement to be the common path.** BIDARA is deliberately hard
to satisfy, and testing showed it will keep finding legitimate gaps almost
indefinitely — three increasingly rigorous Define answers produced no readiness
signal at all until the prompt was given explicit per-step completion criteria
and told that "beyond further improvement" is not the bar. Those criteria now
live in `BIDARA_BEHAVIOR_ADDENDUM`. The signal fires, but the escape hatch is the
primary progression mechanism, not a safety valve.

## The system prompt

`prompt.ts` exports two pieces, concatenated at send time:

- `BIDARA_SYSTEM_PROMPT` — NASA PeTaL's prompt, verbatim apart from curly quotes
  normalized to straight ones. Don't edit this.
- `BIDARA_BEHAVIOR_ADDENDUM` — ours. The PeTaL prompt already asks BIDARA to
  critique the user's design question, but chat models default to agreeable:
  they open with praise, accept a vague answer as sufficient, and advance a step
  because the user nodded. The addendum pushes back on that.

Keeping them separate means the NASA text stays auditable and every change we
make to BIDARA's behavior lives in one place.

Prompt wording only goes so far, though — telling a weak design question from a
strong one is a model-capability problem. Expect a noticeably sharper register
on something larger than `gpt-4o-mini`; `OPENAI_MODEL` is a one-line change, and
`OPENAI_SUMMARY_MODEL` lets the summaries stay cheap regardless.

## Layout

```
src/
├── index.ts               app wiring, CORS, error handler, listen
├── config.ts              env loading and validation
├── openai.ts              OpenAI client, generateReply()/streamReply()/summarize()
├── prompt.ts              BIDARA system prompt, behavior addendum, step context
├── steps.ts               the five design steps
├── summarizer.ts          the ledger-sentence prompt and subject nouns
└── routes/
    ├── chat.ts            POST /api/chat
    └── summarize.ts       POST /api/summarize
```

## Notes

- Conversations are not persisted anywhere. Nothing is stored server-side.
- The client resends the full history each turn, and the BIDARA system prompt is
  ~13.5k characters, so every request re-sends it. Worth watching as
  conversations get long.
