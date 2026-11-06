const { BASE_URL, PERSONAL_AGENT_ID, notionRequest } = require('../lib/session');
const { flattenAgent, buildModelBody } = require('../lib/agents');

const perform = async (z, bundle) => {
  const agentId = (bundle.inputData.agent_id || PERSONAL_AGENT_ID).trim();
  let body;
  try {
    body = buildModelBody(bundle.inputData.model_mode, bundle.inputData.model_id);
  } catch (err) {
    throw new z.errors.Error(err.message, 'invalid_input', 400);
  }
  // A PATCH of a property: replaying it lands in the same state.
  const agent = await notionRequest(z, {
    url: `${BASE_URL}/agents/${encodeURIComponent(agentId)}`,
    method: 'PATCH',
    body,
  });
  return flattenAgent(agent);
};

module.exports = {
  key: 'set_agent_model',
  noun: 'Agent',
  display: {
    label: 'Set Agent Model',
    description:
      "Sets an agent's model to Auto or pins a specific model. Defaults to your personal agent (Notion AI). This changes the agent's setting everywhere, including chats in the Notion app.",
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
          'Leave blank for your personal agent (Notion AI, id `notion_ai`), or pick a Custom Agent (needs edit access).',
      },
      {
        key: 'model_mode',
        label: 'Mode',
        type: 'string',
        required: true,
        default: 'auto',
        choices: { auto: 'Auto (Notion chooses per run)', pinned: 'Pinned (one model)' },
      },
      {
        key: 'model_id',
        label: 'Model ID',
        type: 'string',
        required: false,
        helpText:
          'Only for **Pinned**. Must be a model your Notion user can use, otherwise Notion returns a validation error. Run **Get Agent** on an agent pinned to the model you want to see its exact ID.',
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
    ],
  },
};
