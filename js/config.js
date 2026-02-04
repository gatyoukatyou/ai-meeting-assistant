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
// 親ウィンドウへのAPIキー同期
// sessionStorageはタブ間で共有されないため、
// 別タブで設定を開いた場合は親ウィンドウに直接保存する
// =====================================
function syncApiKeysToOpener() {
  // 親ウィンドウがない場合は同期不要
  if (!window.opener || window.opener.closed) {
    return;
  }

  try {
    // 親ウィンドウのsessionStorageに直接APIキーを保存
    const providers = ['gemini', 'claude', 'openai_llm', 'groq', 'openai', 'deepgram'];
    providers.forEach(provider => {
      const key = SecureStorage.getApiKey(provider);
      const storageKey = `_ak_${provider}`;
      if (key) {
        window.opener.sessionStorage.setItem(storageKey, key);
      } else {
        window.opener.sessionStorage.removeItem(storageKey);
      }
    });

    // 親ウィンドウに設定変更を通知してUIを更新させる
    window.opener.postMessage({ type: 'settings-updated' }, window.location.origin);
    console.log('[Config] API keys synced to opener window');
  } catch (e) {
    // クロスオリジンエラーなどの場合はログのみ
    console.warn('[Config] Failed to sync API keys to opener:', e);
  }
}

// =====================================
// STTプロバイダー許可リスト
// =====================================
const ALLOWED_STT_PROVIDERS = new Set([
  'openai_stt',
  'deepgram_realtime'
]);

// =====================================
// 初期化
// =====================================
document.addEventListener('DOMContentLoaded', async function() {
  // i18n初期化（言語切り替えに必要）
  await I18n.init();

  // テーマ選択の初期化
  if (window.AIMeetingTheme) {
    window.AIMeetingTheme.bindDisplayThemeSelect(document.getElementById('displayTheme'));
    window.AIMeetingTheme.bindStyleSelect(document.getElementById('uiStyle'));
    window.AIMeetingTheme.bindThemeSelect(document.getElementById('colorTheme'));
  }

  loadSavedSettings();
  setupSTTProviderSelector();
  setupApiKeyButtons(); // 認証チェック・クリアボタンのイベント設定

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

  // 言語変更時の再レンダリング
  window.addEventListener('languagechange', function() {
    // API検証ステータスの再翻訳
    const statusElements = document.querySelectorAll('.validation-status');
    statusElements.forEach(el => {
      // ステータスが表示されている場合、再翻訳が必要
      // ただし現在の状態を保持するため、リロードはしない
    });
  });
});

