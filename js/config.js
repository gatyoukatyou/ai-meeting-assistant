function safeURL(input) {
  try {
    const url = new URL(input, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.href;
    }
  } catch (e) {
    console.warn('Invalid URL rejected:', input);
  }
  return null;
}

function navigateTo(target) {
  const safe = safeURL(target);
  if (safe) {
    window.location.href = safe;
  } else {
    console.warn('Navigation blocked due to unsafe target:', target);
  }
}

// =====================================
// STTプロバイダー許可リスト
// =====================================
const ALLOWED_STT_PROVIDERS = new Set([
  'openai_stt',
  'deepgram_realtime',
  'assemblyai_realtime',
  'gcp_stt_proxy'
]);

// =====================================
// 初期化
// =====================================
document.addEventListener('DOMContentLoaded', function() {
  loadSavedSettings();
  setupSTTProviderSelector();

  const exportBtn = document.getElementById('exportSettingsBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSettings);
  }

  const importFileInput = document.getElementById('importFile');
  const importTrigger = document.getElementById('importSettingsTrigger');
  if (importTrigger && importFileInput) {
    importTrigger.addEventListener('click', () => importFileInput.click());
  }
  if (importFileInput) {
    importFileInput.addEventListener('change', importSettings);
  }

  const clearAllBtn = document.getElementById('clearAllSettingsBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', clearAllSettings);
  }

  const saveBtn = document.getElementById('saveSettingsBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }
});

// =====================================
// STTプロバイダー選択UI
// =====================================
function setupSTTProviderSelector() {
  const selector = document.getElementById('sttProvider');
  if (!selector) return;

  selector.addEventListener('change', function() {
    updateSTTProviderUI(this.value);
  });

  // 初期状態を設定
  updateSTTProviderUI(selector.value);
}

function updateSTTProviderUI(provider) {
  // すべてのプロバイダー設定を非表示
  const allSettings = document.querySelectorAll('.stt-provider-settings');
  allSettings.forEach(el => {
    el.style.display = 'none';
  });

  // 選択されたプロバイダーの設定を表示
  const selectedSettings = document.getElementById(`${provider}_settings`);
  if (selectedSettings) {
    selectedSettings.style.display = 'block';
  }

  // GCPプロキシの場合、バックエンドURLが必要な旨を強調
  const gcpOption = document.getElementById('gcp_stt_option');
  const gcpProxyUrl = document.getElementById('gcpProxyUrl');
  if (gcpOption && gcpProxyUrl) {
    const hasBackendUrl = gcpProxyUrl.value.trim() !== '';
    if (!hasBackendUrl && provider !== 'gcp_stt_proxy') {
      gcpOption.textContent = '☁️ Google Cloud STT（バックエンドURL未設定）';
    } else {
      gcpOption.textContent = '☁️ Google Cloud STT（バックエンド経由）';
    }
  }
}

