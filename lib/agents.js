const { PERSONAL_AGENT_ID } = require('./session');

const toDropdownItem = (agent) => {
  const isPersonal = agent.id === PERSONAL_AGENT_ID || agent.agent_type === PERSONAL_AGENT_ID;
  return {
    id: agent.id,
    name: isPersonal
      ? `${agent.name || 'Notion AI'} (personal agent)`
      : agent.name || 'Untitled agent',
    description: agent.description || null,
    agent_type: agent.agent_type,
  };
};

// With a personal access token the API includes the personal agent
// (id `notion_ai`); list it first, then Custom Agents in API order.
const sortPersonalFirst = (items) => [
  ...items.filter((a) => a.agent_type === PERSONAL_AGENT_ID),
  ...items.filter((a) => a.agent_type !== PERSONAL_AGENT_ID),
];

/**
 * Flatten an agent object for Zap output. `model` is either
 * { mode: 'auto' } or { mode: 'pinned', id }; fields the token may not read
 * come back from Notion as the string "hidden".
 */
const flattenAgent = (agent) => {
  const model = agent.model && typeof agent.model === 'object' ? agent.model : null;
  return {
    ...agent,
    model_mode: model ? model.mode : agent.model ?? null,
    model_id: model && model.mode === 'pinned' ? model.id ?? null : null,
  };
};

/**
 * Build the PATCH body. Pure, so the validation is unit-tested.
 * Throws a plain Error with a user-facing message on bad input.
 */
const buildModelBody = (mode, modelId) => {
  const m = String(mode || 'auto').trim().toLowerCase();
  if (m === 'auto') return { model: { mode: 'auto' } };
  if (m === 'pinned') {
    const id = String(modelId || '').trim();
    if (!id) throw new Error('A Model ID is required when Mode is "pinned".');
    return { model: { mode: 'pinned', id } };
  }
  throw new Error(`Mode must be "auto" or "pinned" (got "${mode}").`);
};

module.exports = { toDropdownItem, sortPersonalFirst, flattenAgent, buildModelBody };
