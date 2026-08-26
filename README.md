# zapier-notion-agents

Zapier platform integration for the [Notion Agent APIs](https://developers.notion.com/guides/notion-agent-apis/overview) (public beta). Lets Zaps retrieve the full chat transcript of an agent session, with dynamic dropdowns for selecting an agent and a session.

## What's included

| Type | Key | Purpose |
|------|-----|---------|
| Trigger (hidden) | `list_agents` | Populates the agent dropdown (`POST /v1/agents/query`) |
| Trigger (hidden) | `list_sessions` | Populates the session dropdown, optionally scoped by agent (`POST /v1/sessions/query`) |
| Search | `get_session_transcript` | Returns session metadata plus a `messages` array and a plain-text `transcript` (`GET /v1/sessions/{id}` + `POST /v1/sessions/{id}/events/query`) |

By default the transcript contains only `user.message` and `agent.message` events. Enable **Include Full Detail?** to also include `agent.thinking`, `agent.tool_use`, and `agent.tool_result` events.

## Authentication

Custom auth with a single field: a Notion **personal access token** (`ntn_…`) created at <https://www.notion.so/profile/integrations> with the "Notion API" capability. All requests send `Notion-Version: 2026-03-11`.

## Development

```bash
npm install
```

Offline unit tests (no credentials needed):

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
