const {
  MESSAGE_EVENT_TYPES,
  DETAIL_EVENT_TYPES,
  extractText,
  eventToMessage,
  buildTranscript,
} = require('../../lib/transcript');

describe('lib.transcript', () => {
  describe('extractText', () => {
    it('joins text blocks', () => {
      expect(
        extractText([
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ]),
      ).toBe('Hello world');
    });

    it('stringifies non-text blocks', () => {
      expect(extractText([{ type: 'tool_use', name: 'search' }])).toBe(
        '{"type":"tool_use","name":"search"}',
      );
    });

    it('handles plain strings and missing content', () => {
      expect(extractText('raw')).toBe('raw');
      expect(extractText(null)).toBe('');
      expect(extractText({ foo: 'bar' })).toBe('{"foo":"bar"}');
    });
  });

  describe('eventToMessage', () => {
    it('maps user messages to the user role', () => {
      const message = eventToMessage({
        id: 'evt_1',
        type: 'user.message',
        content: [{ type: 'text', text: 'Hi' }],
        created_at: '2026-08-20T10:30:00.000Z',
      });
      expect(message).toEqual({
        id: 'evt_1',
        type: 'user.message',
        role: 'user',
        text: 'Hi',
        created_at: '2026-08-20T10:30:00.000Z',
      });
    });

    it('maps agent event types to the agent role', () => {
      for (const type of ['agent.message', ...DETAIL_EVENT_TYPES]) {
        expect(eventToMessage({ id: 'e', type, content: [] }).role).toBe('agent');
      }
    });
  });

  describe('buildTranscript', () => {
    it('renders labelled lines separated by blank lines', () => {
      const messages = [
        { type: 'user.message', text: 'Hi' },
        { type: 'agent.message', text: 'Hello!' },
        { type: 'agent.thinking', text: 'hmm' },
      ];
      expect(buildTranscript(messages)).toBe(
        'User: Hi\n\nAgent: Hello!\n\nAgent (thinking): hmm',
      );
    });
  });

  it('exposes the expected event type groups', () => {
    expect(MESSAGE_EVENT_TYPES).toEqual(['user.message', 'agent.message']);
    expect(DETAIL_EVENT_TYPES).toEqual([
      'agent.thinking',
      'agent.tool_use',
      'agent.tool_result',
    ]);
  });
});
