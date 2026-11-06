const {
  clampWaitSeconds,
  describeNotionError,
  buildMetadata,
  waitForSession,
  buildReplyResult,
  MAX_WAIT_SECONDS,
  DEFAULT_WAIT_SECONDS,
} = require('../../lib/session');
const { toDropdownItem, sortPersonalFirst } = require('../../lib/agents');
const sendMessage = require('../../creates/send_message');
const getAgentReply = require('../../searches/get_agent_reply');

// ---------- fake z ----------

class FakeAppError extends Error {
  constructor(message, code, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
class FakeThrottledError extends Error {
  constructor(message, delay) {
    super(message);
    this.delay = delay;
  }
}

/**
 * Build a fake z whose request() is answered by `route(req)`, which returns
 * { status, data } (status defaults to 200). Every request is recorded.
 */
const makeZ = (route) => {
  const calls = [];
  const z = {
    calls,
    errors: { Error: FakeAppError, ThrottledError: FakeThrottledError },
    console: { log: jest.fn() },
    request: jest.fn(async (req) => {
      calls.push(req);
      const res = await route(req);
      const status = res.status ?? 200;
      if (status >= 400 && !req.skipThrowForStatus) {
        throw new Error(`HTTP ${status}`);
      }
      return { status, data: res.data, headers: res.headers || {} };
    }),
  };
  return z;
};

const ev = (sequence, type, text) => ({
  object: 'session_event',
  id: `evt_${sequence}`,
  sequence,
  type,
  ...(text !== undefined ? { content: [{ type: 'text', text }] } : {}),
});

const isEventsQuery = (req) => /\/events\/query$/.test(req.url);
const noWait = { sleepFn: async () => {} };

// ---------- pure helpers ----------

describe('clampWaitSeconds', () => {
  it('defaults blank or junk input', () => {
    expect(clampWaitSeconds(undefined)).toBe(DEFAULT_WAIT_SECONDS);
    expect(clampWaitSeconds('')).toBe(DEFAULT_WAIT_SECONDS);
    expect(clampWaitSeconds('abc')).toBe(DEFAULT_WAIT_SECONDS);
    expect(clampWaitSeconds(null, 0)).toBe(0);
  });
  it('clamps to 0..MAX', () => {
    expect(clampWaitSeconds('-5')).toBe(0);
    expect(clampWaitSeconds(999)).toBe(MAX_WAIT_SECONDS);
    expect(clampWaitSeconds('7.9')).toBe(7);
  });
});

describe('describeNotionError', () => {
  it('explains a conflict (agent still running)', () => {
    const d = describeNotionError(409, { code: 'conflict_error', message: 'x' });
    expect(d.kind).toBe('error');
    expect(d.message).toMatch(/still answering/);
  });
  it('includes the recovery URL for exhausted credits', () => {
    const d = describeNotionError(403, {
      code: 'workspace_credits_exhausted',
      additional_data: { recovery_url: 'https://notion.so/credits' },
    });
    expect(d.message).toMatch(/out of AI credits/);
    expect(d.message).toMatch('https://notion.so/credits');
  });
  it('mentions the PAT requirement on 404', () => {
    expect(describeNotionError(404, { code: 'object_not_found' }).message).toMatch(
      /personal access token/,
    );
  });
  it('maps 429 to throttled with Retry-After', () => {
    const d = describeNotionError(429, { code: 'rate_limited' }, { 'retry-after': '7' });
    expect(d).toMatchObject({ kind: 'throttled', retryAfter: 7 });
  });
  it('falls back to a generic message', () => {
    expect(describeNotionError(400, { code: 'validation_error', message: 'bad' }).message).toBe(
      'Notion API error 400 (validation_error): bad',
    );
  });
});

describe('buildMetadata', () => {
  it('always tags source and zap id, and stringifies caller values', () => {
    expect(buildMetadata({ ticket: 42 }, 123)).toEqual({
      source: 'zapier',
      zap_id: '123',
      ticket: '42',
    });
  });
  it('does not let callers overwrite source, and caps keys and value length', () => {
    const many = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`k${i}`, 'v'.repeat(3000)]),
    );
    const m = buildMetadata({ source: 'evil', ...many });
    expect(m.source).toBe('zapier');
    expect(Object.keys(m)).toHaveLength(20);
    expect(m.k0).toHaveLength(2000);
  });
});