// =====================================
// 認証チェック・クリアボタンのイベント設定
// =====================================
function setupApiKeyButtons() {
  // 各プロバイダーのボタンにイベントリスナーを追加
  const providers = ['openai', 'deepgram', 'gemini', 'claude', 'openai_llm', 'groq'];
  
  providers.forEach(provider => {
    // 認証チェックボタン
    const validateBtns = document.querySelectorAll(`[data-validate="${provider}"]`);
    validateBtns.forEach(btn => {
      btn.addEventListener('click', () => validateApiKeyManual(provider));
    });
    
    // クリアボタン
    const clearBtns = document.querySelectorAll(`[data-clear="${provider}"]`);
    clearBtns.forEach(btn => {
      btn.addEventListener('click', () => clearApiKey(provider));
    });
  });
}

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

  // llmPriorityの旧値マイグレーション: openai → openai_llm
  let llmPriority = SecureStorage.getOption('llmPriority', 'auto');
  if (llmPriority === 'openai') {
    console.warn('Migrating llmPriority from "openai" to "openai_llm"');
    SecureStorage.setOption('llmPriority', 'openai_llm');
  }

  // LLM用APIキーを入力欄に復元
  const llmProviders = ['gemini', 'claude', 'groq'];
  llmProviders.forEach(p => {
    const key = SecureStorage.getApiKey(p);
    const model = SecureStorage.getModel(p);
    const customModel = SecureStorage.getCustomModel(p);
    const keyEl = document.getElementById(`${p}ApiKey`);
    const modelEl = document.getElementById(`${p}Model`);
    const customModelEl = document.getElementById(`${p}CustomModel`);
    if (keyEl && key) keyEl.value = key;
    if (modelEl && model) modelEl.value = model;
    if (customModelEl && customModel) customModelEl.value = customModel;
  });

  // OpenAI LLM用（STTとは別）
  const openaiLlmKey = SecureStorage.getApiKey('openai_llm');
  const openaiLlmModel = SecureStorage.getModel('openai_llm');
  const openaiLlmCustomModel = SecureStorage.getCustomModel('openai_llm');
  const openaiLlmKeyEl = document.getElementById('openaiLlmApiKey');
  const openaiLlmModelEl = document.getElementById('openaiLlmModel');
  const openaiLlmCustomModelEl = document.getElementById('openaiLlmCustomModel');
  if (openaiLlmKeyEl && openaiLlmKey) openaiLlmKeyEl.value = openaiLlmKey;
  if (openaiLlmModelEl && openaiLlmModel) openaiLlmModelEl.value = openaiLlmModel;
  if (openaiLlmCustomModelEl && openaiLlmCustomModel) openaiLlmCustomModelEl.value = openaiLlmCustomModel;

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

  // ユーザー辞書（STT用固有名詞ヒント）
  const userDictionary = SecureStorage.getOption('sttUserDictionary', '');
  const userDictEl = document.getElementById('sttUserDictionary');
  if (userDictEl) userDictEl.value = userDictionary;

  // オプション
  const persistApiKeysEl = document.getElementById('persistApiKeys');
  if (persistApiKeysEl) {
    persistApiKeysEl.checked = false;
    persistApiKeysEl.disabled = true;
  }
  SecureStorage.setOption('persistApiKeys', false);
  document.getElementById('clearOnClose').checked = SecureStorage.getOption('clearOnClose', false);
  const persistMeetingContextEl = document.getElementById('persistMeetingContext');
  if (persistMeetingContextEl) {
    persistMeetingContextEl.checked = SecureStorage.getOption('persistMeetingContext', false);
  }
  document.getElementById('costAlertEnabled').checked = SecureStorage.getOption('costAlertEnabled', true);
  document.getElementById('costLimit').value = SecureStorage.getOption('costLimit', 100);
  document.getElementById('llmPriority').value = SecureStorage.getOption('llmPriority', 'auto');

  // 強化コンテキストオプション
  const enhancedContextEl = document.getElementById('enhancedContext');
  if (enhancedContextEl) {
    enhancedContextEl.checked = SecureStorage.getOption('enhancedContext', false);
  }
}

