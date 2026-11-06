const { BASE_URL, PERSONAL_AGENT_ID, notionRequest } = require('../lib/session');
const { flattenAgent } = require('../lib/agents');

const perform = async (z, bundle) => {
  const agentId = (bundle.inputData.agent_id || PERSONAL_AGENT_ID).trim();
  const agent = await notionRequest(z, {
    url: `${BASE_URL}/agents/${encodeURIComponent(agentId)}`,
  });
  return [flattenAgent(agent)];
};

module.exports = {
  key: 'get_agent',
  noun: 'Agent',
  display: {
    label: 'Get Agent',
    description:
      "Retrieves an agent's settings, including its model (Auto or pinned). Defaults to your personal agent (Notion AI).",
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
        helpText:
          'Leave blank for your personal agent (Notion AI, id `notion_ai`), or pick a Custom Agent.',
      },
    ],
    sample: {
      object: 'agent',
      id: 'notion_ai',
      agent_type: 'notion_ai',
      name: 'Notion AI',
      model: { mode: 'auto' },
      model_mode: 'auto',
      model_id: null,
    },
    outputFields: [
      { key: 'id', label: 'Agent ID', type: 'string' },
      { key: 'agent_type', label: 'Agent Type', type: 'string' },
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'model_mode', label: 'Model Mode (auto/pinned)', type: 'string' },
      { key: 'model_id', label: 'Pinned Model ID', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
    ],
  },
};