// =====================================
// 設定の読み込み
// =====================================
function loadSavedSettings() {
  // STTプロバイダーを読み込み（旧設定からの移行も処理）
  let sttProvider = SecureStorage.getOption('sttProvider', 'openai_stt');

  // 旧設定からの移行: gemini/openai -> openai_stt
  if (sttProvider === 'gemini' || sttProvider === 'openai') {
    console.warn(`Migrating old STT provider "${sttProvider}" to "openai_stt"`);
    sttProvider = 'openai_stt';
    SecureStorage.setOption('sttProvider', sttProvider);
    showMigrationNotice();
  }

  // 許可リストにないプロバイダーは強制的にopenai_sttに
  if (!ALLOWED_STT_PROVIDERS.has(sttProvider)) {
    console.warn(`Unknown STT provider "${sttProvider}", falling back to "openai_stt"`);
    sttProvider = 'openai_stt';
  }

  const sttSelector = document.getElementById('sttProvider');
  if (sttSelector) {
    sttSelector.value = sttProvider;
    updateSTTProviderUI(sttProvider);
  }

  // LLM用APIキーを入力欄に復元
  const llmProviders = ['gemini', 'claude', 'groq'];
  llmProviders.forEach(p => {
    const key = SecureStorage.getApiKey(p);
    const model = SecureStorage.getModel(p);
    const keyEl = document.getElementById(`${p}ApiKey`);
    const modelEl = document.getElementById(`${p}Model`);
    if (keyEl && key) keyEl.value = key;
    if (modelEl && model) modelEl.value = model;
  });

  // OpenAI LLM用（STTとは別）
  const openaiLlmKey = SecureStorage.getApiKey('openai_llm');
  const openaiLlmModel = SecureStorage.getModel('openai_llm');
  const openaiLlmKeyEl = document.getElementById('openaiLlmApiKey');
  const openaiLlmModelEl = document.getElementById('openaiLlmModel');
  if (openaiLlmKeyEl && openaiLlmKey) openaiLlmKeyEl.value = openaiLlmKey;
  if (openaiLlmModelEl && openaiLlmModel) openaiLlmModelEl.value = openaiLlmModel;

  // STT用APIキー
  // OpenAI
  const openaiKey = SecureStorage.getApiKey('openai');
  const openaiModel = SecureStorage.getModel('openai');
  if (openaiKey) document.getElementById('openaiApiKey').value = openaiKey;
  if (openaiModel) document.getElementById('openaiModel').value = openaiModel;

  // Deepgram
  const deepgramKey = SecureStorage.getApiKey('deepgram');
  const deepgramModel = SecureStorage.getModel('deepgram');
  const deepgramKeyEl = document.getElementById('deepgramApiKey');
  const deepgramModelEl = document.getElementById('deepgramModel');
  if (deepgramKeyEl && deepgramKey) deepgramKeyEl.value = deepgramKey;
  if (deepgramModelEl && deepgramModel) deepgramModelEl.value = deepgramModel;

  // AssemblyAI
  const assemblyaiKey = SecureStorage.getApiKey('assemblyai');
  const assemblyaiKeyEl = document.getElementById('assemblyaiApiKey');
  if (assemblyaiKeyEl && assemblyaiKey) assemblyaiKeyEl.value = assemblyaiKey;

  // GCP Proxy
  const gcpProxyUrl = SecureStorage.getOption('gcpProxyUrl', '');
  const gcpProxyToken = SecureStorage.getOption('gcpProxyToken', '');
  const gcpUrlEl = document.getElementById('gcpProxyUrl');
  const gcpTokenEl = document.getElementById('gcpProxyToken');
  if (gcpUrlEl) gcpUrlEl.value = gcpProxyUrl;
  if (gcpTokenEl) gcpTokenEl.value = gcpProxyToken;

  // ユーザー辞書（STT用固有名詞ヒント）
  const userDictionary = SecureStorage.getOption('sttUserDictionary', '');
  const userDictEl = document.getElementById('sttUserDictionary');
  if (userDictEl) userDictEl.value = userDictionary;

  // オプション
  document.getElementById('clearOnClose').checked = SecureStorage.getOption('clearOnClose', false);
  document.getElementById('costAlertEnabled').checked = SecureStorage.getOption('costAlertEnabled', true);
  document.getElementById('costLimit').value = SecureStorage.getOption('costLimit', 100);
  document.getElementById('llmPriority').value = SecureStorage.getOption('llmPriority', 'auto');
}

function showMigrationNotice() {
  // 旧設定からの移行通知
  setTimeout(() => {
    showSuccess('旧設定を移行しました。STTプロバイダーがOpenAI Whisperに設定されています。');
  }, 500);
}

