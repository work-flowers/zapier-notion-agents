const zapier = require('zapier-platform-core');
const App = require('../../index');
const appTester = zapier.createAppTester(App);
zapier.tools.env.inject();

describe('triggers.list_sessions', () => {
  it('should list sessions with id, title, and status', async () => {
    const bundle = {
      authData: { api_key: process.env.API_KEY },
      inputData: {},
    };

    const results = await appTester(App.triggers['list_sessions'].operation.perform, bundle);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    const session = results[0];
    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('title');
    expect(session).toHaveProperty('status');
    expect(session).toHaveProperty('agent_id');
    expect(session).toHaveProperty('updated_at');
  });

  it('should scope sessions to a single agent', async () => {
    const authData = { authData: { api_key: process.env.API_KEY }, inputData: {} };
    const allSessions = await appTester(
      App.triggers['list_sessions'].operation.perform,
      authData,
    );
    const agentId = allSessions[0].agent_id;

    const bundle = {
      authData: { api_key: process.env.API_KEY },
      inputData: { agent_id: agentId },
    };
    const results = await appTester(App.triggers['list_sessions'].operation.perform, bundle);
    expect(results.length).toBeGreaterThan(0);
    for (const session of results) {
      expect(session.agent_id).toBe(agentId);
    }
  });
});
