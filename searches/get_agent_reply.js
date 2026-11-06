const {
  MAX_WAIT_SECONDS,
  clampWaitSeconds,
  eventsAfter,
  waitForSession,
  buildReplyResult,
} = require('../lib/session');
const { replySample, replyOutputFields } = require('../lib/reply_fields');

const perform = async (z, bundle, deps = {}) => {
  const { session_id, after_sequence, wait_seconds } = bundle.inputData;

  const parsedAfter = Number(after_sequence);
  const afterSequence =
    after_sequence === undefined || after_sequence === '' || !Number.isFinite(parsedAfter)
      ? 0
      : Math.max(0, Math.floor(parsedAfter));

  const session = await waitForSession(z, session_id, clampWaitSeconds(wait_seconds, 0), deps);
  const events = await eventsAfter(z, session_id, afterSequence);

  // Always one result, even with no reply yet, so callers can branch on
  // status instead of hitting "nothing found".
  return [buildReplyResult(session, events, afterSequence)];
};

module.exports = {
  key: 'get_agent_reply',
  noun: 'Reply',
  display: {
    label: 'Get Agent Reply',
    description:
      "Gets an agent's reply in a session (personal agent or Custom Agent), optionally waiting for it to finish.",
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
        helpText: 'Optionally pick an agent to narrow down the session list below.',
      },
      {
        key: 'session_id',
        label: 'Session',
        type: 'string',
        required: true,
        dynamic: 'list_sessions.id.title',
        helpText: 'The session to read the reply from.',
      },
      {
        key: 'after_sequence',
        label: 'After Event Sequence',
        type: 'integer',
        required: false,
        helpText:
          'Only return agent messages after this point. Map **Last Event Sequence** from the step that sent the message. Leave blank for every agent message in the session.',
      },
      {
        key: 'wait_seconds',
        label: 'Wait for Reply (Seconds)',
        type: 'integer',
        required: false,
        default: '0',
        helpText: `How long to wait for the agent to finish, 0 to ${MAX_WAIT_SECONDS}.`,
      },
    ],
    sample: replySample,
    outputFields: replyOutputFields,
  },
};
