const { queryAll } = require('../lib/api');
const {
  MESSAGE_EVENT_TYPES,
  DETAIL_EVENT_TYPES,
  eventToMessage,
  buildTranscript,
} = require('../lib/transcript');

const perform = async (z, bundle) => {
  const { session_id, include_full_detail } = bundle.inputData;

  const sessionResponse = await z.request({
    url: `https://api.notion.com/v1/sessions/${session_id}`,
  });
  const session = sessionResponse.data;

  const eventTypes = include_full_detail
    ? [...MESSAGE_EVENT_TYPES, ...DETAIL_EVENT_TYPES]
    : MESSAGE_EVENT_TYPES;

  const events = await queryAll(
    z,
    `https://api.notion.com/v1/sessions/${session_id}/events/query`,
    { filter: { property: 'type', event_type: { in: eventTypes } } },
  );

  const messages = events.map(eventToMessage);

  return [
    {
      ...session,
      messages,
      transcript: buildTranscript(messages),
      event_count: events.length,
    },
  ];
};

module.exports = {
  key: 'get_session_transcript',
  noun: 'Transcript',
  display: {
    label: 'Get Session Transcript',
    description: 'Retrieves the full chat transcript of an agent session.',
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
        helpText: 'The agent session to retrieve the transcript for.',
      },
      {
        key: 'include_full_detail',
        label: 'Include Full Detail?',
        type: 'boolean',
        required: false,
        default: 'false',
        helpText:
          'When enabled, the transcript also includes thinking, tool use, and tool result events in addition to user and agent messages.',
      },
    ],
    sample: {
      object: 'session',
      id: '2a1c7c06-781b-4987-9986-5c8dd3028014',
      agent_id: '1f0c7c06-781b-4987-9986-5c8dd3028013',
      title: 'Weekly report request',
      status: 'completed',
      created_at: '2026-08-20T10:30:00.000Z',
      updated_at: '2026-08-20T10:35:00.000Z',
      message_count: 2,
      event_count: 2,
      transcript: 'User: Summarize this week.\n\nAgent: Here is your weekly summary…',
      messages: [
        {
          id: 'evt_001',
          type: 'user.message',
          role: 'user',
          text: 'Summarize this week.',
          created_at: '2026-08-20T10:30:00.000Z',
        },
        {
          id: 'evt_002',
          type: 'agent.message',
          role: 'agent',
          text: 'Here is your weekly summary…',
          created_at: '2026-08-20T10:34:50.000Z',
        },
      ],
    },
    outputFields: [
      { key: 'id', label: 'Session ID', type: 'string' },
      { key: 'agent_id', label: 'Agent ID', type: 'string' },
      { key: 'title', label: 'Session Title', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'created_at', label: 'Created At', type: 'datetime' },
      { key: 'updated_at', label: 'Updated At', type: 'datetime' },
      { key: 'message_count', label: 'Message Count', type: 'integer' },
      { key: 'event_count', label: 'Event Count', type: 'integer' },
      { key: 'transcript', label: 'Transcript (Plain Text)', type: 'string' },
      { key: 'messages[]id', label: 'Message Event ID', type: 'string' },
      { key: 'messages[]type', label: 'Message Event Type', type: 'string' },
      { key: 'messages[]role', label: 'Message Role', type: 'string' },
      { key: 'messages[]text', label: 'Message Text', type: 'string' },
      { key: 'messages[]created_at', label: 'Message Created At', type: 'datetime' },
    ],
  },
};
