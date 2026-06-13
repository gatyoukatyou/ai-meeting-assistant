import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

function loadService() {
  return loadScript('js/services/fetch-retry-service.js').FetchRetryService;
}

function createResponse(status, retryAfter = null) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get(name) {
        return name.toLowerCase() === 'retry-after' ? retryAfter : null;
      }
    }
  };
}

describe('FetchRetryService', () => {
  it('retries HTTP 429 responses and returns the eventual success response', async () => {
    const service = loadService();
    const calls = [];
    const delays = [];
    const finalResponse = createResponse(200);

    const result = await service.fetchWithRetry('https://example.test', {}, {
      maxAttempts: 3,
      logger: null,
      sleepImpl: async (ms) => { delays.push(ms); },
      fetchImpl: async () => {
        calls.push(Date.now());
        return calls.length === 1 ? createResponse(429) : finalResponse;
      }
    });

    assert.equal(result, finalResponse);
    assert.equal(calls.length, 2);
    assert.deepEqual(delays, [1000]);
  });

  it('retries HTTP 503 responses', async () => {
    const service = loadService();
    let calls = 0;

    const result = await service.fetchWithRetry('https://example.test', {}, {
      maxAttempts: 3,
      logger: null,
      sleepImpl: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return calls < 3 ? createResponse(503) : createResponse(200);
      }
    });

    assert.equal(result.status, 200);
    assert.equal(calls, 3);
  });

  it('does not retry HTTP 401 or 403 responses', async () => {
    const service = loadService();

    for (const status of [401, 403]) {
      let calls = 0;
      const result = await service.fetchWithRetry('https://example.test', {}, {
        maxAttempts: 3,
        logger: null,
        sleepImpl: async () => {},
        fetchImpl: async () => {
          calls += 1;
          return createResponse(status);
        }
      });

      assert.equal(result.status, status);
      assert.equal(calls, 1);
    }
  });

  it('does not retry HTTP 404 or 422 responses', async () => {
    const service = loadService();

    for (const status of [404, 422]) {
      let calls = 0;
      const result = await service.fetchWithRetry('https://example.test', {}, {
        maxAttempts: 3,
        logger: null,
        sleepImpl: async () => {},
        fetchImpl: async () => {
          calls += 1;
          return createResponse(status);
        }
      });

      assert.equal(result.status, status);
      assert.equal(calls, 1);
    }
  });

  it('uses Retry-After seconds when present', async () => {
    const service = loadService();
    const delays = [];
    let calls = 0;

    await service.fetchWithRetry('https://example.test', {}, {
      maxAttempts: 2,
      logger: null,
      sleepImpl: async (ms) => { delays.push(ms); },
      fetchImpl: async () => {
        calls += 1;
        return calls === 1 ? createResponse(429, '2') : createResponse(200);
      }
    });

    assert.deepEqual(delays, [2000]);
  });

  it('uses Retry-After HTTP-date when present', async () => {
    const service = loadService();
    const delays = [];
    let calls = 0;

    await service.fetchWithRetry('https://example.test', {}, {
      maxAttempts: 2,
      logger: null,
      nowImpl: () => Date.parse('Sat, 13 Jun 2026 00:00:00 GMT'),
      sleepImpl: async (ms) => { delays.push(ms); },
      fetchImpl: async () => {
        calls += 1;
        return calls === 1
          ? createResponse(503, 'Sat, 13 Jun 2026 00:00:03 GMT')
          : createResponse(200);
      }
    });

    assert.deepEqual(delays, [3000]);
  });

  it('does not retry aborted requests', async () => {
    const service = loadService();
    const signal = { aborted: true };

    await assert.rejects(
      () => service.fetchWithRetry('https://example.test', { signal }, {
        maxAttempts: 3,
        logger: null,
        fetchImpl: async () => createResponse(200)
      }),
      { name: 'AbortError' }
    );
  });
});
