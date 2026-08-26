const zapier = require('zapier-platform-core');
const App = require('../../index');
const appTester = zapier.createAppTester(App);
zapier.tools.env.inject();

describe('triggers.list_agents', () => {
  it('should list agents with id and name', async () => {
    const bundle = {
      authData: { api_key: process.env.API_KEY },
      inputData: {},
    };

    const results = await appTester(App.triggers['list_agents'].operation.perform, bundle);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    const agent = results[0];
    expect(agent).toHaveProperty('id');
    expect(agent).toHaveProperty('name');
    expect(agent).toHaveProperty('agent_type');
  });
});
