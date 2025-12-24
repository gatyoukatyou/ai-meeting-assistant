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
// 初期化
// =====================================
document.addEventListener('DOMContentLoaded', function() {
  loadSavedSettings();

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

function loadSavedSettings() {
  // APIキーを入力欄に復元
  const providers = ['gemini', 'claude', 'openai', 'groq'];
  providers.forEach(p => {
    const key = SecureStorage.getApiKey(p);
    const model = SecureStorage.getModel(p);
    if (key) document.getElementById(`${p}ApiKey`).value = key;
    if (model) document.getElementById(`${p}Model`).value = model;
  });

  // オプション
  document.getElementById('clearOnClose').checked = SecureStorage.getOption('clearOnClose', false);
  document.getElementById('costAlertEnabled').checked = SecureStorage.getOption('costAlertEnabled', true);
  document.getElementById('costLimit').value = SecureStorage.getOption('costLimit', 100);
  document.getElementById('llmPriority').value = SecureStorage.getOption('llmPriority', 'auto');
}

async function saveSettings() {
  const providers = ['gemini', 'claude', 'openai', 'groq'];

  // APIキーを保存
  providers.forEach(p => {
    const key = document.getElementById(`${p}ApiKey`).value.trim();
    const model = document.getElementById(`${p}Model`).value;
    SecureStorage.setApiKey(p, key);
    SecureStorage.setModel(p, model);
  });

  // オプションを保存
  SecureStorage.setOption('clearOnClose', document.getElementById('clearOnClose').checked);
  SecureStorage.setOption('costAlertEnabled', document.getElementById('costAlertEnabled').checked);
  SecureStorage.setOption('costLimit', parseInt(document.getElementById('costLimit').value) || 100);
  SecureStorage.setOption('llmPriority', document.getElementById('llmPriority').value);

  // 文字起こし用にOpenAI APIが必須
  const openaiKey = SecureStorage.getApiKey('openai');

  if (!openaiKey) {
    showError('文字起こし用にOpenAI APIキーが必須です。設定してください。');
    return;
  }

  // OpenAI APIキーを検証
  const isValid = await validateApiKey('openai', openaiKey);
  if (!isValid) {
    showError('OpenAI APIキーが無効です。正しいキーを入力してください。');
    return;
  }

  // Gemini APIキーが設定されている場合は検証（LLM用途）
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

// APIキーの検証
async function validateApiKey(provider, key) {
  const statusEl = document.getElementById(`${provider}-status`);
  if (!statusEl) return true;

  statusEl.style.display = 'inline-flex';
  statusEl.className = 'validation-status validation-pending';
  statusEl.textContent = '検証中...';

  try {
    let isValid = false;

    if (provider === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      isValid = res.ok;
    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      isValid = res.ok;
    } else if (provider === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      isValid = res.ok;
    } else {
      isValid = true;
    }

    statusEl.className = isValid ? 'validation-status validation-success' : 'validation-status validation-error';
    statusEl.textContent = isValid ? '✓ 有効' : '✗ 無効';
    return isValid;
  } catch (e) {
    statusEl.className = 'validation-status validation-error';
    statusEl.textContent = '✗ エラー';
    return false;
  }
}

// 設定エクスポート
function exportSettings() {
  const password = prompt('エクスポート用パスワードを設定してください（インポート時に必要）:');
  if (!password) return;

  const encrypted = SecureStorage.exportAll(password);
  const blob = new Blob([JSON.stringify({ data: encrypted, v: 1 })], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-meeting-settings-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  showSuccess('設定をエクスポートしました。パスワードは安全に保管してください。');
}

// 設定インポート
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

// 全設定削除
function clearAllSettings() {
  if (confirm('すべての設定（APIキー含む）を削除しますか？この操作は取り消せません。')) {
    SecureStorage.clearAll();
    loadSavedSettings();
    showSuccess('設定を削除しました');
  }
}

function showSuccess(message) {
  const el = document.getElementById('successMessage');
  el.textContent = '✓ ' + message;
  el.style.display = 'block';
  document.getElementById('errorMessage').style.display = 'none';

  // スクロールしてメッセージを表示
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

  // スクロールしてメッセージを表示
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
