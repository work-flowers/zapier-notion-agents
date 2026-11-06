const {
  BASE_URL,
  MAX_WAIT_SECONDS,
  DEFAULT_WAIT_SECONDS,
  clampWaitSeconds,
  notionRequest,
  buildMetadata,
  latestSequence,
  eventsAfter,
  waitForSession,
  buildReplyResult,
} = require('../lib/session');
const { replySample, replyOutputFields } = require('../lib/reply_fields');

const perform = async (z, bundle, deps = {}) => {
  const { agent_id, session_id, message, prompt_context, metadata, wait_seconds } =
    bundle.inputData;

  if (!message || !String(message).trim()) {
    throw new z.errors.Error('Message is required.', 'invalid_input', 400);
  }
  if (!session_id && !agent_id) {
    throw new z.errors.Error(
      'Choose an agent to start a new chat, or a session to continue one.',
      'invalid_input',
      400,
    );
  }

  // Baseline: everything after this sequence is the new turn.
  const baseline = session_id ? await latestSequence(z, session_id) : 0;

  const body = {
    message: String(message),
    metadata: buildMetadata(metadata, bundle.meta?.zap?.id),
    ...(session_id ? { session_id } : { agent_id }),
    ...(prompt_context ? { prompt_context: String(prompt_context) } : {}),
  };

  const created = await notionRequest(z, {
    url: `${BASE_URL}/sessions`,
    method: 'POST',
    body,
  });

  // The message has been sent. From here on, never throw: Zapier would
  // treat the step as failed and a replay would send the message twice.
  // Return what we have and let Get Agent Reply fetch the rest.
  try {
    const session = await waitForSession(z, created.id, clampWaitSeconds(wait_seconds), {
      initial: created,
      ...deps,
    });
    const events = await eventsAfter(z, created.id, baseline);
    return buildReplyResult(session, events, baseline);
  } catch (err) {
    z.console.log(`Message sent to session ${created.id}; reply fetch failed: ${err.message}`);
    return {
      ...buildReplyResult(created, [], baseline),
      error_message: `Message sent, but the reply could not be fetched yet (${err.message}). Use Get Agent Reply with this session ID.`,
    };
  }
};

module.exports = {
  key: 'send_message',
  noun: 'Message',
  display: {
    label: 'Send Message to Agent',
    description:
      'Sends a message to your personal agent (Notion AI) or a Custom Agent, starting a new chat or continuing one, and returns the reply if it arrives in time.',
  },
  operation: {
    perform,
    inputFields: [
      {
        key: 'agent_id',
        label: 'Agent',
        type: 'string',
        required: false,
        dynamic: 'list_agents.id.name',
        altersDynamicFields: true,
        helpText:
          'The agent to start a new chat with. Choose **Notion AI (personal agent)** for your own agent, or enter `notion_ai`. Not needed when continuing a session.',
      },
      {
        key: 'session_id',
        label: 'Session',
        type: 'string',
        required: false,
        dynamic: 'list_sessions.id.title',
        helpText:
          'Leave blank to start a new chat. To continue a chat, pick or map its session ID (only sessions you started can be continued).',
      },
      {
        key: 'message',
        label: 'Message',
        type: 'text',
        required: true,
        helpText: 'What to say to the agent (up to 10,000 characters).',
      },
      {
        key: 'prompt_context',
        label: 'Extra Context',
        type: 'text',
        required: false,
        helpText:
          'Optional background for the agent that is not shown as part of your message (up to 10,000 characters).',
      },
      {
        key: 'metadata',
        label: 'Metadata',
        dict: true,
        required: false,
        helpText:
          'Optional key/value tags stored on the session. `source=zapier` and the Zap ID are always added.',
      },
      {
        key: 'wait_seconds',
        label: 'Wait for Reply (Seconds)',
        type: 'integer',
        required: false,
        default: String(DEFAULT_WAIT_SECONDS),
        helpText: `How long to wait for the agent to answer, 0 to ${MAX_WAIT_SECONDS}. If it is still working when time runs out, the step succeeds with **Agent Finished?** = false; use **Get Agent Reply** later with the session ID and **Last Event Sequence**.`,
      },
    ],
    sample: replySample,
    outputFields: replyOutputFields,
  },
};
