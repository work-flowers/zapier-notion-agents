const { BASE_URL, PERSONAL_AGENT_ID, notionRequest } = require('./session');

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

const sameModel = (current, wanted) =>
  current?.mode === wanted.mode && (wanted.mode === 'auto' || current?.id === wanted.id);

/**
 * Before a send to the personal agent: read its model setting and change it
 * only if it differs from what this run wants. Never called for Custom Agents,
 * where a model change also publishes a new agent version.
 *
 * Returns the model_* output fields. Throws (before anything is sent) on bad
 * input or a failed read/update; the PATCH is idempotent, so a replay is safe.
 */
const applyPersonalModel = async (z, mode, modelId) => {
  const requested = String(mode || 'auto').trim().toLowerCase();
  const url = `${BASE_URL}/agents/${PERSONAL_AGENT_ID}`;

  if (requested === 'unchanged') {
    const agent = flattenAgent(await notionRequest(z, { url }));
    return {
      model_setting: 'unchanged',
      model_mode: agent.model_mode,
      model_id: agent.model_id,
      previous_model_mode: agent.model_mode,
      previous_model_id: agent.model_id,
    };
  }

  let body;
  try {
    body = buildModelBody(requested, modelId);
  } catch (err) {
    throw new z.errors.Error(err.message, 'invalid_input', 400);
  }

  const before = flattenAgent(await notionRequest(z, { url }));
  const previous = { previous_model_mode: before.model_mode, previous_model_id: before.model_id };

  if (sameModel(before.model, body.model)) {
    return {
      model_setting: 'already_set',
      model_mode: before.model_mode,
      model_id: before.model_id,
      ...previous,
    };
  }

  const after = flattenAgent(await notionRequest(z, { url, method: 'PATCH', body }));
  return {
    model_setting: 'changed',
    model_mode: after.model_mode,
    model_id: after.model_id,
    ...previous,
  };
};

const SKIPPED_MODEL_FIELDS = {
  model_setting: 'skipped_custom_agent',
  model_mode: null,
  model_id: null,
  previous_model_mode: null,
  previous_model_id: null,
};

module.exports = {
  toDropdownItem,
  sortPersonalFirst,
  flattenAgent,
  buildModelBody,
  sameModel,
  applyPersonalModel,
  SKIPPED_MODEL_FIELDS,
};
