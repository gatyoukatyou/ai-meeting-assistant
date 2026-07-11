// =====================================
// ストレージ管理モジュール
// 注意：APIキーはWeb Storage（既定はsessionStorage、記憶ON時はlocalStorage）に
// 平文で保存されます。本モジュールは保存先の切り替え等を管理するもので、
// 暗号化は行いません。脅威モデルの詳細は docs/SECURITY.md を参照してください。
// =====================================
const SecureStorage = {
  // API key storage providers list
  _providers:
    (typeof ProviderCatalog !== 'undefined' && typeof ProviderCatalog.getApiKeyProviderIds === 'function')
      ? ProviderCatalog.getApiKeyProviderIds()
      : ['gemini', 'claude', 'openai_llm', 'groq', 'openai', 'deepgram'],

  // Web Storageのwrite系呼び出しはQuotaExceededError等で例外を投げることがある
  // （Safariプライベートモード、ストレージ容量超過など）。失敗してもアプリの
  // 動作を継続させるため、ここで捕捉して呼び出し元へは伝播させない。
  // 値（APIキー等）が漏れないよう、失敗ログにはキー名のみを出力する。
  _safeSetItem: function(storage, key, value) {
    try {
      storage.setItem(key, value);
      return true;
    } catch (e) {
      console.warn(`[SecureStorage] Failed to persist "${key}" (storage full or unavailable)`);
      return false;
    }
  },

  isPersistentApiKeysSupported: function() {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    if (typeof window.matchMedia !== 'function') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: window-controls-overlay)').matches
    );
  },

  isPersistApiKeysEnabled: function() {
    return this.isPersistentApiKeysSupported() && this.getOption('persistApiKeys', false) === true;
  },

  setPersistApiKeys: function(enabled) {
    // Keep persisted preference independent from UA-derived capability checks.
    // Effective usage is gated by isPersistApiKeysEnabled().
    this.setOption('persistApiKeys', Boolean(enabled));
  },

  _getApiKeyStorages: function() {
    const usePersistent = this.isPersistApiKeysEnabled();
    return {
      primary: usePersistent ? localStorage : sessionStorage,
      secondary: usePersistent ? sessionStorage : localStorage
    };
  },

  // APIキーを保存
  setApiKey: function(provider, key) {
    const storageKey = `_ak_${provider}`;
    const storages = this._getApiKeyStorages();
    if (!key) {
      storages.primary.removeItem(storageKey);
      storages.secondary.removeItem(storageKey);
      return;
    }
    if (this._safeSetItem(storages.primary, storageKey, key)) {
      // Keep a single source of truth only after the new value is persisted.
      storages.secondary.removeItem(storageKey);
    }
  },

  // APIキーを取得
  getApiKey: function(provider) {
    const storages = this._getApiKeyStorages();
    return storages.primary.getItem(`_ak_${provider}`) || '';
  },

  // モデルを保存（暗号化不要）
  setModel: function(provider, model) {
    this._safeSetItem(localStorage, `_m_${provider}`, model);
  },

  getModel: function(provider) {
    return localStorage.getItem(`_m_${provider}`);
  },

  // カスタムモデルを保存（ユーザー入力の任意モデル名）
  setCustomModel: function(provider, model) {
    if (!model || model.trim() === '') {
      localStorage.removeItem(`_mc_${provider}`);
      return;
    }
    this._safeSetItem(localStorage, `_mc_${provider}`, model.trim());
  },

  getCustomModel: function(provider) {
    return localStorage.getItem(`_mc_${provider}`) || '';
  },

  // 実効モデルを取得（カスタム > プリセット > デフォルト）
  getEffectiveModel: function(provider, defaultModel) {
    var custom = this.getCustomModel(provider);
    if (custom) return custom;
    var preset = this.getModel(provider);
    if (preset) return preset;
    return defaultModel || '';
  },

  // オプションを保存
  setOption: function(key, value) {
    this._safeSetItem(localStorage, `_opt_${key}`, JSON.stringify(value));
  },

  getOption: function(key, defaultValue) {
    const val = localStorage.getItem(`_opt_${key}`);
    if (!val) return defaultValue;
    try {
      return JSON.parse(val);
    } catch (e) {
      console.warn(`[SecureStorage] Invalid JSON for option "${key}", using default`);
      return defaultValue;
    }
  },

  // 全設定をエクスポート（APIキーは含めない）
  exportAll: function() {
    const data = {
      // LLM用設定（APIキーは含めない）
      gemini: { model: this.getModel('gemini'), customModel: this.getCustomModel('gemini') },
      claude: { model: this.getModel('claude'), customModel: this.getCustomModel('claude') },
      openai_llm: { model: this.getModel('openai_llm'), customModel: this.getCustomModel('openai_llm') },
      groq: { model: this.getModel('groq'), customModel: this.getCustomModel('groq') },
      // STT用設定（APIキーは含めない）
      openai: { model: this.getModel('openai') },
      deepgram: { model: this.getModel('deepgram') },
      options: {
        clearOnClose: this.getOption('clearOnClose', false),
        persistApiKeys: this.getOption('persistApiKeys', false),
        costAlertEnabled: this.getOption('costAlertEnabled', true),
        costLimit: this.getOption('costLimit', 100),
        maxRecordingMinutes: this.getOption('maxRecordingMinutes', 120),
        llmPriority: this.getOption('llmPriority', 'auto'),
        sttProvider: this.getOption('sttProvider', 'openai_stt'),
        sttUserDictionary: this.getOption('sttUserDictionary', ''),
        sttLanguage: this.getOption('sttLanguage', 'ja'),
        persistMeetingContext: this.getOption('persistMeetingContext', false)
      },
      exportedAt: new Date().toISOString()
    };
    return data;
  },

  // インポート
  importAll: function(rawData) {
    try {
      const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      if (!data || typeof data !== 'object') return false;

      const keyProviders = [];
      if (data.gemini && data.gemini.key) keyProviders.push('gemini');
      if (data.claude && data.claude.key) keyProviders.push('claude');
      if (data.openai_llm && data.openai_llm.key) keyProviders.push('openai_llm');
      if (data.groq && data.groq.key) keyProviders.push('groq');
      if (data.openai && data.openai.key) keyProviders.push('openai');
      if (data.deepgram && data.deepgram.key) keyProviders.push('deepgram');
      if (keyProviders.length) {
        console.warn('[Import] API keys are ignored (session-only):', keyProviders.join(', '));
      }

      // LLM用設定
      if (data.gemini && data.gemini.model) this.setModel('gemini', data.gemini.model);
      if (data.gemini && data.gemini.customModel) this.setCustomModel('gemini', data.gemini.customModel);
      if (data.claude && data.claude.model) this.setModel('claude', data.claude.model);
      if (data.claude && data.claude.customModel) this.setCustomModel('claude', data.claude.customModel);
      if (data.openai_llm && data.openai_llm.model) this.setModel('openai_llm', data.openai_llm.model);
      if (data.openai_llm && data.openai_llm.customModel) this.setCustomModel('openai_llm', data.openai_llm.customModel);
      if (data.groq && data.groq.model) this.setModel('groq', data.groq.model);
      if (data.groq && data.groq.customModel) this.setCustomModel('groq', data.groq.customModel);
      // STT用設定
      if (data.openai && data.openai.model) this.setModel('openai', data.openai.model);
      if (data.deepgram && data.deepgram.model) this.setModel('deepgram', data.deepgram.model);
      if (data.options) {
        this.setOption('clearOnClose', data.options.clearOnClose || false);
        this.setOption('costAlertEnabled', data.options.costAlertEnabled !== undefined ? data.options.costAlertEnabled : true);
        this.setOption('costLimit', data.options.costLimit || 100);
        // 0 = 無制限を許容するため || ではなく明示的に検証する
        var maxRecordingMinutes = Number(data.options.maxRecordingMinutes);
        if (Number.isFinite(maxRecordingMinutes) && maxRecordingMinutes >= 0) {
          this.setOption('maxRecordingMinutes', Math.floor(maxRecordingMinutes));
        }
        // llmPriority旧値マイグレーション: openai → openai_llm
        var llmPriority = data.options.llmPriority || 'auto';
        if (llmPriority === 'openai') llmPriority = 'openai_llm';
        this.setOption('llmPriority', llmPriority);
        if (data.options.sttProvider) this.setOption('sttProvider', data.options.sttProvider);
        if (data.options.sttUserDictionary) this.setOption('sttUserDictionary', data.options.sttUserDictionary);
        if (data.options.sttLanguage) this.setOption('sttLanguage', data.options.sttLanguage);
        this.setOption('persistMeetingContext', data.options.persistMeetingContext || false);
        this.setPersistApiKeys(data.options.persistApiKeys === true);
      }

      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },

  // 全削除
  clearAll: function() {
    // Clear keys from both storages
    this._providers.forEach(p => {
      localStorage.removeItem(`_ak_${p}`);
      sessionStorage.removeItem(`_ak_${p}`);
      localStorage.removeItem(`_m_${p}`);
      localStorage.removeItem(`_mc_${p}`);
    });
    localStorage.removeItem('_opt_clearOnClose');
    localStorage.removeItem('_opt_persistApiKeys');
    localStorage.removeItem('_opt_costAlertEnabled');
    localStorage.removeItem('_opt_costLimit');
    localStorage.removeItem('_opt_maxRecordingMinutes');
    localStorage.removeItem('_opt_llmPriority');
    localStorage.removeItem('_opt_sttProvider');
    localStorage.removeItem('_opt_sttUserDictionary');
    localStorage.removeItem('_opt_sttLanguage');
    localStorage.removeItem('_opt_persistMeetingContext');
  },

  // APIキーのみ削除 - clears from BOTH storages
  clearApiKeys: function() {
    this._providers.forEach(p => {
      localStorage.removeItem(`_ak_${p}`);
      sessionStorage.removeItem(`_ak_${p}`);
    });
  }
};

// 他モジュールと同じ公開イディオム（例: js/services/llm-client.js）
window.SecureStorage = SecureStorage;
