const { addNotionHeaders } = require('./middleware');
const authentication = require('./authentication');
const listAgentsTrigger = require('./triggers/list_agents');
const listSessionsTrigger = require('./triggers/list_sessions');
const getSessionTranscriptSearch = require('./searches/get_session_transcript');

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,
  authentication,
  beforeRequest: [addNotionHeaders],
  triggers: {
    [listAgentsTrigger.key]: listAgentsTrigger,
    [listSessionsTrigger.key]: listSessionsTrigger,
  },
  searches: {
    [getSessionTranscriptSearch.key]: getSessionTranscriptSearch,
  },
};
