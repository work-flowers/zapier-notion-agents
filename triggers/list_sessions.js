const { queryAll } = require('../lib/api');

const perform = async (z, bundle) => {
  const { agent_id } = bundle.inputData;

  const body = {
    sorts: [{ property: 'updated_at', direction: 'descending' }],
    ...(agent_id
      ? { filter: { property: 'agent_id', string: { equals: agent_id } } }
      : {}),
  };

  const sessions = await queryAll(z, 'https://api.notion.com/v1/sessions/query', body);

  return sessions.map((session) => ({
    id: session.id,
    title: session.title || 'Untitled session',
    status: session.status,
    agent_id: session.agent_id,
    updated_at: session.updated_at,
  }));
};

module.exports = {
  key: 'list_sessions',
  noun: 'Session',
  display: {
    label: 'List Sessions',
    description: 'Lists agent sessions for use in dynamic dropdowns.',
    hidden: true,
  },
  operation: {
    perform,
    inputFields: [
      {
        key: 'agent_id',
        label: 'Agent',
        type: 'string',
        required: false,
        helpText: 'Optionally limit sessions to a single agent.',
      },
    ],
    sample: {
      id: '2a1c7c06-781b-4987-9986-5c8dd3028014',
      title: 'Weekly report request',
      status: 'completed',
      agent_id: '1f0c7c06-781b-4987-9986-5c8dd3028013',
      updated_at: '2026-08-20T10:35:00.000Z',
    },
    outputFields: [
      { key: 'id', label: 'Session ID', type: 'string' },
      { key: 'title', label: 'Title', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'agent_id', label: 'Agent ID', type: 'string' },
      { key: 'updated_at', label: 'Updated At', type: 'datetime' },
    ],
  },
};
