const { extractText } = require('./transcript');
const { queryAll } = require('./api');

const BASE_URL = 'https://api.notion.com/v1';

// The personal agent (Notion AI). Only a personal access token can use it.
const PERSONAL_AGENT_ID = 'notion_ai';

// Zapier actions must finish in ~30s, so the bounded wait for a reply is
// capped well below that to leave room for the send and event fetches.
const MAX_WAIT_SECONDS = 20;
const DEFAULT_WAIT_SECONDS = 15;
const POLL_INTERVAL_MS = 2000;

// Statuses at which the agent is no longer working on the turn, so polling
// stops. `requires_action` is included: the agent is waiting on a human.
const SETTLED_STATUSES = new Set([
  'completed',
  'requires_action',
  'failed',
  'canceled',
  'terminated',
]);

// Notion's session metadata limits.
const METADATA_MAX_KEYS = 20;
const METADATA_MAX_VALUE_LENGTH = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalise a wait_seconds input to an integer within 0..MAX_WAIT_SECONDS.
 * Blank or unparseable input falls back to the default.
 */
const clampWaitSeconds = (value, fallback = DEFAULT_WAIT_SECONDS) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(0, Math.min(MAX_WAIT_SECONDS, Math.floor(n)));
};

/**
 * Notion's own words, appended to friendly messages so bug reports and
 * support tickets can quote exactly what the API said.
 */
const rawNotionDetail = (status, body = {}) => {
  const parts = [`HTTP ${status}`, body?.code || 'unknown_error'];
  if (body?.message) parts.push(body.message);
  const extra = body?.additional_data;
  if (extra?.recovery_kind) parts.push(`recovery_kind=${extra.recovery_kind}`);
  if (body?.request_id) parts.push(`request_id=${body.request_id}`);
  return `[Notion: ${parts.join(' | ')}]`;
};

/**
 * Turn a failed Notion response into a plain description. Pure, so the
 * mapping is unit-tested. `kind` is 'throttled' for 429s, otherwise 'error'.
 */
const describeNotionError = (status, body = {}, headers = {}) => {
  const code = body?.code || 'unknown_error';
  const apiMessage = body?.message || '';
  const recoveryUrl = body?.additional_data?.recovery_url;

  if (status === 429) {
    const retryAfter = Number(headers['retry-after'] ?? headers['Retry-After']);
    return {
      kind: 'throttled',
      code,
      status,
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : 60,
      message: 'Notion rate limit reached. Zapier will retry shortly.',
    };
  }

  let message;
  if (status === 409 && code === 'conflict_error') {
    message =
      'The agent is still answering the previous message in this session. ' +
      'Wait for it to finish (use Get Agent Reply), then send again.';
  } else if (status === 409 && code === 'agent_deleted') {
    message = 'This agent has been deleted in Notion.';
  } else if (status === 403 && code === 'workspace_credits_exhausted') {
    message =
      'The Notion workspace has run out of AI credits.' +
      (recoveryUrl ? ` Manage credits: ${recoveryUrl}` : '');
  } else if (status === 403 && code === 'agent_credit_limit_reached') {
    message =
      "This agent has reached its credit limit in Notion." +
      (recoveryUrl ? ` Manage it: ${recoveryUrl}` : '');
  } else if (status === 404) {
    message =
      'Agent or session not found, or not accessible with this token. ' +
      'The personal agent (Notion AI) needs a personal access token, and you ' +
      'can only continue sessions you started.';
  } else {
    message = `Notion API error ${status} (${code})${apiMessage ? `: ${apiMessage}` : ''}`;
    return { kind: 'error', code, status, message };
  }

  return { kind: 'error', code, status, message: `${message} ${rawNotionDetail(status, body)}` };
};

const toZapierError = (z, d) =>
  d.kind === 'throttled'
    ? new z.errors.ThrottledError(d.message, d.retryAfter)
    : new z.errors.Error(d.message, d.code, d.status);

/**
 * z.request wrapper that maps Notion error responses to readable Zapier
 * errors instead of the default "got 409 calling POST …".
 */
const notionRequest = async (z, options) => {
  const response = await z.request({ ...options, skipThrowForStatus: true });
  if (response.status >= 400) {
    let body = response.data;
    if (body === undefined) {
      try {
        body = JSON.parse(response.content);
      } catch (e) {
        body = {};
      }
    }
    throw toZapierError(
      z,
      describeNotionError(response.status, body, response.headers || {}),
    );
  }
  return response.data;
};

/**
 * Build session metadata: always tag the source (and the Zap, when known),
 * then add caller-supplied pairs up to Notion's limits.
 */
