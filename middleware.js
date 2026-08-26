const NOTION_VERSION = '2026-03-11';

const addNotionHeaders = (request, z, bundle) => {
  request.headers['Notion-Version'] = NOTION_VERSION;
  if (bundle.authData?.api_key) {
    request.headers.Authorization = `Bearer ${bundle.authData.api_key}`;
  }
  return request;
};

module.exports = { addNotionHeaders };
