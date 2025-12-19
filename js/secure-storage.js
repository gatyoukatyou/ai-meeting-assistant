// =====================================
// セキュリティ：暗号化・復号化モジュール
// =====================================
const SecureStorage = {
  // デバイス固有のキーを生成（ブラウザフィンガープリント的なもの）
  _getDeviceKey: function() {
    let deviceKey = localStorage.getItem('_dk');
    if (!deviceKey) {
      // ランダムなデバイスキーを生成
      deviceKey = this._generateRandomKey();
      localStorage.setItem('_dk', deviceKey);
    }
    return deviceKey;
  },

  _generateRandomKey: function() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  },

  // 簡易暗号化（XOR + Base64）
  _encrypt: function(text) {
    if (!text) return '';
    const key = this._getDeviceKey();
    let result = '';
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(
        text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
      );
    }
    return btoa(unescape(encodeURIComponent(result)));
  },

  _decrypt: function(encoded) {
    if (!encoded) return '';
    try {
      const key = this._getDeviceKey();
      const text = decodeURIComponent(escape(atob(encoded)));
      let result = '';
      for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(
          text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
        );
      }
      return result;
    } catch (e) {
      console.error('Decryption failed:', e);
      return '';
    }
  },

  // APIキーを保存
  setApiKey: function(provider, key) {
    if (!key) {
      localStorage.removeItem(`_ak_${provider}`);
      return;
    }
    localStorage.setItem(`_ak_${provider}`, this._encrypt(key));
  },

  // APIキーを取得
  getApiKey: function(provider) {
    const encrypted = localStorage.getItem(`_ak_${provider}`);
    return this._decrypt(encrypted);
  },

  // モデルを保存（暗号化不要）
  setModel: function(provider, model) {
    localStorage.setItem(`_m_${provider}`, model);
  },

  getModel: function(provider) {
    return localStorage.getItem(`_m_${provider}`);
  },

  // オプションを保存
  setOption: function(key, value) {
    localStorage.setItem(`_opt_${key}`, JSON.stringify(value));
  },

  getOption: function(key, defaultValue) {
    const val = localStorage.getItem(`_opt_${key}`);
    return val ? JSON.parse(val) : defaultValue;
  },

  // 全設定をエクスポート（別のデバイス用に再暗号化）
  exportAll: function(exportPassword) {
    const data = {
      gemini: { key: this.getApiKey('gemini'), model: this.getModel('gemini') },
      claude: { key: this.getApiKey('claude'), model: this.getModel('claude') },
      openai: { key: this.getApiKey('openai'), model: this.getModel('openai') },
      groq: { key: this.getApiKey('groq'), model: this.getModel('groq') },
      options: {
        clearOnClose: this.getOption('clearOnClose', false),
        costAlertEnabled: this.getOption('costAlertEnabled', true),
        costLimit: this.getOption('costLimit', 100),
        llmPriority: this.getOption('llmPriority', 'auto')
      },
      exportedAt: new Date().toISOString()
    };

    // エクスポート用のパスワードで暗号化
    const json = JSON.stringify(data);
    let encrypted = '';
    for (let i = 0; i < json.length; i++) {
      encrypted += String.fromCharCode(
        json.charCodeAt(i) ^ exportPassword.charCodeAt(i % exportPassword.length)
      );
    }
    return btoa(unescape(encodeURIComponent(encrypted)));
  },

  // インポート
  importAll: function(encryptedData, importPassword) {
    try {
      const decoded = decodeURIComponent(escape(atob(encryptedData)));
      let json = '';
      for (let i = 0; i < decoded.length; i++) {
        json += String.fromCharCode(
          decoded.charCodeAt(i) ^ importPassword.charCodeAt(i % importPassword.length)
        );
      }
      const data = JSON.parse(json);

      if (data.gemini?.key) this.setApiKey('gemini', data.gemini.key);
      if (data.gemini?.model) this.setModel('gemini', data.gemini.model);
      if (data.claude?.key) this.setApiKey('claude', data.claude.key);
      if (data.claude?.model) this.setModel('claude', data.claude.model);
      if (data.openai?.key) this.setApiKey('openai', data.openai.key);
      if (data.openai?.model) this.setModel('openai', data.openai.model);
      if (data.groq?.key) this.setApiKey('groq', data.groq.key);
      if (data.groq?.model) this.setModel('groq', data.groq.model);
      if (data.options) {
        this.setOption('clearOnClose', data.options.clearOnClose || false);
        this.setOption('costAlertEnabled', data.options.costAlertEnabled !== undefined ? data.options.costAlertEnabled : true);
        this.setOption('costLimit', data.options.costLimit || 100);
        this.setOption('llmPriority', data.options.llmPriority || 'auto');
      }

      return true;
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  },

  // 全削除
  clearAll: function() {
    ['gemini', 'claude', 'openai', 'groq'].forEach(p => {
      localStorage.removeItem(`_ak_${p}`);
      localStorage.removeItem(`_m_${p}`);
    });
    localStorage.removeItem('_opt_clearOnClose');
    localStorage.removeItem('_opt_costAlertEnabled');
    localStorage.removeItem('_opt_costLimit');
    localStorage.removeItem('_opt_llmPriority');
  },

  // APIキーのみ削除（デバイスキーは残す）
  clearApiKeys: function() {
    ['gemini', 'claude', 'openai', 'groq'].forEach(p => {
      localStorage.removeItem(`_ak_${p}`);
    });
  }
};