describe('buildReplyResult', () => {
  const settled = { id: 's1', agent_id: 'notion_ai', title: 'T', status: 'completed' };
  const running = { ...settled, status: 'in_progress' };
  const events = [ev(5, 'user.message', 'hi'), ev(6, 'agent.thinking'), ev(7, 'agent.message', 'hello'), ev(8, 'agent.message', 'there')];

  it('joins agent messages and moves the cursor to the end once settled', () => {
    const r = buildReplyResult(settled, events, 4);
    expect(r.reply_text).toBe('hello\n\nthere');
    expect(r.reply_message_count).toBe(2);
    expect(r.last_sequence).toBe(8);
    expect(r.is_settled).toBe(true);
  });

  it('keeps the cursor just after the user message while still running', () => {
    const r = buildReplyResult(running, events, 4);
    expect(r.is_settled).toBe(false);
    expect(r.last_sequence).toBe(5);
  });

  it('keeps the baseline when there are no events', () => {
    expect(buildReplyResult(running, [], 12).last_sequence).toBe(12);
  });

  it('flattens required actions', () => {
    const r = buildReplyResult(
      {
        ...settled,
        status: 'requires_action',
        required_actions: [
          { action_id: 'a1', title: 'Delete page?', options: [{ id: 'approve' }, { id: 'reject' }] },
        ],
      },
      [],
      0,
    );
    expect(r.requires_action).toBe(true);
    expect(r.required_actions).toEqual([
      { action_id: 'a1', title: 'Delete page?', options: 'approve, reject' },
    ]);
  });
});

describe('agents dropdown', () => {
  it('labels the personal agent and lists it first', () => {
    const items = [
      { id: 'c1', name: 'Research', agent_type: 'custom_agent' },
      { id: 'notion_ai', name: 'Notion AI', agent_type: 'notion_ai' },
    ].map(toDropdownItem);
    const sorted = sortPersonalFirst(items);
    expect(sorted[0]).toMatchObject({ id: 'notion_ai', name: 'Notion AI (personal agent)' });
    expect(sorted[1]).toMatchObject({ id: 'c1', name: 'Research' });
  });
});

// ---------- waitForSession ----------

