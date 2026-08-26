const zapier = require('zapier-platform-core');
const App = require('../../index');
const appTester = zapier.createAppTester(App);
zapier.tools.env.inject();

const authData = { api_key: process.env.API_KEY };

// Discover a real session at test time instead of hardcoding IDs.
const findSessionId = async () => {
  const sessions = await appTester(App.triggers['list_sessions'].operation.perform, {
    authData,
    inputData: {},
  });
  expect(sessions.length).toBeGreaterThan(0);
  return sessions[0].id;
};

describe('searches.get_session_transcript', () => {
  it('should return the transcript for a session (messages only)', async () => {
    const sessionId = await findSessionId();

    const results = await appTester(
      App.searches['get_session_transcript'].operation.perform,
      { authData, inputData: { session_id: sessionId } },
    );

    expect(results.length).toBe(1);
    const transcript = results[0];

    // Session metadata fields
    expect(transcript.id).toBe(sessionId);
    expect(transcript).toHaveProperty('agent_id');
    expect(transcript).toHaveProperty('status');

    // Enriched fields
    expect(Array.isArray(transcript.messages)).toBe(true);
    expect(typeof transcript.transcript).toBe('string');
    expect(transcript).toHaveProperty('event_count');
    for (const message of transcript.messages) {
      expect(['user.message', 'agent.message']).toContain(message.type);
      expect(message).toHaveProperty('text');
    }
  });

  it('should include detail events when include_full_detail is true', async () => {
    const sessionId = await findSessionId();

    const results = await appTester(
      App.searches['get_session_transcript'].operation.perform,
      { authData, inputData: { session_id: sessionId, include_full_detail: true } },
    );

    const transcript = results[0];
    const allowedTypes = [
      'user.message',
      'agent.message',
      'agent.thinking',
      'agent.tool_use',
      'agent.tool_result',
    ];
    for (const message of transcript.messages) {
      expect(allowedTypes).toContain(message.type);
    }
  }, 30000);
});
