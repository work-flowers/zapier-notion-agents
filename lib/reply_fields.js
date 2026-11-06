// Shared sample and output fields for Send Message to Agent and Get Agent Reply.

const replySample = {
  id: '2a1c7c06-781b-4987-9986-5c8dd3028014',
  session_id: '2a1c7c06-781b-4987-9986-5c8dd3028014',
  agent_id: 'notion_ai',
  title: 'Weekly summary',
  status: 'completed',
  is_settled: true,
  reply_text: 'Here is your weekly summary…',
  reply_message_count: 1,
  last_sequence: 4,
  requires_action: false,
  required_actions: [],
  error_message: null,
  error_code: null,
  error_retryable: null,
  credits_used: 0.42,
  updated_at: '2026-11-06T10:35:00.000Z',
};

const replyOutputFields = [
  { key: 'session_id', label: 'Session ID', type: 'string' },
  { key: 'agent_id', label: 'Agent ID', type: 'string' },
  { key: 'title', label: 'Session Title', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'is_settled', label: 'Agent Finished?', type: 'boolean' },
  { key: 'reply_text', label: 'Reply Text', type: 'string' },
  { key: 'reply_message_count', label: 'Reply Message Count', type: 'integer' },
  { key: 'last_sequence', label: 'Last Event Sequence', type: 'integer' },
  { key: 'requires_action', label: 'Needs Approval?', type: 'boolean' },
  { key: 'required_actions[]action_id', label: 'Required Action ID', type: 'string' },
  { key: 'required_actions[]title', label: 'Required Action Title', type: 'string' },
  { key: 'required_actions[]options', label: 'Required Action Options', type: 'string' },
  { key: 'error_message', label: 'Error Message', type: 'string' },
  { key: 'error_code', label: 'Error Code', type: 'string' },
  { key: 'error_retryable', label: 'Error Retryable?', type: 'boolean' },
  { key: 'credits_used', label: 'Credits Used', type: 'number' },
  { key: 'updated_at', label: 'Updated At', type: 'datetime' },
];

module.exports = { replySample, replyOutputFields };