const buildMetadata = (userMetadata, zapId) => {
  const metadata = { source: 'zapier' };
  if (zapId !== undefined && zapId !== null && zapId !== '') {
    metadata.zap_id = String(zapId);
  }
  if (userMetadata && typeof userMetadata === 'object') {
    for (const [key, value] of Object.entries(userMetadata)) {
      if (Object.keys(metadata).length >= METADATA_MAX_KEYS) break;
      if (!key || key in metadata || value === undefined || value === null) continue;
      metadata[key] = String(value).slice(0, METADATA_MAX_VALUE_LENGTH);
    }
  }
  return metadata;
};

const retrieveSession = (z, sessionId) =>
  notionRequest(z, { url: `${BASE_URL}/sessions/${sessionId}` });

/**
 * The highest event sequence in a session so far (0 if none). Used as the
 * baseline before sending a follow-up, so only the new reply is returned.
 */
const latestSequence = async (z, sessionId) => {
  const data = await notionRequest(z, {
    url: `${BASE_URL}/sessions/${sessionId}/events/query`,
    method: 'POST',
    body: {
      sorts: [{ property: 'sequence', direction: 'descending' }],
      page_size: 1,
    },
  });
  return data?.results?.[0]?.sequence ?? 0;
};

/**
 * All events after a sequence number, oldest first.
 */
const eventsAfter = (z, sessionId, afterSequence) =>
  queryAll(z, `${BASE_URL}/sessions/${sessionId}/events/query`, {
    filter: { property: 'sequence', number: { greater_than: afterSequence } },
    sorts: [{ property: 'sequence', direction: 'ascending' }],
  });

/**
 * Poll a session until it settles or the wait budget runs out. Returns the
 * last session object seen (or `initial` if no wait was requested).
 * `sleepFn` and `now` are injectable for tests.
 */
const waitForSession = async (
  z,
  sessionId,
  waitSeconds,
  { initial = null, sleepFn = sleep, now = Date.now } = {},
) => {
  let session = initial;
  if (waitSeconds <= 0) {
    return session || retrieveSession(z, sessionId);
  }
  const deadline = now() + waitSeconds * 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    session = await retrieveSession(z, sessionId);
    if (SETTLED_STATUSES.has(session.status)) return session;
    if (now() + POLL_INTERVAL_MS > deadline) return session;
    await sleepFn(POLL_INTERVAL_MS);
  }
};

/**
 * Flatten a session plus its new events into one Zap-friendly result.
 */
const buildReplyResult = (session, events, afterSequence) => {
  const agentMessages = events.filter((e) => e.type === 'agent.message');
  const isSettled = SETTLED_STATUSES.has(session.status);
  const maxSequence = (list) =>
    list.reduce(
      (max, e) => (typeof e.sequence === 'number' && e.sequence > max ? e.sequence : max),
      afterSequence,
    );
  // Cursor for the next Get Agent Reply. Once the turn has settled it moves
  // to the end. While the agent is still working it stops just after the
  // user's message, so the next call returns the whole reply rather than
  // only the part produced after this one.
  const lastSequence = isSettled
    ? maxSequence(events)
    : maxSequence(events.filter((e) => e.type === 'user.message'));
  const requiredActions = (session.required_actions || []).map((a) => ({
    action_id: a.action_id,
    title: a.title,
    options: (a.options || []).map((o) => o.id).join(', '),
  }));

  return {
    id: session.id,
    session_id: session.id,
    agent_id: session.agent_id,
    title: session.title,
    status: session.status,
    is_settled: isSettled,
    reply_text: agentMessages.map((e) => extractText(e.content)).join('\n\n'),
    reply_message_count: agentMessages.length,
    last_sequence: lastSequence,
    requires_action: session.status === 'requires_action',
    required_actions: requiredActions,
    error_message: session.error?.message || null,
    error_code: session.error?.code || null,
    error_retryable: session.error ? Boolean(session.error.retryable) : null,
    credits_used: session.credits_used ?? null,
    updated_at: session.updated_at,
  };
};

module.exports = {
  BASE_URL,
  PERSONAL_AGENT_ID,
  MAX_WAIT_SECONDS,
  DEFAULT_WAIT_SECONDS,
  POLL_INTERVAL_MS,
  SETTLED_STATUSES,
  clampWaitSeconds,
  rawNotionDetail,
  describeNotionError,
  notionRequest,
  buildMetadata,
  retrieveSession,
  latestSequence,
  eventsAfter,
  waitForSession,
  buildReplyResult,
};
