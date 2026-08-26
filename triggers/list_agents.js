const { queryAll } = require('../lib/api');

const perform = async (z, bundle) => {
  const agents = await queryAll(z, 'https://api.notion.com/v1/agents/query');

  return agents.map((agent) => ({
    id: agent.id,
    name: agent.name || 'Untitled agent',
    description: agent.description || null,
    agent_type: agent.agent_type,
  }));
};

module.exports = {
  key: 'list_agents',
  noun: 'Agent',
  display: {
    label: 'List Agents',
    description: 'Lists agents for use in dynamic dropdowns.',
    hidden: true,
  },
  operation: {
    perform,
    sample: {
      id: '1f0c7c06-781b-4987-9986-5c8dd3028013',
      name: 'Support Triage Agent',
      description: 'Triages inbound support requests.',
      agent_type: 'custom_agent',
    },
    outputFields: [
      { key: 'id', label: 'Agent ID', type: 'string' },
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'description', label: 'Description', type: 'string' },
      { key: 'agent_type', label: 'Agent Type', type: 'string' },
    ],
  },
};