function showMigrationNotice() {
  // 旧設定からの移行通知
  setTimeout(() => {
    showSuccess(t('config.messages.migrated'));
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
    const customModelEl = document.getElementById(`${p}CustomModel`);
    if (keyEl) SecureStorage.setApiKey(p, keyEl.value.trim());
    if (modelEl) SecureStorage.setModel(p, modelEl.value);
    if (customModelEl) SecureStorage.setCustomModel(p, customModelEl.value.trim());
  });

  // OpenAI LLM用（STTとは別）
  const openaiLlmKeyEl = document.getElementById('openaiLlmApiKey');
  const openaiLlmModelEl = document.getElementById('openaiLlmModel');
  const openaiLlmCustomModelEl = document.getElementById('openaiLlmCustomModel');
  if (openaiLlmKeyEl) SecureStorage.setApiKey('openai_llm', openaiLlmKeyEl.value.trim());
  if (openaiLlmModelEl) SecureStorage.setModel('openai_llm', openaiLlmModelEl.value);
  if (openaiLlmCustomModelEl) SecureStorage.setCustomModel('openai_llm', openaiLlmCustomModelEl.value.trim());

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

  // ユーザー辞書（STT用固有名詞ヒント）を保存
  const userDictEl = document.getElementById('sttUserDictionary');
  if (userDictEl) SecureStorage.setOption('sttUserDictionary', userDictEl.value.trim());

  // オプションを保存
  SecureStorage.setOption('persistApiKeys', false);
  SecureStorage.setOption('clearOnClose', document.getElementById('clearOnClose').checked);
  const persistMeetingContextEl = document.getElementById('persistMeetingContext');
  if (persistMeetingContextEl) {
    SecureStorage.setOption('persistMeetingContext', persistMeetingContextEl.checked);
  }
  SecureStorage.setOption('costAlertEnabled', document.getElementById('costAlertEnabled').checked);
  SecureStorage.setOption('costLimit', parseInt(document.getElementById('costLimit').value) || 100);
  SecureStorage.setOption('llmPriority', document.getElementById('llmPriority').value);

  // 強化コンテキストオプションを保存
  const enhancedContextEl = document.getElementById('enhancedContext');
  if (enhancedContextEl) {
    SecureStorage.setOption('enhancedContext', enhancedContextEl.checked);
  }

  // 選択されたSTTプロバイダーに応じたバリデーション
  const validationResult = await validateSTTProvider(sttProvider);
  if (!validationResult.valid) {
    showError(validationResult.message);
    return;
  }

  // LLM用APIキーの検証（設定されている場合のみ）
  const geminiKey = SecureStorage.getApiKey('gemini');
  if (geminiKey) {
    const geminiResult = await validateApiKey('gemini', geminiKey);
    if (geminiResult === 'invalid') {
      showError(t('config.messages.invalidApiKey'));
      return;
    }
    // 'valid' または 'unknown' の場合は続行
  }

  // 別タブで開いている場合、親ウィンドウのsessionStorageにもAPIキーを同期
  syncApiKeysToOpener();

  showSuccess(t('config.messages.saved'));

  // 3秒後にメイン画面に戻る（増殖防止対応）
  setTimeout(() => {
    // handleBackToMain はconfig.html側で定義（window.name判定で増殖防止）
    if (typeof handleBackToMain === 'function') {
      handleBackToMain();
    } else {
      // フォールバック：関数が見つからない場合も増殖防止を維持
      const hasOpener = (window.opener && !window.opener.closed);
      const openedAsSettingsTab = (window.name === 'settings') || hasOpener;

      if (openedAsSettingsTab) {
        // 別タブの場合：遷移しない（増殖防止）
        const hint = document.getElementById('closeTabHint');
        if (hint) hint.style.display = 'block';
      } else {
        // 同一タブの場合：通常遷移
        navigateTo('index.html');
      }
    }
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
      const result = await validateApiKey('openai', key);
      if (result === 'invalid') {
        return { valid: false, message: 'OpenAI APIキーが無効です。' };
      }
      // 'valid' または 'unknown' の場合は続行（実使用時に判定）
      return { valid: true };
    }

    case 'deepgram_realtime': {
      const key = SecureStorage.getApiKey('deepgram');
      if (!key) {
        return { valid: false, message: 'Deepgram APIキーが必要です。' };
      }
      const result = await validateApiKey('deepgram', key);
      if (result === 'invalid') {
        return { valid: false, message: '認証に失敗しました。APIキーを確認してください。' };
      }
      // 'valid' または 'unknown' の場合は続行
      return { valid: true };
    }

    default:
      return { valid: false, message: `不明なSTTプロバイダー: ${provider}` };
  }
}

