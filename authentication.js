module.exports = {
  type: 'custom',
  test: {
    url: 'https://api.notion.com/v1/users/me',
  },
  connectionLabel: '{{name}}',
  fields: [
    {
      key: 'api_key',
      required: true,
      label: 'Personal Access Token',
      type: 'password',
      helpText:
        'Create a personal access token with the "Notion API" capability at https://www.notion.so/developers/tokens and copy it (starts with `ntn_`). A personal access token is required to reach your personal agent (Notion AI), and it can also reach every Custom Agent you can access in Notion. Tokens expire (at most after 1 year): reconnect with a new one before then.',
    },
  ],
  customConfig: {},
};