describe('waitForSession', () => {
  it('polls until the session settles', async () => {
    const statuses = ['queued', 'in_progress', 'completed'];
    const z = makeZ(() => ({ data: { id: 's1', status: statuses.shift() } }));
    const s = await waitForSession(z, 's1', 20, noWait);
    expect(s.status).toBe('completed');
    expect(z.request).toHaveBeenCalledTimes(3);
  });

  it('stops at the deadline and returns the running session', async () => {
    let t = 0;
    const z = makeZ(() => ({ data: { id: 's1', status: 'in_progress' } }));
    const s = await waitForSession(z, 's1', 5, {
      sleepFn: async (ms) => {
        t += ms;
      },
      now: () => t,
    });
    expect(s.status).toBe('in_progress');
    expect(z.request.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('returns the initial session without polling when wait is 0', async () => {
    const z = makeZ(() => {
      throw new Error('should not be called');
    });
    const s = await waitForSession(z, 's1', 0, { initial: { id: 's1', status: 'queued' } });
    expect(s.status).toBe('queued');
  });
});

// ---------- send_message ----------

describe('creates.send_message', () => {
  const perform = sendMessage.operation.perform;

  it('starts a new personal-agent session and returns the reply', async () => {
    const z = makeZ((req) => {
      if (req.url.endsWith('/v1/agents/notion_ai')) return { data: { id: 'notion_ai', model: { mode: 'auto' } } };
      if (req.method === 'POST' && req.url.endsWith('/v1/sessions')) {
        return { data: { id: 's1', agent_id: 'notion_ai', status: 'queued' } };
      }
      if (isEventsQuery(req)) {
        return { data: { results: [ev(1, 'user.message', 'hi'), ev(2, 'agent.message', 'Hello Dennis')], has_more: false } };
      }
      return { data: { id: 's1', agent_id: 'notion_ai', status: 'completed', credits_used: 0.3 } };
    });

    const r = await perform(
      z,
      { inputData: { agent_id: 'notion_ai', message: 'hi', wait_seconds: '10' }, meta: { zap: { id: 99 } } },
      noWait,
    );

    const post = z.calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/sessions'));
    expect(post.body).toEqual({
      message: 'hi',
      agent_id: 'notion_ai',
      metadata: { source: 'zapier', zap_id: '99' },
    });
    expect(r).toMatchObject({ session_id: 's1', status: 'completed', reply_text: 'Hello Dennis', last_sequence: 2 });
  });

  it('continues a session using the latest sequence as the baseline, without agent_id', async () => {
    const z = makeZ((req) => {
      if (isEventsQuery(req) && req.body.page_size === 1) {
        return { data: { results: [ev(10, 'agent.message', 'old')] } };
      }
      if (isEventsQuery(req)) {
        expect(req.body.filter).toEqual({ property: 'sequence', number: { greater_than: 10 } });
        return { data: { results: [ev(11, 'user.message', 'more'), ev(12, 'agent.message', 'new')], has_more: false } };
      }
      if (req.method === 'POST') return { data: { id: 's1', status: 'queued' } };
      return { data: { id: 's1', status: 'completed' } };
    });

    const r = await perform(
      z,
      { inputData: { agent_id: 'notion_ai', session_id: 's1', message: 'more' } },
      noWait,
    );
    const post = z.calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/sessions'));
    expect(post.body.session_id).toBe('s1');
    expect(post.body).not.toHaveProperty('agent_id');
    expect(r.reply_text).toBe('new');
  });

  it('works the same for a Custom Agent id', async () => {
    const z = makeZ((req) => {
      if (req.method === 'POST' && req.url.endsWith('/v1/sessions')) return { data: { id: 's2', status: 'queued' } };
      if (isEventsQuery(req)) return { data: { results: [], has_more: false } };
      return { data: { id: 's2', status: 'completed' } };
    });
    await perform(z, { inputData: { agent_id: '1f0c7c06-781b-4987-9986-5c8dd3028013', message: 'go' } }, noWait);
    const post = z.calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/sessions'));
    expect(post.body.agent_id).toBe('1f0c7c06-781b-4987-9986-5c8dd3028013');
  });

  it('throws a readable error when the send itself is rejected', async () => {
    const z = makeZ(() => ({ status: 409, data: { code: 'conflict_error', message: 'busy' } }));
    await expect(
      perform(z, { inputData: { session_id: 's1', message: 'x' } }, noWait),
    ).rejects.toThrow(/still answering/);
  });

  it('never throws after the message was sent (no duplicate on replay)', async () => {
    const z = makeZ((req) => {
      if (req.url.endsWith('/v1/agents/notion_ai')) return { data: { id: 'notion_ai', model: { mode: 'auto' } } };
      if (req.method === 'POST' && req.url.endsWith('/v1/sessions')) return { data: { id: 's3', status: 'queued' } };
      return { status: 429, data: { code: 'rate_limited' }, headers: { 'retry-after': '1' } };
    });
    const r = await perform(z, { inputData: { agent_id: 'notion_ai', message: 'x' } }, noWait);
    expect(r).toMatchObject({ session_id: 's3', status: 'queued', is_settled: false });
    expect(r.error_message).toMatch(/Message sent/);
  });

  it('rejects missing message or target before calling Notion', async () => {
    const z = makeZ(() => {
      throw new Error('should not be called');
    });
    await expect(perform(z, { inputData: { agent_id: 'notion_ai', message: '  ' } })).rejects.toThrow(/Message is required/);
    await expect(perform(z, { inputData: { message: 'hi' } })).rejects.toThrow(/Choose an agent/);
  });
});

// ---------- get_agent_reply ----------

describe('searches.get_agent_reply', () => {
  it('returns one result with the reply after the given sequence', async () => {
    const z = makeZ((req) => {
      if (isEventsQuery(req)) {
        expect(req.body.filter.number.greater_than).toBe(3);
        return { data: { results: [ev(4, 'agent.message', 'done')], has_more: false } };
      }
      return { data: { id: 's1', status: 'completed' } };
    });
    const results = await getAgentReply.operation.perform(
      z,
      { inputData: { session_id: 's1', after_sequence: '3' } },
      noWait,
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ reply_text: 'done', last_sequence: 4, is_settled: true });
  });

  it('still returns a result while the agent is working', async () => {
    const z = makeZ((req) =>
      isEventsQuery(req)
        ? { data: { results: [], has_more: false } }
        : { data: { id: 's1', status: 'in_progress' } },
    );
    const results = await getAgentReply.operation.perform(z, { inputData: { session_id: 's1' } }, noWait);
    expect(results[0]).toMatchObject({ status: 'in_progress', reply_text: '', is_settled: false, last_sequence: 0 });
  });
});

// ---------- get_agent ----------

describe('searches.get_agent', () => {
  const getAgent = require('../../searches/get_agent');
  const { flattenAgent } = require('../../lib/agents');

  it('defaults to the personal agent and flattens an auto model', async () => {
    const z = makeZ(() => ({ data: { object: 'agent', id: 'notion_ai', agent_type: 'notion_ai', model: { mode: 'auto' } } }));
    const [a] = await getAgent.operation.perform(z, { inputData: {} });
    expect(z.calls[0].url).toBe('https://api.notion.com/v1/agents/notion_ai');
    expect(a).toMatchObject({ model_mode: 'auto', model_id: null });
  });

  it('flattens a pinned model and passes "hidden" through', () => {
    expect(flattenAgent({ model: { mode: 'pinned', id: 'gpt-x' } })).toMatchObject({ model_mode: 'pinned', model_id: 'gpt-x' });
    expect(flattenAgent({ model: 'hidden' })).toMatchObject({ model_mode: 'hidden', model_id: null });
  });

  it('maps a 404 to the PAT hint', async () => {
    const z = makeZ(() => ({ status: 404, data: { code: 'object_not_found' } }));
    await expect(getAgent.operation.perform(z, { inputData: { agent_id: 'nope' } })).rejects.toThrow(/personal access token/);
  });
});

// ---------- set_agent_model ----------

describe('creates.set_agent_model', () => {
  const setModel = require('../../creates/set_agent_model');
  const { buildModelBody } = require('../../lib/agents');

  it('builds auto and pinned bodies and rejects bad input', () => {
    expect(buildModelBody('auto')).toEqual({ model: { mode: 'auto' } });
    expect(buildModelBody(undefined)).toEqual({ model: { mode: 'auto' } });
    expect(buildModelBody('Pinned', ' gpt-x ')).toEqual({ model: { mode: 'pinned', id: 'gpt-x' } });
    expect(() => buildModelBody('pinned', '')).toThrow(/Model ID is required/);
    expect(() => buildModelBody('fast')).toThrow(/auto" or "pinned/);
  });

  it('PATCHes the personal agent by default and returns the flattened agent', async () => {
    const z = makeZ((req) => ({ data: { object: 'agent', id: 'notion_ai', agent_type: 'notion_ai', model: req.body.model } }));
    const r = await setModel.operation.perform(z, { inputData: { model_mode: 'auto' } });
    expect(z.calls[0]).toMatchObject({ method: 'PATCH', url: 'https://api.notion.com/v1/agents/notion_ai', body: { model: { mode: 'auto' } } });
    expect(r).toMatchObject({ model_mode: 'auto', model_id: null });
  });

  it('turns bad input into a Zapier error without calling Notion', async () => {
    const z = makeZ(() => { throw new Error('should not be called'); });
    await expect(setModel.operation.perform(z, { inputData: { model_mode: 'pinned' } })).rejects.toThrow(/Model ID is required/);
  });
});

// ---------- 1.4.0: per-run model (personal agent only) + raw errors ----------

describe('send_message pre-send failures', () => {
  it('a 429 on the model read throws (retryable) before anything is sent', async () => {
    const z = makeZ((req) => (req.url.endsWith('/v1/agents/notion_ai')
      ? { status: 429, data: { code: 'rate_limited' }, headers: { 'retry-after': '3' } }
      : { data: { id: 's1', status: 'queued' } }));
    await expect(sendMessage.operation.perform(z, { inputData: { agent_id: 'notion_ai', message: 'x' } }, noWait))
      .rejects.toBeInstanceOf(FakeThrottledError);
    expect(z.calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('send_message model handling', () => {
  const perform = sendMessage.operation.perform;

  // Router with a stateful personal-agent model and a simple session.
  const makeRouter = ({ model = { mode: 'pinned', id: 'gpt-5.6-sol' }, sessionAgent = 'notion_ai' } = {}) => {
    const state = { model };
    return (req) => {
      if (req.url.endsWith('/v1/agents/notion_ai')) {
        if (req.method === 'PATCH') state.model = req.body.model;
        return { data: { object: 'agent', id: 'notion_ai', agent_type: 'notion_ai', model: state.model } };
      }
      if (req.method === 'POST' && req.url.endsWith('/v1/sessions')) {
        return { data: { id: 's9', agent_id: req.body.agent_id || sessionAgent, status: 'queued' } };
      }
      if (isEventsQuery(req)) return { data: { results: [], has_more: false } };
      return { data: { id: 's9', agent_id: sessionAgent, status: 'completed' } };
    };
  };
  const order = (z) => z.calls.map((c) => `${c.method || 'GET'} ${c.url.replace('https://api.notion.com/v1', '')}`);

  it('defaults to Auto: reads, then PATCHes a pinned personal agent BEFORE sending', async () => {
    const z = makeZ(makeRouter());
    const r = await perform(z, { inputData: { agent_id: 'notion_ai', message: 'hi' } }, noWait);
    const calls = order(z);
    expect(calls.indexOf('PATCH /agents/notion_ai')).toBeGreaterThan(-1);
    expect(calls.indexOf('PATCH /agents/notion_ai')).toBeLessThan(calls.indexOf('POST /sessions'));
    expect(z.calls.find((c) => c.method === 'PATCH').body).toEqual({ model: { mode: 'auto' } });
    expect(r).toMatchObject({
      model_setting: 'changed',
      model_mode: 'auto',
      previous_model_mode: 'pinned',
      previous_model_id: 'gpt-5.6-sol',
    });
  });

  it('does not PATCH when the setting already matches', async () => {
    const z = makeZ(makeRouter({ model: { mode: 'auto' } }));
    const r = await perform(z, { inputData: { agent_id: 'notion_ai', message: 'hi', model_mode: 'auto' } }, noWait);
    expect(z.calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(r.model_setting).toBe('already_set');
  });

  it('pins a model when asked, and skips the PATCH if already pinned to it', async () => {
    const z = makeZ(makeRouter({ model: { mode: 'auto' } }));
    const r = await perform(z, { inputData: { agent_id: 'notion_ai', message: 'hi', model_mode: 'pinned', model_id: 'gpt-x' } }, noWait);
    expect(r).toMatchObject({ model_setting: 'changed', model_mode: 'pinned', model_id: 'gpt-x' });

    const z2 = makeZ(makeRouter({ model: { mode: 'pinned', id: 'gpt-x' } }));
    const r2 = await perform(z2, { inputData: { agent_id: 'notion_ai', message: 'hi', model_mode: 'pinned', model_id: 'gpt-x' } }, noWait);
    expect(z2.calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(r2.model_setting).toBe('already_set');
  });

  it('"unchanged" never PATCHes but reports the current setting', async () => {
    const z = makeZ(makeRouter());
    const r = await perform(z, { inputData: { agent_id: 'notion_ai', message: 'hi', model_mode: 'unchanged' } }, noWait);
    expect(z.calls.some((c) => c.method === 'PATCH')).toBe(false);
    expect(r).toMatchObject({ model_setting: 'unchanged', model_mode: 'pinned', model_id: 'gpt-5.6-sol' });
  });

  it('never touches a Custom Agent model, even when Pinned is requested', async () => {
    const z = makeZ(makeRouter());
    const r = await perform(z, { inputData: { agent_id: 'custom-123', message: 'hi', model_mode: 'pinned', model_id: 'gpt-x' } }, noWait);
    expect(z.calls.some((c) => c.url.includes('/agents/'))).toBe(false);
    expect(r.model_setting).toBe('skipped_custom_agent');
  });

  it('applies the model when continuing a personal-agent session (agent read from the session)', async () => {
    const z = makeZ(makeRouter({ sessionAgent: 'notion_ai' }));
    const r = await perform(z, { inputData: { session_id: 's9', message: 'more' } }, noWait);
    expect(order(z)[0]).toBe('GET /sessions/s9');
    expect(r.model_setting).toBe('changed');
    const post = z.calls.find((c) => c.method === 'POST' && c.url.endsWith('/v1/sessions'));
    expect(post.body).not.toHaveProperty('agent_id');
  });

  it('skips the model when continuing a Custom Agent session', async () => {
    const z = makeZ(makeRouter({ sessionAgent: 'custom-123' }));
    const r = await perform(z, { inputData: { session_id: 's9', message: 'more', model_mode: 'auto' } }, noWait);
    expect(z.calls.some((c) => c.url.includes('/agents/'))).toBe(false);
    expect(r.model_setting).toBe('skipped_custom_agent');
  });

  it('rejects Pinned without an ID before sending anything', async () => {
    const z = makeZ(makeRouter());
    await expect(perform(z, { inputData: { agent_id: 'notion_ai', message: 'hi', model_mode: 'pinned' } }, noWait)).rejects.toThrow(/Model ID is required/);
    expect(z.calls.some((c) => c.method === 'POST' && c.url.endsWith('/v1/sessions'))).toBe(false);
  });

  it('shrinks the wait when earlier calls used up the time budget', async () => {
    let t = 0;
    const z = makeZ((req) => {
      t += 12000; // each call "takes" 12 s
      return makeRouter({ model: { mode: 'auto' } })(req);
    });
    await perform(z, { inputData: { agent_id: 'notion_ai', message: 'hi', wait_seconds: 20 } }, { sleepFn: async () => {}, now: () => t });
    // GET agent + POST = 24 s elapsed, so no polling: no GET /sessions/s9 at all.
    expect(z.calls.some((c) => (c.method || 'GET') === 'GET' && c.url.endsWith('/sessions/s9'))).toBe(false);
  });
});

describe('raw Notion error detail', () => {
  it('appends Notion code, message and recovery kind to friendly messages', () => {
    const d = describeNotionError(403, {
      code: 'workspace_credits_exhausted',
      message: 'Workspace is out of credits.',
      request_id: 'req_1',
      additional_data: { recovery_kind: 'contact_workspace_owner' },
    });
    expect(d.message).toMatch(/^The Notion workspace has run out of AI credits\./);
    expect(d.message).toContain('[Notion: HTTP 403 | workspace_credits_exhausted | Workspace is out of credits. | recovery_kind=contact_workspace_owner | request_id=req_1]');
  });

  it('exposes the session error code on reply results', () => {
    const r = buildReplyResult(
      { id: 's1', status: 'failed', error: { code: 'agent_credit_limit_reached', message: 'Limit', retryable: false } },
      [],
      0,
    );
    expect(r).toMatchObject({ error_code: 'agent_credit_limit_reached', error_message: 'Limit', error_retryable: false });
  });
});
