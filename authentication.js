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
        'Create a personal access token with the "Notion API" capability at https://www.notion.so/profile/integrations and copy the token (starts with `ntn_`). The Notion Agent APIs are in public beta.',
    },
  ],
  customConfig: {},
};
