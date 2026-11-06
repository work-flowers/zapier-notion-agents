const {
  BASE_URL,
  PERSONAL_AGENT_ID,
  MAX_WAIT_SECONDS,
  DEFAULT_WAIT_SECONDS,
  clampWaitSeconds,
  notionRequest,
  buildMetadata,
  latestSequence,
  eventsAfter,
  waitForSession,
  buildReplyResult,
  retrieveSession,
} = require('../lib/session');
const { applyPersonalModel, SKIPPED_MODEL_FIELDS } = require('../lib/agents');
const { replySample, replyOutputFields } = require('../lib/reply_fields');

// Zapier's limit is 30 s for the whole action. Everything before the reply
// fetch (session lookup, model read/update, send, polling) must end by this
// point, leaving room for the event fetch.
const TOTAL_BUDGET_SECONDS = 24;

const perform = async (z, bundle, deps = {}) => {
  const now = deps.now || Date.now;
  const startedAt = now();
  const {
    agent_id,
    session_id,
    message,
    prompt_context,
    metadata,
    wait_seconds,
    model_mode,
    model_id,
  } = bundle.inputData;

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

  // Which agent will answer? For a follow-up, the session decides.
  const targetAgent = session_id
    ? (await retrieveSession(z, session_id)).agent_id
    : String(agent_id).trim();

  // Model: personal agent only. A Custom Agent's model is never touched,
  // because changing it would also publish a new agent version.
  const modelFields =
    targetAgent === PERSONAL_AGENT_ID
      ? await applyPersonalModel(z, model_mode, model_id)
      : SKIPPED_MODEL_FIELDS;

  // Baseline: everything after this sequence is the new turn.
  const baseline = session_id ? await latestSequence(z, session_id) : 0;

  const body = {
    message: String(message),
    metadata: buildMetadata(metadata, bundle.meta?.zap?.id),
    ...(session_id ? { session_id } : { agent_id: targetAgent }),
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
    const elapsedSeconds = (now() - startedAt) / 1000;
    const waitBudget = Math.min(
      clampWaitSeconds(wait_seconds),
      Math.max(0, Math.floor(TOTAL_BUDGET_SECONDS - elapsedSeconds)),
    );
    const session = await waitForSession(z, created.id, waitBudget, {
      initial: created,
      ...deps,
    });
    const events = await eventsAfter(z, created.id, baseline);
    return { ...buildReplyResult(session, events, baseline), ...modelFields };
  } catch (err) {
    z.console.log(`Message sent to session ${created.id}; reply fetch failed: ${err.message}`);
    return {
      ...buildReplyResult(created, [], baseline),
      ...modelFields,
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
        key: 'model_mode',
        label: 'Model (Personal Agent Only)',
        type: 'string',
        required: false,
        default: 'auto',
        choices: {
          auto: 'Auto (Notion chooses per run)',
          pinned: 'Pinned (enter a Model ID below)',
          unchanged: "Don't change the agent's setting",
        },
        helpText:
          "Applies only to your personal agent (Notion AI); ignored for Custom Agents. The model is a setting on the agent, not on one message, so this changes your personal agent's model everywhere, including chats in the Notion app. It is only updated when it differs from the current setting. Defaults to Auto.",
      },
      {
        key: 'model_id',
        label: 'Pinned Model ID',
        type: 'string',
        required: false,
        helpText:
          'Only used when Model is **Pinned**. Run **Get Agent** to see the exact ID of a model, e.g. the one your personal agent is currently pinned to.',
      },
      {
        key: 'wait_seconds',
        label: 'Wait for Reply (Seconds)',
        type: 'integer',
        required: false,
        default: String(DEFAULT_WAIT_SECONDS),
        helpText: `How long to wait for the agent to answer, 0 to ${MAX_WAIT_SECONDS}. If it is still working when time runs out, the step succeeds with **Agent Finished?** = false; use **Get Agent Reply** later with the session ID and **Last Event Sequence**. The wait is shortened automatically if earlier steps of this action took a while, to stay inside Zapier's 30-second limit.`,
      },
    ],
    sample: {
      ...replySample,
      model_setting: 'already_set',
      model_mode: 'auto',
      model_id: null,
      previous_model_mode: 'auto',
      previous_model_id: null,
    },
    outputFields: [
      ...replyOutputFields,
      {
        key: 'model_setting',
        label: 'Model Setting Result (changed/already_set/unchanged/skipped_custom_agent)',
        type: 'string',
      },
      { key: 'model_mode', label: 'Agent Model Mode', type: 'string' },
      { key: 'model_id', label: 'Agent Pinned Model ID', type: 'string' },
      { key: 'previous_model_mode', label: 'Previous Model Mode', type: 'string' },
      { key: 'previous_model_id', label: 'Previous Pinned Model ID', type: 'string' },
    ],
  },
};
