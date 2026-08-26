const MESSAGE_EVENT_TYPES = ['user.message', 'agent.message'];
const DETAIL_EVENT_TYPES = ['agent.thinking', 'agent.tool_use', 'agent.tool_result'];

const ROLE_LABELS = {
  'user.message': 'User',
  'agent.message': 'Agent',
  'agent.thinking': 'Agent (thinking)',
  'agent.tool_use': 'Agent (tool use)',
  'agent.tool_result': 'Tool result',
};

/**
 * Extract plain text from an event's content array. Falls back to
 * JSON-stringifying non-text blocks so tool events remain readable.
 */
const extractText = (content) => {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return content == null ? '' : JSON.stringify(content);
  }
  return content
    .map((block) => {
      if (block?.type === 'text' && typeof block.text === 'string') {
        return block.text;
      }
      return JSON.stringify(block);
    })
    .join('');
};

/**
 * Map a session event to a flat message row for Zap output.
 */
const eventToMessage = (event) => ({
  id: event.id,
  type: event.type,
  role: event.type === 'user.message' ? 'user' : 'agent',
  text: extractText(event.content),
  created_at: event.created_at || null,
});

/**
 * Render message rows as a plain-text transcript.
 */
const buildTranscript = (messages) =>
  messages
    .map((m) => `${ROLE_LABELS[m.type] || m.type}: ${m.text}`)
    .join('\n\n');

module.exports = {
  MESSAGE_EVENT_TYPES,
  DETAIL_EVENT_TYPES,
  extractText,
  eventToMessage,
  buildTranscript,
};
