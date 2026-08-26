// Keep total fetch time well under Zapier's 30s Lambda timeout.
const MAX_PAGES = 20;
const PAGE_SIZE = 100;

/**
 * Drain a paginated Notion query endpoint (POST with start_cursor/next_cursor)
 * and return all results concatenated, capped at MAX_PAGES pages.
 */
const queryAll = async (z, url, body = {}) => {
  const results = [];
  let startCursor;
  let pagesFetched = 0;

  do {
    const response = await z.request({
      url,
      method: 'POST',
      body: {
        ...body,
        page_size: PAGE_SIZE,
        ...(startCursor ? { start_cursor: startCursor } : {}),
      },
    });

    const data = response.data;
    results.push(...data.results);
    pagesFetched += 1;
    startCursor = data.has_more ? data.next_cursor : null;
  } while (startCursor && pagesFetched < MAX_PAGES);

  return results;
};

module.exports = { queryAll };
