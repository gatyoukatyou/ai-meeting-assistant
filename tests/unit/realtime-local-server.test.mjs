import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRealtimeRequestHandler,
  requestClientSecret,
  TokenRateLimiter
} from '../../scripts/realtime-local-server.mjs';

const TEST_STANDARD_KEY = 'test-standard-key-placeholder';

function openAiResponse(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

function mockRequest({
  method = 'POST',
  url = '/api/realtime/client-secret',
  headers = {},
  body = '{}'
} = {}) {
  const callbacks = new Map();
  return {
    method,
    url,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
    on(name, callback) {
      const list = callbacks.get(name) || [];
      list.push(callback);
      callbacks.set(name, list);
      if (name === 'data') queueMicrotask(() => callback(Buffer.from(body)));
      if (name === 'end') queueMicrotask(() => callback());
    },
    destroy() {}
  };
}

function mockResponse() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    }
  };
}

test('fails safely when OPENAI_API_KEY is missing without calling OpenAI', async () => {
  let called = false;
  const result = await requestClientSecret({
    apiKey: '',
    fetchImpl: async () => {
      called = true;
      return openAiResponse(200, { value: 'ek_should-not-be-used' });
    }
  });

  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'missing_api_key');
  assert.equal(called, false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /test-standard-key-placeholder|ek_should-not-be-used/
  );
});

test('returns only the short-lived client secret on success', async () => {
  let request;
  const result = await requestClientSecret({
    apiKey: TEST_STANDARD_KEY,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return openAiResponse(200, { value: 'ek_ephemeral_placeholder' });
    }
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { value: 'ek_ephemeral_placeholder' });
  assert.equal(request.options.headers.Authorization, `Bearer ${TEST_STANDARD_KEY}`);
  const requestBody = JSON.parse(request.options.body);
  assert.equal(requestBody.session.model, 'gpt-realtime-2.1');
  assert.equal(requestBody.session.audio.output.voice, 'marin');
  assert.doesNotMatch(JSON.stringify(result), /test-standard-key-placeholder/);
  assert.doesNotMatch(JSON.stringify(requestBody), /test-standard-key-placeholder/);
});

test('maps authentication, rate limit, server, and network failures to safe categories', async () => {
  const cases = [
    { status: 401, code: 'openai_authentication' },
    { status: 429, code: 'rate_limited' },
    { status: 500, code: 'openai_server_error' }
  ];

  for (const testCase of cases) {
    const result = await requestClientSecret({
      apiKey: TEST_STANDARD_KEY,
      fetchImpl: async () =>
        openAiResponse(testCase.status, {
          error: { message: `remote detail containing ${TEST_STANDARD_KEY}` }
        })
    });
    assert.equal(result.body.error.code, testCase.code);
    assert.doesNotMatch(JSON.stringify(result), /remote detail|test-standard-key-placeholder/);
  }

  const networkResult = await requestClientSecret({
    apiKey: TEST_STANDARD_KEY,
    fetchImpl: async () => {
      throw new Error(`network detail ${TEST_STANDARD_KEY}`);
    }
  });
  assert.equal(networkResult.body.error.code, 'openai_network');
  assert.doesNotMatch(
    JSON.stringify(networkResult),
    /network detail|test-standard-key-placeholder/
  );
});

test('rejects a malformed successful OpenAI response without returning its body', async () => {
  const result = await requestClientSecret({
    apiKey: TEST_STANDARD_KEY,
    fetchImpl: async () =>
      openAiResponse(200, {
        unexpected: `body detail ${TEST_STANDARD_KEY}`
      })
  });

  assert.equal(result.status, 502);
  assert.equal(result.body.error.code, 'openai_invalid_response');
  assert.doesNotMatch(JSON.stringify(result), /body detail|test-standard-key-placeholder/);
});

test('limits repeated client-secret requests within the local window', () => {
  let now = 1000;
  const limiter = new TokenRateLimiter({ maxRequests: 2, windowMs: 60_000, now: () => now });

  assert.equal(limiter.allow('local'), true);
  assert.equal(limiter.allow('local'), true);
  assert.equal(limiter.allow('local'), false);
  assert.equal(limiter.allow('other'), true);
  now += 60_000;
  assert.equal(limiter.allow('local'), true);
});

test('serves the token endpoint only to loopback requests and never echoes the standard key', async () => {
  const handler = createRealtimeRequestHandler({
    port: 8787,
    env: { OPENAI_API_KEY: '' },
    fetchImpl: async () => openAiResponse(200, { value: 'ek_should-not-be-used' })
  });
  const localResponse = mockResponse();
  await handler(
    mockRequest({ headers: { host: '127.0.0.1:8787', origin: 'http://127.0.0.1:8787' } }),
    localResponse
  );
  assert.equal(localResponse.status, 503);
  assert.doesNotMatch(localResponse.body, /test-standard-key-placeholder|ek_should-not-be-used/);

  const remoteResponse = mockResponse();
  await handler(
    mockRequest({ headers: { host: '192.0.2.10:8787', origin: 'http://192.0.2.10:8787' } }),
    remoteResponse
  );
  assert.equal(remoteResponse.status, 403);
  assert.match(remoteResponse.body, /local_only/);
});