// =====================================
// 設定の保存
// =====================================
async function saveSettings() {
  const sttProvider = document.getElementById('sttProvider').value;

  // STTプロバイダーを保存
  SecureStorage.setOption('sttProvider', sttProvider);

  // LLM用APIキーを保存
  const llmProviders = ['gemini', 'claude', 'groq'];
  llmProviders.forEach(p => {
    const keyEl = document.getElementById(`${p}ApiKey`);
    const modelEl = document.getElementById(`${p}Model`);
    if (keyEl) SecureStorage.setApiKey(p, keyEl.value.trim());
    if (modelEl) SecureStorage.setModel(p, modelEl.value);
  });

  // OpenAI LLM用（STTとは別）
  const openaiLlmKeyEl = document.getElementById('openaiLlmApiKey');
  const openaiLlmModelEl = document.getElementById('openaiLlmModel');
  if (openaiLlmKeyEl) SecureStorage.setApiKey('openai_llm', openaiLlmKeyEl.value.trim());
  if (openaiLlmModelEl) SecureStorage.setModel('openai_llm', openaiLlmModelEl.value);

  // STT用APIキーを保存
  // OpenAI
  const openaiKey = document.getElementById('openaiApiKey').value.trim();
  const openaiModel = document.getElementById('openaiModel').value;
  SecureStorage.setApiKey('openai', openaiKey);
  SecureStorage.setModel('openai', openaiModel);

  // Deepgram
  const deepgramKeyEl = document.getElementById('deepgramApiKey');
  const deepgramModelEl = document.getElementById('deepgramModel');
  if (deepgramKeyEl) SecureStorage.setApiKey('deepgram', deepgramKeyEl.value.trim());
  if (deepgramModelEl) SecureStorage.setModel('deepgram', deepgramModelEl.value);

  // AssemblyAI
  const assemblyaiKeyEl = document.getElementById('assemblyaiApiKey');
  if (assemblyaiKeyEl) SecureStorage.setApiKey('assemblyai', assemblyaiKeyEl.value.trim());

  // GCP Proxy
  const gcpUrlEl = document.getElementById('gcpProxyUrl');
  const gcpTokenEl = document.getElementById('gcpProxyToken');
  if (gcpUrlEl) SecureStorage.setOption('gcpProxyUrl', gcpUrlEl.value.trim());
  if (gcpTokenEl) SecureStorage.setOption('gcpProxyToken', gcpTokenEl.value.trim());

  // ユーザー辞書（STT用固有名詞ヒント）を保存
  const userDictEl = document.getElementById('sttUserDictionary');
  if (userDictEl) SecureStorage.setOption('sttUserDictionary', userDictEl.value.trim());

  // オプションを保存
  SecureStorage.setOption('clearOnClose', document.getElementById('clearOnClose').checked);
  SecureStorage.setOption('costAlertEnabled', document.getElementById('costAlertEnabled').checked);
  SecureStorage.setOption('costLimit', parseInt(document.getElementById('costLimit').value) || 100);
  SecureStorage.setOption('llmPriority', document.getElementById('llmPriority').value);

  // 選択されたSTTプロバイダーに応じたバリデーション
  const validationResult = await validateSTTProvider(sttProvider);
  if (!validationResult.valid) {
    showError(validationResult.message);
    return;
  }

  // LLM用APIキーの検証（設定されている場合のみ）
  const geminiKey = SecureStorage.getApiKey('gemini');
  if (geminiKey) {
    const isGeminiValid = await validateApiKey('gemini', geminiKey);
    if (!isGeminiValid) {
      showError('Gemini APIキーが無効です。正しいキーを入力してください。');
      return;
    }
  }

  showSuccess('設定を保存しました。メイン画面に戻って利用を開始できます。');

  // 3秒後にメイン画面に自動遷移
  setTimeout(() => {
    navigateTo('index.html');
  }, 3000);
}

// =====================================
// STTプロバイダーの検証
// =====================================
async function validateSTTProvider(provider) {
  switch (provider) {
    case 'openai_stt': {
      const key = SecureStorage.getApiKey('openai');
      if (!key) {
        return { valid: false, message: 'OpenAI APIキーが必要です。' };
      }
      const isValid = await validateApiKey('openai', key);
      if (!isValid) {
        return { valid: false, message: 'OpenAI APIキーが無効です。' };
      }
      return { valid: true };
    }

    case 'deepgram_realtime': {
      const key = SecureStorage.getApiKey('deepgram');
      if (!key) {
        return { valid: false, message: 'Deepgram APIキーが必要です。' };
      }
      // Deepgramのキー検証（簡易）
      const isValid = await validateApiKey('deepgram', key);
      if (!isValid) {
        return { valid: false, message: 'Deepgram APIキーが無効です。' };
      }
      return { valid: true };
    }

    case 'assemblyai_realtime': {
      const key = SecureStorage.getApiKey('assemblyai');
      if (!key) {
        return { valid: false, message: 'AssemblyAI APIキーが必要です。' };
      }
      // AssemblyAIのキー検証（簡易）
      const isValid = await validateApiKey('assemblyai', key);
      if (!isValid) {
        return { valid: false, message: 'AssemblyAI APIキーが無効です。' };
      }
      return { valid: true };
    }

    case 'gcp_stt_proxy': {
      const url = SecureStorage.getOption('gcpProxyUrl', '');
      if (!url) {
        return { valid: false, message: 'GCP STTにはバックエンドURLが必要です。' };
      }
      // URLの形式チェック
      try {
        const parsed = new URL(url);
        if (!parsed.protocol.startsWith('ws')) {
          return { valid: false, message: 'バックエンドURLはwss://またはws://で始まる必要があります。' };
        }
      } catch (e) {
        return { valid: false, message: 'バックエンドURLの形式が正しくありません。' };
      }
      return { valid: true };
    }

    default:
      return { valid: false, message: `不明なSTTプロバイダー: ${provider}` };
  }
}

