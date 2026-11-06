# zapier-notion-agents

Zapier platform integration for the [Notion Agent APIs](https://developers.notion.com/guides/notion-agent-apis/overview). Lets Zaps chat with **your personal agent (Notion AI)** or any **Custom Agent** you can access: send a message, read the reply, and retrieve full session transcripts.

## What's included

| Type | Key | Purpose |
|------|-----|---------|
| Trigger (hidden) | `list_agents` | Populates the agent dropdown (`POST /v1/agents/query`) |
| Trigger (hidden) | `list_sessions` | Populates the session dropdown, optionally scoped by agent (`POST /v1/sessions/query`) |
| Search | `get_session_transcript` | Returns session metadata plus a `messages` array and a plain-text `transcript` (`GET /v1/sessions/{id}` + `POST /v1/sessions/{id}/events/query`) |
| Create | `send_message` | Starts a chat with an agent or continues one (`POST /v1/sessions`), then waits up to `wait_seconds` (max 20) for the reply |
| Search | `get_agent` | Returns an agent's settings (`GET /v1/agents/{id}`), defaulting to `notion_ai`, with `model_mode` (`auto`/`pinned`) and `model_id` flattened out |
| Search | `get_agent_reply` | Returns the agent's reply after a given event sequence, optionally waiting for the turn to finish. Always returns one result |

### Personal agent vs Custom Agents

Both work through the same actions. The personal agent's id is `notion_ai`; the agent dropdown lists it first as **Notion AI (personal agent)**. It is only reachable with a personal access token, which is why this app uses one. Custom Agents use their own id.

### Send, then read the reply

Agents answer asynchronously, and a Zapier action has ~30 seconds. `send_message` therefore waits a bounded time:

- If the agent finishes in time, `reply_text` holds the answer and **Agent Finished?** (`is_settled`) is true.
- If not, the step still succeeds with `is_settled: false`. Call `get_agent_reply` later with the session ID and `after_sequence` = the send step's **Last Event Sequence**. That cursor stays just after your message until the turn settles, so the later call returns the whole reply.
- Status `requires_action` means the agent is waiting for an approval in Notion (`required_actions` lists them).
- Once the message has been sent, `send_message` never fails the step: a failure while fetching the reply is reported in `error_message` instead, so a Zapier replay cannot send the message twice.
- Every session is tagged with metadata `source=zapier` and the Zap's id.

By default the transcript contains only `user.message` and `agent.message` events. Enable **Include Full Detail?** to also include `agent.thinking`, `agent.tool_use`, and `agent.tool_result` events.

## Authentication

Custom auth with a single field: a Notion **personal access token** (`ntn_…`) created at <https://www.notion.so/developers/tokens> with the "Notion API" capability. It acts as you, so it reaches your personal agent and every Custom Agent you can access in Notion. PATs expire after at most a year; reconnect before then. All requests send `Notion-Version: 2026-03-11`.

## Development

```bash
npm install
```

Offline unit tests (no credentials needed; `test/lib/session.test.js` covers the send/reply actions against a fake `z`):

```bash
npx jest test/lib
```

The trigger/search tests run against the live Notion API and expect an `API_KEY` environment variable (e.g. from a `.env` file, or injected via a secrets manager using the committed `.env.tpl`). The workspace must contain at least one agent with at least one session.

```bash
npx jest
```

Validate and deploy:

```bash
npx zapier validate
npx zapier push
```