// =====================================
// APIキーの検証
// 戻り値: 'valid' | 'invalid' | 'unknown' の3値
// - valid: 認証成功
// - invalid: 認証失敗（401/403など）
// - unknown: CORS等でブラウザから検証不可
// =====================================
async function validateApiKey(provider, key) {
  const statusIdMap = {
    'openai': 'openai-status',
    'deepgram': 'deepgram-status',
    'gemini': 'gemini-status',
    'claude': 'claude-status',
    'openai_llm': 'openai-llm-status',
    'groq': 'groq-status'
  };

  const statusEl = document.getElementById(statusIdMap[provider]);
  if (statusEl) {
    statusEl.style.display = 'inline-flex';
    statusEl.className = 'validation-status validation-pending';
    statusEl.textContent = t('config.validation.checking');
  }

  // Claude / Anthropic APIはブラウザからCORS制限で検証不可
  if (provider === 'claude') {
    if (statusEl) {
      statusEl.className = 'validation-status validation-pending';
      statusEl.textContent = '⚠ ' + t('config.validation.unknown');
    }
    return 'unknown';
  }

  try {
    let response = null;

    switch (provider) {
      case 'gemini':
        // Try header auth first (more secure), fallback to ?key= if needed
        // Try v1 first (stable), fallback to v1beta
        response = await tryGeminiAuth(key);
        break;

      case 'openai':
      case 'openai_llm':
        response = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        break;

      case 'groq':
        response = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${key}` }
        });
        break;

      case 'deepgram':
        response = await fetch('https://api.deepgram.com/v1/projects', {
          headers: { 'Authorization': `Token ${key}` }
        });
        break;

      default:
        if (statusEl) {
          statusEl.className = 'validation-status validation-pending';
          statusEl.textContent = '⚠ ' + t('config.validation.unknown');
        }
        return 'unknown';
    }

    // Null check (all fetch attempts failed with network errors)
    if (!response) {
      if (statusEl) {
        statusEl.className = 'validation-status validation-pending';
        statusEl.textContent = '⚠ ' + t('config.validation.browserLimit');
      }
      return 'unknown';
    }

    // HTTPステータスで判定
    if (response.ok) {
      if (statusEl) {
        statusEl.className = 'validation-status validation-success';
        statusEl.textContent = '✓ ' + t('config.validation.valid');
      }

      // On successful validation, refresh model list (if ModelRegistry available)
      if (window.ModelRegistry && isLLMProvider(provider)) {
        try {
          await ModelRegistry.getModels(provider, key, { forceRefresh: true });
          console.log('[Config] Model list refreshed for', provider);
        } catch (e) {
          console.warn('[Config] Failed to refresh models for', provider, ':', e.message);
        }
      }

      return 'valid';
    } else if (response.status === 401 || response.status === 403) {
      if (statusEl) {
        statusEl.className = 'validation-status validation-error';
        statusEl.textContent = '✗ ' + t('config.validation.invalid');
      }
      return 'invalid';
    } else {
      // その他のエラー（500等）は未検証扱い
      if (statusEl) {
        statusEl.className = 'validation-status validation-pending';
        statusEl.textContent = `⚠ ${t('config.validation.unknown')} (HTTP ${response.status})`;
      }
      return 'unknown';
    }
  } catch (e) {
    // CORS例外やネットワークエラー
    console.warn(`API key validation error for ${provider}:`, e.message);
    if (statusEl) {
      statusEl.className = 'validation-status validation-pending';
      statusEl.textContent = '⚠ ' + t('config.validation.browserLimit');
    }
    return 'unknown';
  }
}

// =====================================
// 設定エクスポート
// =====================================
function exportSettings() {
  const data = SecureStorage.exportAll();
  const blob = new Blob([JSON.stringify({ data: data, v: 3 })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-meeting-settings-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showSuccess(t('config.messages.exported'));
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
      if (!json || typeof json !== 'object') {
        showError(t('config.messages.importInvalidFormat'));
        return;
      }
      if (json.v === 2) {
        showError(t('config.messages.importOldFormat'));
        return;
      }
      if (json.v !== 3 || !('data' in json) || json.data == null) {
        showError(t('config.messages.importInvalidFormat'));
        return;
      }
      const success = SecureStorage.importAll(json.data);
      if (success) {
        showSuccess(t('config.messages.imported'));
        loadSavedSettings();
      } else {
        showError(t('config.messages.importFailed'));
      }
    } catch (err) {
      showError(t('config.messages.fileFailed'));
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// =====================================
// 全設定削除
// =====================================
function clearAllSettings() {
  if (confirm(t('config.prompts.clearConfirm'))) {
    SecureStorage.clearAll();
    loadSavedSettings();
    showSuccess(t('config.messages.cleared'));
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

// =====================================
// 個別API認証チェック（手動）
// =====================================
async function validateApiKeyManual(provider) {
  // 入力欄のIDマッピング
  const inputIdMap = {
    'openai': 'openaiApiKey',
    'deepgram': 'deepgramApiKey',
    'gemini': 'geminiApiKey',
    'claude': 'claudeApiKey',
    'openai_llm': 'openaiLlmApiKey',
    'groq': 'groqApiKey'
  };

  const inputEl = document.getElementById(inputIdMap[provider]);
  if (!inputEl) {
    showError(`入力欄が見つかりません: ${provider}`);
    return;
  }

  const key = inputEl.value.trim();
  if (!key) {
    showError(t('config.messages.noApiKey'));
    return;
  }

  // 注意: 検証前にキーを保存しない（保存は「保存」ボタンで行う）
  // validateApiKey() 内でステータス窓も更新される
  const result = await validateApiKey(provider, key);
  const providerName = getProviderName(provider);

  switch (result) {
    case 'valid':
      showSuccess(`${providerName}: ${t('config.validation.valid')}`);
      break;
    case 'invalid':
      showError(`${providerName}: ${t('config.validation.invalid')}`);
      break;
    case 'unknown':
      // CORS等で検証不可の場合は警告レベル（エラーではない）
      showSuccess(`${providerName}: ${t('config.validation.browserLimit')}`);
      break;
  }
}

// =====================================
// 個別APIキークリア
// =====================================
function clearApiKey(provider) {
  const inputIdMap = {
    'openai': 'openaiApiKey',
    'deepgram': 'deepgramApiKey',
    'gemini': 'geminiApiKey',
    'claude': 'claudeApiKey',
    'openai_llm': 'openaiLlmApiKey',
    'groq': 'groqApiKey'
  };

  const statusIdMap = {
    'openai': 'openai-status',
    'deepgram': 'deepgram-status',
    'gemini': 'gemini-status',
    'claude': 'claude-status',
    'openai_llm': 'openai-llm-status',
    'groq': 'groq-status'
  };

  const inputEl = document.getElementById(inputIdMap[provider]);
  const statusEl = document.getElementById(statusIdMap[provider]);

  if (inputEl) {
    inputEl.value = '';
  }

  // ストレージからも削除
  SecureStorage.setApiKey(provider, '');

  // ステータス表示をリセット
  if (statusEl) {
    statusEl.style.display = 'none';
    statusEl.className = 'validation-status';
    statusEl.textContent = '';
  }

  showSuccess(`${getProviderName(provider)} のAPIキーをクリアしました`);
}

// =====================================
// LLMプロバイダー判定
// =====================================
function isLLMProvider(provider) {
  return ['gemini', 'claude', 'openai_llm', 'groq'].includes(provider);
}

// =====================================
// プロバイダー表示名取得
// =====================================
function getProviderName(provider) {
  const names = {
    'openai': 'OpenAI (STT)',
    'deepgram': 'Deepgram',
    'gemini': 'Gemini',
    'claude': 'Claude',
    'openai_llm': 'OpenAI (LLM)',
    'groq': 'Groq'
  };
  return names[provider] || provider;
}

// =====================================
// Gemini認証フォールバック
// v1 → v1beta, header → ?key= の順で試行
// =====================================
async function tryGeminiAuth(key) {
  const apiVersions = ['v1', 'v1beta'];
  const authMethods = ['header', 'query'];
  let lastResponse = null;

  for (const version of apiVersions) {
    for (const authMethod of authMethods) {
      try {
        let url = `https://generativelanguage.googleapis.com/${version}/models`;
        const fetchOptions = { method: 'GET' };

        if (authMethod === 'header') {
          fetchOptions.headers = { 'x-goog-api-key': key };
        } else {
          url = `${url}?key=${encodeURIComponent(key)}`;
        }

        const response = await fetch(url, fetchOptions);
        lastResponse = response;
        if (response.ok || response.status === 401 || response.status === 403) {
          // Return on success or definite auth failure
          return response;
        }
        // Continue trying on other errors
      } catch (e) {
        console.warn(`Gemini ${version} ${authMethod} auth failed:`, e.message);
      }
    }
  }

  // Return last response if any, or null if all failed with network errors
  return lastResponse;
}