// =====================================
// APIキーの検証
// =====================================
async function validateApiKey(provider, key) {
  const statusEl = document.getElementById(`${provider}-status`);
  if (statusEl) {
    statusEl.style.display = 'inline-flex';
    statusEl.className = 'validation-status validation-pending';
    statusEl.textContent = '検証中...';
  }

  try {
    let isValid = false;

    switch (provider) {
      case 'gemini':
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        isValid = geminiRes.ok;
        break;

      case 'openai':
      case 'openai_llm':
        const openaiRes = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        isValid = openaiRes.ok;
        break;

      case 'groq':
        const groqRes = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        isValid = groqRes.ok;
        break;

      case 'deepgram':
        // Deepgram APIキー検証（プロジェクト取得）
        const deepgramRes = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { 'Authorization': `Token ${key}` }
        });
        isValid = deepgramRes.ok;
        break;

      case 'assemblyai':
        // AssemblyAI APIキー検証（アカウント情報取得）
        const assemblyaiRes = await fetch('https://api.assemblyai.com/v2/transcript', {
          method: 'GET',
          headers: { 'Authorization': key }
        });
        // 認証成功なら200系、認証失敗なら401
        isValid = assemblyaiRes.status !== 401;
        break;

      default:
        isValid = true;
    }

    if (statusEl) {
      statusEl.className = isValid ? 'validation-status validation-success' : 'validation-status validation-error';
      statusEl.textContent = isValid ? '✓ 有効' : '✗ 無効';
    }
    return isValid;
  } catch (e) {
    console.error(`API key validation error for ${provider}:`, e);
    if (statusEl) {
      statusEl.className = 'validation-status validation-error';
      statusEl.textContent = '✗ エラー';
    }
    return false;
  }
}

// =====================================
// 設定エクスポート
// =====================================
function exportSettings() {
  const password = prompt('エクスポート用パスワードを設定してください（インポート時に必要）:');
  if (!password) return;

  const encrypted = SecureStorage.exportAll(password);
  const blob = new Blob([JSON.stringify({ data: encrypted, v: 2 })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-meeting-settings-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showSuccess('設定をエクスポートしました。パスワードは安全に保管してください。');
}

// =====================================
// 設定インポート
// =====================================
function importSettings(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const json = JSON.parse(e.target.result);
      const password = prompt('インポート用パスワードを入力してください:');
      if (!password) return;

      const success = SecureStorage.importAll(json.data, password);
      if (success) {
        showSuccess('設定をインポートしました');
        loadSavedSettings();
      } else {
        showError('インポートに失敗しました。パスワードが正しいか確認してください。');
      }
    } catch (err) {
      showError('ファイルの読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// =====================================
// 全設定削除
// =====================================
function clearAllSettings() {
  if (confirm('すべての設定（APIキー含む）を削除しますか？この操作は取り消せません。')) {
    SecureStorage.clearAll();
    loadSavedSettings();
    showSuccess('設定を削除しました');
  }
}

// =====================================
// メッセージ表示
// =====================================
function showSuccess(message) {
  const el = document.getElementById('successMessage');
  el.textContent = '✓ ' + message;
  el.style.display = 'block';
  document.getElementById('errorMessage').style.display = 'none';

  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    el.style.display = 'none';
  }, 5000);
}

function showError(message) {
  const el = document.getElementById('errorMessage');
  el.textContent = '✗ ' + message;
  el.style.display = 'block';
  document.getElementById('successMessage').style.display = 'none';

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
