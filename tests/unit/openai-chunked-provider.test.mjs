import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

class FakeFormData {
  constructor() {
    this.entries = [];
  }

  append(name, value, filename) {
    this.entries.push({ name, value, filename });
  }

  has(name) {
    return this.entries.some((entry) => entry.name === name);
  }

  get(name) {
    const entry = this.entries.find((item) => item.name === name);
    return entry ? entry.value : null;
  }
}

function createProviderContext({ storedLanguage = 'ja' } = {}) {
  const requests = [];
  const SecureStorage = {
    getApiKey() {
      return 'test-openai-key';
    },
    getModel() {
      return 'whisper-1';
    },
    getOption(key, fallback = '') {
      if (key === 'sttLanguage') return storedLanguage;
      if (key === 'sttUserDictionary') return '';
      return fallback;
    }
  };
  const DebugLogger = {
    log() {},
    error() {}
  };
  const window = {};
  loadScript('js/stt/providers/openai_chunked.js', {
    window,
    SecureStorage,
    DebugLogger,
    FormData: FakeFormData,
    fetch: async (url, options) => {
      requests.push({ url, options, formData: options.body });
      return {
        ok: true,
        json: async () => ({ text: 'recognized text' })
      };
    }
  });

  return {
    OpenAIChunkedProvider: window.OpenAIChunkedProvider,
    requests
  };
}

async function transcribeWithLanguage(language) {
  const { OpenAIChunkedProvider, requests } = createProviderContext();
  const provider = new OpenAIChunkedProvider({
    apiKey: 'test-openai-key',
    model: 'whisper-1',
    language
  });

  await provider.start();
  await provider.transcribeBlob(new Blob(['audio'], { type: 'audio/webm' }));

  return requests[0].formData;
}

describe('OpenAIChunkedProvider language option', () => {
  it('sends language=ja when configured for Japanese', async () => {
    const formData = await transcribeWithLanguage('ja');

    assert.equal(formData.get('language'), 'ja');
  });

  it('sends language=en when configured for English', async () => {
    const formData = await transcribeWithLanguage('en');

    assert.equal(formData.get('language'), 'en');
  });

  it('omits the language parameter when configured for auto detection', async () => {
    const formData = await transcribeWithLanguage('auto');

    assert.equal(formData.has('language'), false);
  });

  it('uses saved sttLanguage when no language is passed in config', async () => {
    const { OpenAIChunkedProvider, requests } = createProviderContext({ storedLanguage: 'en' });
    const provider = new OpenAIChunkedProvider({
      apiKey: 'test-openai-key',
      model: 'whisper-1'
    });

    await provider.start();
    await provider.transcribeBlob(new Blob(['audio'], { type: 'audio/webm' }));

    assert.equal(requests[0].formData.get('language'), 'en');
  });

  it('does not include Japanese previous tail in prompts for non-Japanese modes', async () => {
    const { OpenAIChunkedProvider, requests } = createProviderContext();
    const provider = new OpenAIChunkedProvider({
      apiKey: 'test-openai-key',
      model: 'whisper-1',
      language: 'en',
      userDictionary: 'project term'
    });

    await provider.start();
    await provider.transcribeBlob(new Blob(['audio'], { type: 'audio/webm' }), '前回の日本語テキスト');

    assert.equal(requests[0].formData.get('prompt'), 'project term');
  });
});
