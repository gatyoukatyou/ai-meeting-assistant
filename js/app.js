// =====================================
// グローバル変数
// =====================================
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let transcriptIntervalId = null;
let fullTranscript = '';

// トリム機能（Issue #5対応）
let transcriptChunks = []; // { id, timestamp, text, excluded, isMarkerStart }
let chunkIdCounter = 0;
let meetingStartMarkerId = null; // 会議開始マーカーのチャンクID

// 停止時のレース防止用
let isStopping = false;
let finalStopPromise = null;
let finalStopResolve = null;

// Phase 5: 会議中モード用
let isMeetingMode = false;
let recordingStartTime = null;
let meetingModeTimerId = null;

// Q&A送信ガード（Issue #2, #3対応）
let isSubmittingQA = false;
let lastQAQuestion = '';
let lastQAQuestionTime = 0;
const QA_DUPLICATE_THRESHOLD_MS = 5000; // 5秒以内の同一質問は重複とみなす
const QA_TIMEOUT_MS = 30000; // 30秒タイムアウト

// Q&Aリクエストログ（Issue #3対応）
let qaEventLog = [];

function generateQARequestId() {
  return `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function logQA(requestId, event, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[Q&A] ${event}: ${requestId}`, details);
  qaEventLog.push({ timestamp, requestId, event, ...details });
}

function isDuplicateQuestion(question) {
  const now = Date.now();
  if (question === lastQAQuestion && now - lastQAQuestionTime < QA_DUPLICATE_THRESHOLD_MS) {
    return true;
  }
  lastQAQuestion = question;
  lastQAQuestionTime = now;
  return false;
}

function createFinalStopPromise() {
  finalStopPromise = new Promise(resolve => { finalStopResolve = resolve; });
}

// =====================================
// STT専用プロバイダー/モデル許可リスト
// =====================================
// chunked系: HTTP経由でBlobを送信（擬似リアルタイム）
// streaming系: WebSocket経由でPCMストリーム送信（真のリアルタイム）
const ALLOWED_STT_PROVIDERS = new Set([
  'openai_stt',       // chunked (HTTP)
  'deepgram_realtime', // streaming (WebSocket)
  'assemblyai_realtime' // streaming (WebSocket)
]);

// chunked系プロバイダー
const CHUNKED_PROVIDERS = new Set(['openai_stt']);

// streaming系プロバイダー
const STREAMING_PROVIDERS = new Set([
  'deepgram_realtime',
  'assemblyai_realtime'
]);

// OpenAI STT用モデル
const ALLOWED_STT_MODELS = new Set([
  'whisper-1',
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
]);

// STTプロバイダーインスタンス
let currentSTTProvider = null;
let pcmStreamProcessor = null;

// コスト管理（詳細版）
let costs = {
  transcript: {
    total: 0,
    duration: 0,      // 処理した音声の秒数
    calls: 0,         // API呼び出し回数
    byProvider: {
      openai: 0,      // OpenAI Whisper (chunked)
      deepgram: 0,    // Deepgram Realtime (WebSocket)
      assemblyai: 0   // AssemblyAI Realtime (WebSocket)
    }
  },
  llm: {
    total: 0,
    inputTokens: 0,
    outputTokens: 0,
    calls: 0,
    byProvider: {
      gemini: 0,
      claude: 0,
      openai: 0,
      groq: 0
    }
  }
};

// 料金レート（2024年12月時点、1ドル=150円換算）
const PRICING = {
  // 文字起こしAPI（STT専用）
  transcription: {
    openai: {
      // Whisper - $0.006/minute
      perMinute: 0.006 * 150  // ¥0.9/分
    },
    deepgram: {
      // Deepgram Nova-3 - $0.0043/minute (pay-as-you-go)
      perMinute: 0.0043 * 150  // ~¥0.65/分
    },
    assemblyai: {
      // AssemblyAI - $0.00025/second = $0.015/minute
      perMinute: 0.015 * 150  // ~¥2.25/分 (Best tier)
      // Note: Nano tier is $0.00012/sec = $0.0072/min = ~¥1.08/分
    }
  },
  // LLM料金（$/1M tokens）
  gemini: {
    'gemini-2.0-flash-exp': { input: 0.075, output: 0.3 },
    'gemini-1.5-pro': { input: 1.25, output: 5.0 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 }
  },
  claude: {
    'claude-sonnet-4-20250514': { input: 3, output: 15 },
    'claude-3-5-sonnet-20241022': { input: 3, output: 15 }
  },
  openai: {
    'gpt-4o': { input: 2.5, output: 10 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 }
  },
  groq: {
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 }
  },
  yenPerDollar: 150
};

// AI回答の履歴
let aiResponses = {
  summary: [],  // { timestamp: '19:05', content: '...' }
  opinion: [],  // { timestamp: '19:06', content: '...' }
  idea: [],     // { timestamp: '19:07', content: '...' }
  minutes: '',  // 議事録（録音停止後に生成、単一）
  custom: []    // Q&A形式で蓄積 { q: '...', a: '...' }
};

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
// デバッグHUD（?debug パラメータ時のみ表示）
// =====================================
function initDebugHUD() {
  var urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('debug')) return;

  var hud = document.createElement('div');
  hud.id = 'debugHUD';
  hud.style.cssText = 'position:fixed;bottom:10px;left:10px;background:rgba(0,0,0,0.85);color:#0f0;' +
    'font-family:monospace;font-size:11px;padding:8px 12px;border-radius:6px;z-index:9999;' +
    'max-width:320px;max-height:250px;overflow-y:auto;pointer-events:none;';
  document.body.appendChild(hud);

  // 最後のタップ情報を保持
  var lastTapInfo = 'None';
  var tapCount = 0;

  // イベント検出（capture phaseで全イベントを捕捉）
  document.addEventListener('pointerdown', function(e) {
    tapCount++;
    var targetId = e.target.id || '(no id)';
    var targetClass = e.target.className || '(no class)';
    lastTapInfo = e.target.tagName + ' #' + targetId + ' .' + (typeof targetClass === 'string' ? targetClass.split(' ')[0] : '');
    console.log('[Debug] pointerdown:', lastTapInfo);
  }, true);

  document.addEventListener('touchstart', function(e) {
    console.log('[Debug] touchstart:', e.target.tagName, e.target.id);
  }, true);

  document.addEventListener('click', function(e) {
    console.log('[Debug] click:', e.target.tagName, e.target.id);
  }, true);

  function updateDebugInfo() {
    var info = [];
    info.push('=== Debug HUD ===');
    info.push('Recording: ' + (isRecording ? 'YES' : 'NO'));
    info.push('STT: ' + (currentSTTProvider ? 'active' : 'none'));
    info.push('Queue: ' + transcriptionQueue.length);
    info.push('Chunks: ' + transcriptChunks.length);
    info.push('Stream: ' + (currentAudioStream ? 'active' : 'null'));
    info.push('---');
    info.push('Taps: ' + tapCount);
    info.push('Last: ' + lastTapInfo);
    info.push('---');
    // ボタン位置でelementFromPointを実行
    var btn = document.getElementById('recordBtn');
    if (btn) {
      var rect = btn.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;
      var topEl = document.elementFromPoint(centerX, centerY);
      if (topEl) {
        var coveredBy = topEl.tagName + '#' + (topEl.id || '') + '.' + (topEl.className ? topEl.className.split(' ')[0] : '');
        info.push('BtnTop: ' + coveredBy);
        if (topEl !== btn && !btn.contains(topEl)) {
          info.push('⚠️ BLOCKED!');
        }
      }
    }
    hud.textContent = info.join('\n');
  }

  // 500ms毎に更新
  setInterval(updateDebugInfo, 500);
  updateDebugInfo();
  console.log('[Debug] Debug HUD enabled with event tracking');
}

// =====================================
// ブラウザ互換性チェック
// =====================================
function checkBrowserCompatibility() {
  var recordBtn = document.getElementById('recordBtn');
  var issues = [];

  // getUserMedia チェック
  var hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!hasGetUserMedia) {
    issues.push('マイクアクセス（getUserMedia）');
  }

  // MediaRecorder チェック
  var hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  if (!hasMediaRecorder) {
    issues.push('音声録音（MediaRecorder）');
  }

  // 問題があればUIに表示
  if (issues.length > 0 && recordBtn) {
    recordBtn.disabled = true;
    recordBtn.textContent = '⚠️ 非対応ブラウザ';
    recordBtn.title = '以下の機能が使用できません: ' + issues.join(', ');
    recordBtn.style.cursor = 'not-allowed';
    console.warn('[Compatibility] Browser does not support:', issues);

    // 警告バナーを表示
    var banner = document.createElement('div');
    banner.className = 'compatibility-warning';
    banner.innerHTML = '⚠️ お使いのブラウザは一部機能に対応していません。Chrome/Edge/Safari最新版をご利用ください。';
    var header = document.querySelector('.header');
    if (header && header.parentNode) {
      header.parentNode.insertBefore(banner, header.nextSibling);
    }
  } else {
    console.log('[Compatibility] Browser is compatible');
  }
}

// =====================================
// 初期化
// =====================================
document.addEventListener('DOMContentLoaded', function() {
  try {
  // JS読み込み確認（デバッグ用）
  console.log('[Init] DOMContentLoaded fired, JS loaded successfully');

  // セキュリティオプション：ブラウザを閉じたらクリア
  if (SecureStorage.getOption('clearOnClose', false)) {
    // sessionStorageにフラグがなければ、新しいセッション
    if (!sessionStorage.getItem('_session_active')) {
      SecureStorage.clearApiKeys();
    }
  }
  sessionStorage.setItem('_session_active', 'true');

  // 旧設定マイグレーション: llmPriority openai → openai_llm
  var currentLlmPriority = SecureStorage.getOption('llmPriority', 'auto');
  if (currentLlmPriority === 'openai') {
    console.warn('[Migration] llmPriority: openai → openai_llm');
    SecureStorage.setOption('llmPriority', 'openai_llm');
  }

  // 初回訪問チェック
  const hasVisited = localStorage.getItem('_visited');
  if (!hasVisited) {
    document.getElementById('welcomeModal').classList.add('active');
    localStorage.setItem('_visited', 'true');
  }

  // ブラウザを閉じる前のクリーンアップ
  window.addEventListener('beforeunload', function() {
    if (SecureStorage.getOption('clearOnClose', false)) {
      SecureStorage.clearApiKeys();
    }
  });

  // ユーザー辞書を読み込み
  loadUserDictionary();

  // STT言語設定の初期化（保存値を復元＋変更時に保存）
  var sttLanguageSelect = document.getElementById('sttLanguage');
  if (sttLanguageSelect) {
    // 保存された値を復元
    var savedLanguage = SecureStorage.getOption('sttLanguage', 'ja');

  // STTプロバイダー設定の初期化（保存値を復元）
  var transcriptProviderSelect = document.getElementById('transcriptProvider');
  if (transcriptProviderSelect) {
    var savedProvider = SecureStorage.getOption('sttProvider', 'openai_stt');
    // 許可リストにあるか確認
    if (ALLOWED_STT_PROVIDERS.has(savedProvider)) {
      transcriptProviderSelect.value = savedProvider;
      console.log('[Init] STT provider restored:', savedProvider);
    }
  }
    sttLanguageSelect.value = savedLanguage;
    console.log('[Init] STT language restored:', savedLanguage);

    // 変更時に保存
    sttLanguageSelect.addEventListener('change', function() {
      var newLang = sttLanguageSelect.value;
      SecureStorage.setOption('sttLanguage', newLang);
      console.log('[Settings] STT language changed to:', newLang);
    });
  }

  // ブラウザ互換性チェック（iOS Safari対応）
  checkBrowserCompatibility();

  // デバッグHUD（?debug パラメータ時のみ）
  initDebugHUD();

  const recordBtn = document.getElementById('recordBtn');
  if (recordBtn) {
    // 二重発火防止用タイムスタンプ（performance.nowで単調増加保証）
    var lastTouchEndAt = 0;
    // 連打抑止用ガード
    var recordGuard = false;

    // performance.now()のポリフィル（古いブラウザ対応）
    function getNow() {
      return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    // 連打抑止付きトグル
    function guardedToggleRecording() {
      if (recordGuard) {
        console.log('[Record] Ignoring rapid tap (guard active)');
        return;
      }
      recordGuard = true;
      try {
        toggleRecording();
      } finally {
        setTimeout(function() { recordGuard = false; }, 500);
      }
    }

    // iOS Safari用にtouchendを追加（clickより先に発火）
    recordBtn.addEventListener('touchend', function(e) {
      lastTouchEndAt = getNow();
      if (e.cancelable) e.preventDefault(); // ゴーストクリック防止
      guardedToggleRecording();
    }, { passive: false });

    // 通常のclickイベント（デスクトップ用 + touchend後の二重発火防止）
    recordBtn.addEventListener('click', function(e) {
      e.preventDefault();
      // touchend直後のclickは無視（二重発火防止）
      if (getNow() - lastTouchEndAt < 600) {
        console.log('[Record] Ignoring click after touchend (anti-double-fire)');
        return;
      }
      guardedToggleRecording();
    });
  }

  const exportBtn = document.getElementById('openExportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', openExportModal);
  }

  const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
  if (clearTranscriptBtn) {
    clearTranscriptBtn.addEventListener('click', clearTranscript);
  }

  // CSP対応: 文字起こしチャンクのボタン操作をイベントデリゲーションで処理
  var transcriptContainer = document.getElementById('transcriptText');
  if (transcriptContainer) {
    transcriptContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('button.btn-icon[data-action]');
      if (!btn) return;

      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');

      if (action === 'copy') {
        copyChunkText(id);
      } else if (action === 'marker') {
        // id が空文字列の場合は null として扱う（マーカー解除）
        setMeetingStartMarker(id || null);
      } else if (action === 'exclude') {
        toggleChunkExcluded(id);
      }
    });
  }

  document.querySelectorAll('.cost-header[data-cost-target]').forEach(header => {
    header.addEventListener('click', () => {
      const target = header.getAttribute('data-cost-target');
      if (target) {
        toggleCostDetails(target);
      }
    });
  });

  document.querySelectorAll('.ask-ai-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // LLM未設定チェック
      if (!getAvailableLlm()) {
        showToast(t('toast.llm.notConfigured'), 'warning');
        return;
      }
      const type = btn.getAttribute('data-ai-type');
      if (type) {
        askAI(type);
      }
    });
  });

  // LLM未設定時のボタン無効化
  updateLLMButtonsState();

  const askCustomBtn = document.getElementById('askCustomBtn');
  if (askCustomBtn) {
    askCustomBtn.addEventListener('click', () => askAI('custom'));
  }

  const customQuestionInput = document.getElementById('customQuestion');
  if (customQuestionInput) {
    // IME変換中フラグ（日本語入力時の誤送信防止）
    var isComposingCustomQuestion = false;

    customQuestionInput.addEventListener('compositionstart', function() {
      isComposingCustomQuestion = true;
    });

    customQuestionInput.addEventListener('compositionend', function() {
      isComposingCustomQuestion = false;
    });

    customQuestionInput.addEventListener('keydown', function(event) {
      // IME変換中は絶対に送信しない
      if (isComposingCustomQuestion || event.isComposing) {
        return;
      }

      // Ctrl+Enter または Cmd+Enter で送信（textareaなので単独Enterは改行）
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        askAI('custom');
      }
    });
  }

  document.querySelectorAll('.tabs .tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-tab');
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  const closeExportModalBtn = document.getElementById('closeExportModalBtn');
  if (closeExportModalBtn) {
    closeExportModalBtn.addEventListener('click', closeExportModal);
  }

  const closeExportModalFooterBtn = document.getElementById('closeExportModalFooterBtn');
  if (closeExportModalFooterBtn) {
    closeExportModalFooterBtn.addEventListener('click', closeExportModal);
  }

  const downloadExportBtn = document.getElementById('downloadExportBtn');
  if (downloadExportBtn) {
    downloadExportBtn.addEventListener('click', downloadExport);
  }

  // ウェルカムモーダルの閉じるボタン
  const closeWelcomeModalBtn = document.getElementById('closeWelcomeModalBtn');
  if (closeWelcomeModalBtn) {
    closeWelcomeModalBtn.addEventListener('click', closeWelcomeModal);
  }

  const skipWelcomeBtn = document.getElementById('skipWelcomeBtn');
  if (skipWelcomeBtn) {
    skipWelcomeBtn.addEventListener('click', closeWelcomeModal);
  }

  // 詳細設定の折りたたみパネル（スマホ向け）
  const detailsToggle = document.getElementById('detailsToggle');
  const detailsPanel = document.getElementById('detailsPanel');
  if (detailsToggle && detailsPanel) {
    detailsToggle.addEventListener('click', () => {
      detailsToggle.classList.toggle('active');
      detailsPanel.classList.toggle('show');
    });
  }

  // Phase 2: フローティング停止ボタン（スマホ用）
  const floatingStopBtn = document.getElementById('floatingStopBtn');
  if (floatingStopBtn) {
    floatingStopBtn.addEventListener('click', toggleRecording);
  }

  // Phase 3: メインパネル切り替えタブ（スマホ用）
  document.querySelectorAll('.main-tab[data-main-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.getAttribute('data-main-tab');
      if (tabName) {
        switchMainTab(tabName);
      }
    });
  });

  // Phase 5: 会議中モード
  const meetingModeToggle = document.getElementById('meetingModeToggle');
  if (meetingModeToggle) {
    meetingModeToggle.addEventListener('click', enterMeetingMode);
  }

  const meetingModeStopBtn = document.getElementById('meetingModeStopBtn');
  if (meetingModeStopBtn) {
    meetingModeStopBtn.addEventListener('click', async () => {
      await stopRecording();
      exitMeetingMode();
    });
  }

  const meetingModeExitBtn = document.getElementById('meetingModeExitBtn');
  if (meetingModeExitBtn) {
    meetingModeExitBtn.addEventListener('click', exitMeetingMode);
  }

  // LLMインジケーターの更新
  updateLLMIndicator();
  updateLLMButtonsState();

  // 言語変更時の再レンダリング
  window.addEventListener('languagechange', function() {
    // 動的コンテンツの再レンダリング
    updateLLMIndicator();
    updateLLMButtonsState();
    updateCosts();
    renderTranscriptChunks();
    updateUI();
  });

  console.log('[Init] All event listeners attached successfully');
  } catch (e) {
    // 初期化エラーを視覚的に表示
    console.error('[Init] Error during initialization:', e);
    alert(t('error.init', { message: e.message }));
  }
});

// 録音機能
// =====================================
async function toggleRecording() {
  console.log('[Record] toggleRecording called, isRecording:', isRecording);
  try {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  } catch (e) {
    console.error('[Record] Error in toggleRecording:', e);
    alert(t('error.recording', { message: e.message }));
  }
}

async function startRecording() {
  // iOS Safari対応: ユーザー操作直後にgetUserMediaを呼び出す
  // Safariは「最初の非同期処理前にgetUserMediaを呼ぶ」ことを強く要求する
  let tempAudioStream;
  try {
    tempAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    alert(t('error.mic.accessDenied'));
    return;
  }

  let provider = document.getElementById('transcriptProvider').value;
  console.log('=== startRecording ===');
  console.log('Selected STT provider:', provider);

  // プロバイダー検証
  if (!ALLOWED_STT_PROVIDERS.has(provider)) {
    console.warn(`Provider "${provider}" is not allowed, falling back to openai_stt`);
    provider = 'openai_stt';
    document.getElementById('transcriptProvider').value = provider;
  }

  // プロバイダータイプに応じた検証
  const validationResult = await validateSTTProviderForRecording(provider);
  if (!validationResult.valid) {
    // バリデーション失敗時はストリームを解放
    tempAudioStream.getTracks().forEach(track => track.stop());
    showToast(validationResult.message, 'error');
    if (validationResult.redirectToConfig) {
      navigateTo('config.html');
    }
    return;
  }

  // 一時取得したストリームをcurrentAudioStreamに引き継ぐ
  currentAudioStream = tempAudioStream;

  try {
    // プロバイダータイプに応じて録音を開始
    if (STREAMING_PROVIDERS.has(provider)) {
      await startStreamingRecording(provider);
    } else {
      await startChunkedRecording(provider);
    }

    isRecording = true;
    updateUI();

    const providerName = getProviderDisplayName(provider);
    showToast(t('toast.recording.started', { provider: providerName }), 'success');

  } catch (err) {
    // エラー発生時はストリームを解放
    if (tempAudioStream) {
      tempAudioStream.getTracks().forEach(track => track.stop());
    }
    console.error('録音開始エラー:', err);
    showToast(t('error.recording', { message: err.message }), 'error');
    await cleanupRecording();
  }
}

// STTプロバイダーの検証（録音開始時）
async function validateSTTProviderForRecording(provider) {
  switch (provider) {
    case 'openai_stt': {
      const key = SecureStorage.getApiKey('openai');
      if (!key) {
        return { valid: false, message: 'OpenAI APIキーを設定してください', redirectToConfig: true };
      }
      return { valid: true };
    }
    case 'deepgram_realtime': {
      const key = SecureStorage.getApiKey('deepgram');
      if (!key) {
        return { valid: false, message: 'Deepgram APIキーを設定してください', redirectToConfig: true };
      }
      return { valid: true };
    }
    case 'assemblyai_realtime': {
      const key = SecureStorage.getApiKey('assemblyai');
      if (!key) {
        return { valid: false, message: 'AssemblyAI APIキーを設定してください', redirectToConfig: true };
      }
      return { valid: true };
    }
    default:
      return { valid: false, message: `不明なプロバイダー: ${provider}`, redirectToConfig: true };
  }
}

// プロバイダー表示名を取得
function getProviderDisplayName(provider) {
  const names = {
    'openai_stt': 'OpenAI Whisper',
    'deepgram_realtime': 'Deepgram Realtime',
    'assemblyai_realtime': 'AssemblyAI Realtime'
  };
  return names[provider] || provider;
}

// =====================================
// Chunked系録音（OpenAI Whisper）
// =====================================
async function startChunkedRecording(provider) {
  console.log('[Chunked] Starting recording for provider:', provider);

  // iOS Safari対応: startRecording()で既に取得済みのストリームを再利用
  // 二重取得を防止し、Safari/Chrome両対応を維持
  if (!currentAudioStream) {
    currentAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }

  // 最適なMIMEタイプを選択
  const preferredTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg'
  ];
  selectedMimeType = 'audio/webm';
  for (const type of preferredTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      selectedMimeType = type;
      break;
    }
  }
  console.log('[Chunked] Selected mimeType:', selectedMimeType);

  // OpenAI Whisperプロバイダーを作成
  currentSTTProvider = new OpenAIChunkedProvider({
    apiKey: SecureStorage.getApiKey('openai'),
    model: SecureStorage.getModel('openai') || 'whisper-1'
  });

  currentSTTProvider.setOnTranscript((text, isFinal) => {
    handleTranscriptResult(text, isFinal);
  });

  currentSTTProvider.setOnError((error) => {
    console.error('[Chunked] STT error:', error);
    showToast(t('error.transcript.failed', { message: error.message }), 'error');
  });

  await currentSTTProvider.start();

  // MediaRecorderを開始
  startNewMediaRecorder();

  // 定期的にstop/restartで完結したBlobを生成
  const interval = parseInt(document.getElementById('transcriptInterval').value) * 1000;
  transcriptIntervalId = setInterval(stopAndRestartRecording, interval);
}

// =====================================
// Streaming系録音（Deepgram/AssemblyAI）
// =====================================
async function startStreamingRecording(provider) {
  console.log('[Streaming] Starting recording for provider:', provider);

  // プロバイダーインスタンスを作成
  switch (provider) {
    case 'deepgram_realtime':
      currentSTTProvider = new DeepgramWSProvider({
        apiKey: SecureStorage.getApiKey('deepgram'),
        model: SecureStorage.getModel('deepgram') || 'nova-3-general'
      });
      break;
    case 'assemblyai_realtime':
      currentSTTProvider = new AssemblyAIWSProvider({
        apiKey: SecureStorage.getApiKey('assemblyai')
      });
      break;
    default:
      throw new Error(`Unknown streaming provider: ${provider}`);
  }

  // イベントハンドラを設定
  currentSTTProvider.setOnTranscript((text, isFinal) => {
    handleTranscriptResult(text, isFinal);
  });

  currentSTTProvider.setOnError((error) => {
    console.error('[Streaming] STT error:', error);
    showToast(t('error.transcript.failed', { message: error.message }), 'error');
  });

  currentSTTProvider.setOnStatusChange((status) => {
    console.log('[Streaming] Status:', status);
    if (status === 'connected') {
      updateStatusBadge('🎙️ ' + t('app.recording.statusConnecting'), 'recording');
    } else if (status === 'reconnecting') {
      updateStatusBadge('🔄 ' + t('app.recording.statusReconnecting'), 'ready');
    } else if (status === 'disconnected') {
      updateStatusBadge('⚠️ ' + t('app.recording.statusDisconnected'), 'ready');
    }
  });

  // WebSocket接続を開始
  await currentSTTProvider.start();

  // PCMストリームプロセッサを作成
  pcmStreamProcessor = new PCMStreamProcessor({
    sampleRate: 16000,
    sendInterval: 50  // 100ms→50msに短縮（断片化防止）
  });

  pcmStreamProcessor.setOnAudioData((pcmData) => {
    if (currentSTTProvider && currentSTTProvider.isConnected) {
      currentSTTProvider.sendAudioData(pcmData);
    }
  });

  pcmStreamProcessor.setOnError((error) => {
    console.error('[Streaming] Audio error:', error);
    showToast(t('error.recording', { message: error.message }), 'error');
  });

  // PCMストリーミングを開始
  await pcmStreamProcessor.start();
}

/**
 * 崩れた数値を補正する後処理
 * 例: "1,2,3,4,5,6,7円" → "1234567円"
 * 例: "1,2,3,4,5,6,7" → "1234567"
 *
 * 注意: 通常の「1,234,567」を壊さないよう、4桁以上の連続に限定
 * （1,2,3 のような短い列挙は変換しない）
 */
function fixBrokenNumbers(text) {
  // 単桁がカンマで連なるパターンを検出して結合
  // パターン: 数字1桁 + (カンマ + 数字1桁) が3回以上繰り返し
  // → 4桁以上の崩れた数値のみ対象（1,2,3のような短い列挙は除外）
  return text.replace(/\b(\d)(,\d){3,}\b/g, (match) => {
    // カンマを除去して数字だけにする
    return match.replace(/,/g, '');
  });
}

// 文字起こし結果を処理
function handleTranscriptResult(text, isFinal) {
  if (!text || !text.trim()) return;

  // 数値の後処理を適用
  let processedText = fixBrokenNumbers(text.trim());

  const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  if (isFinal) {
    // チャンクとして保存
    const chunkId = `chunk_${++chunkIdCounter}`;
    transcriptChunks.push({
      id: chunkId,
      timestamp,
      text: processedText,
      excluded: false,
      isMarkerStart: false
    });

    // 互換性のためfullTranscriptも更新
    fullTranscript = getFullTranscriptText();

    // UIを更新（削除ボタン付き）
    renderTranscriptChunks();
  } else {
    // 途中結果を表示（オプション）
    const partialEl = document.getElementById('partialTranscript');
    if (partialEl) {
      partialEl.textContent = `(入力中) ${processedText}`;
    }
  }

  // スクロール
  const body = document.getElementById('transcriptBody');
  if (body) {
    body.scrollTop = body.scrollHeight;
  }
}

// 全チャンクをテキストに変換（互換性用）
function getFullTranscriptText() {
  return transcriptChunks
    .map(c => `[${c.timestamp}] ${c.text}`)
    .join('\n');
}

// エクスポート/AI用のフィルタリングされたテキストを取得
function getFilteredTranscriptText() {
  // 会議開始マーカー以降のみ取得
  let startIndex = 0;
  if (meetingStartMarkerId) {
    const markerIdx = transcriptChunks.findIndex(c => c.id === meetingStartMarkerId);
    if (markerIdx >= 0) {
      startIndex = markerIdx;
    }
  }

  return transcriptChunks
    .slice(startIndex)
    .filter(c => !c.excluded)
    .map(c => `[${c.timestamp}] ${c.text}`)
    .join('\n');
}

// チャンクを削除（トグル）
function toggleChunkExcluded(chunkId) {
  var chunk = transcriptChunks.find(function(c) { return c.id === chunkId; });
  if (chunk) {
    chunk.excluded = !chunk.excluded;
    renderTranscriptChunks();
  }
}

// チャンクのテキストをクリップボードにコピー
function copyChunkText(chunkId) {
  var chunk = transcriptChunks.find(function(c) { return c.id === chunkId; });
  if (!chunk) {
    showToast(t('toast.copy.noTarget'), 'error');
    return;
  }

  var text = chunk.text;

  // Clipboard API を試行
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function() {
      showToast(t('toast.copy.success'), 'success');
    }).catch(function(err) {
      console.error('Clipboard API failed:', err);
      // フォールバック
      copyTextFallback(text);
    });
  } else {
    // Clipboard API 未対応ブラウザ用フォールバック
    copyTextFallback(text);
  }
}

// クリップボードコピーのフォールバック（textarea方式）
function copyTextFallback(text) {
  var textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    var successful = document.execCommand('copy');
    if (successful) {
      showToast(t('toast.copy.success'), 'success');
    } else {
      showToast(t('toast.copy.failed'), 'error');
    }
  } catch (err) {
    console.error('execCommand copy failed:', err);
    showToast(t('toast.copy.failed'), 'error');
  }

  document.body.removeChild(textarea);
}

// 会議開始マーカーを設定
function setMeetingStartMarker(chunkId) {
  // 既存のマーカーをクリア
  transcriptChunks.forEach(c => c.isMarkerStart = false);

  if (chunkId) {
    const chunk = transcriptChunks.find(c => c.id === chunkId);
    if (chunk) {
      chunk.isMarkerStart = true;
      meetingStartMarkerId = chunkId;
    }
  } else {
    meetingStartMarkerId = null;
  }
  renderTranscriptChunks();
}

// チャンクをレンダリング
function renderTranscriptChunks() {
  const container = document.getElementById('transcriptText');
  if (!container) return;

  if (transcriptChunks.length === 0) {
    container.innerHTML = '<span class="placeholder-text">録音を開始すると文字起こしが表示されます...</span>';
    return;
  }

  let html = '';
  transcriptChunks.forEach((chunk, idx) => {
    const isExcluded = chunk.excluded;
    const isBeforeMarker = meetingStartMarkerId && idx < transcriptChunks.findIndex(c => c.id === meetingStartMarkerId);
    const isMarker = chunk.isMarkerStart;
    const isGrayed = isExcluded || isBeforeMarker;

    // マーカー行を表示
    if (isMarker) {
      html += `<div class="transcript-marker">📍 ここから会議開始</div>`;
    }

    html += `<div class="transcript-chunk ${isGrayed ? 'excluded' : ''}" data-id="${chunk.id}">`;
    html += `<span class="chunk-time">[${chunk.timestamp}]</span> `;
    html += `<span class="chunk-text">${escapeHtml(chunk.text)}</span>`;
    html += `<span class="chunk-actions">`;
    // コピーボタン（誤タップ防止のため左端に配置）
    // CSP対応: onclick属性ではなくdata属性＋イベントデリゲーションを使用
    html += `<button class="btn-icon" data-action="copy" data-id="${chunk.id}" title="この文節をコピー" aria-label="この文節をコピー">📋</button>`;
    if (!isMarker) {
      html += `<button class="btn-icon" data-action="marker" data-id="${chunk.id}" title="ここから会議開始（これより前は除外）" aria-label="ここから会議開始">📍</button>`;
    } else {
      html += `<button class="btn-icon active" data-action="marker" data-id="" title="マーカーを解除" aria-label="マーカーを解除">📍</button>`;
    }
    html += `<button class="btn-icon ${isExcluded ? 'active' : ''}" data-action="exclude" data-id="${chunk.id}" title="${isExcluded ? 'この文節を復元' : 'この文節を除外'}" aria-label="${isExcluded ? '復元' : '除外'}">`;
    html += isExcluded ? '♻️' : '🗑️';
    html += `</button>`;
    html += `</span>`;
    html += `</div>`;
  });

  container.innerHTML = html;
}

// HTMLエスケープ
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 録音のクリーンアップ
async function cleanupRecording() {
  console.log('[Cleanup] Starting cleanup...');

  // 1. 停止フラグをオンにする（onstopで最終blobを処理するため）
  isStopping = true;

  // 2. 録音フラグをオフにして新しいblobの生成を止める
  isRecording = false;

  // 3. インターバルをクリア（stop→restart の繰り返しを止める）
  if (transcriptIntervalId) {
    clearInterval(transcriptIntervalId);
    transcriptIntervalId = null;
    console.log('[Cleanup] Interval cleared');
  }

  // 4. PCMストリームを停止
  if (pcmStreamProcessor) {
    await pcmStreamProcessor.stop();
    pcmStreamProcessor = null;
    console.log('[Cleanup] PCM stream stopped');
  }

  // 5. MediaRecorderを停止（最終blobがonstopで生成される）
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    console.log('[Cleanup] Stopping MediaRecorder (final blob will be generated)...');
    mediaRecorder.stop();
    // ★ onstopで最終blob処理完了まで待つ（200ms sleepは削除）
    if (finalStopPromise) {
      console.log('[Cleanup] Waiting for onstop to complete...');
      await finalStopPromise;
      console.log('[Cleanup] onstop completed');
    }
  }

  // 6. キューが空になるまで待つ
  console.log('[Cleanup] Waiting for queue drain...');
  await waitForQueueDrain();
  console.log('[Cleanup] Queue drained');

  // 7. キュー処理完了後にSTTプロバイダーを停止
  if (currentSTTProvider) {
    await currentSTTProvider.stop();
    currentSTTProvider = null;
    console.log('[Cleanup] STT provider stopped');
  }

  // 8. オーディオストリームを停止
  if (currentAudioStream) {
    currentAudioStream.getTracks().forEach(track => track.stop());
    currentAudioStream = null;
    console.log('[Cleanup] Audio stream stopped');
  }

  // 9. MediaRecorderの参照破棄は最後
  mediaRecorder = null;
  isStopping = false;

  console.log('[Cleanup] Cleanup complete');
}

// グローバル変数追加
let currentAudioStream = null;
let selectedMimeType = 'audio/webm';
let pendingBlob = null;

// 新しいMediaRecorderを開始
function startNewMediaRecorder() {
  if (!currentAudioStream) return;

  // 停止時のPromiseを作成
  createFinalStopPromise();

  mediaRecorder = new MediaRecorder(currentAudioStream, { mimeType: selectedMimeType });
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      audioChunks.push(e.data);
      console.log('Audio data received, size:', e.data.size);
    }
  };

  mediaRecorder.onstop = async () => {
    console.log('[onstop] MediaRecorder stopped, isStopping:', isStopping);
    try {
      // stop時に完結したBlobを生成
      // ※ isRecording=false でも isStopping=true の間は最終blobを処理する
      if (audioChunks.length > 0) {
        pendingBlob = new Blob(audioChunks, { type: selectedMimeType });
        console.log('[onstop] Complete audio blob created, size:', pendingBlob.size, 'bytes');

        // ヘッダー確認用デバッグログ
        pendingBlob.slice(0, 16).arrayBuffer().then(buf => {
          const arr = new Uint8Array(buf);
          const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log('[onstop] Blob header (first 16 bytes):', hex);
        });

        // 文字起こし実行（キューに追加）- await で完了を待つ
        await processCompleteBlob(pendingBlob);
        console.log('[onstop] processCompleteBlob completed');
      }
      audioChunks = [];
    } finally {
      // 停止処理中の場合、Promiseを解決
      if (isStopping && finalStopResolve) {
        console.log('[onstop] Resolving finalStopPromise');
        finalStopResolve();
        finalStopResolve = null;
      }
    }
  };

  // timesliceなしで開始（stopするまで1つの完結したファイルになる）
  mediaRecorder.start();
  console.log('MediaRecorder started (no timeslice - will create complete file on stop)');
}

// 定期的にstop→restart（完結したBlobを生成）
function stopAndRestartRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  if (!isRecording) return;

  console.log('Stopping MediaRecorder to create complete blob...');
  mediaRecorder.stop();

  // 少し待ってから新しいMediaRecorderを開始（onstopの処理完了を待つ）
  setTimeout(() => {
    if (isRecording && currentAudioStream) {
      startNewMediaRecorder();
    }
  }, 100);
}

async function stopRecording() {
  console.log('=== stopRecording ===');

  // クリーンアップ処理を呼び出し
  await cleanupRecording();

  updateUI();
  showToast(t('toast.recording.stopped'), 'info');
}

// キュー方式で直列化
const transcriptionQueue = [];
let isProcessingQueue = false;
let blobCounter = 0;  // Blob識別用カウンター
let lastTranscriptTail = '';  // 前チャンクの末尾（Whisper prompt用）

// 完結したBlobをキューに追加して処理
async function processCompleteBlob(audioBlob) {
  if (!audioBlob || audioBlob.size < 1000) {
    console.log('Audio blob too small, skipping:', audioBlob ? audioBlob.size : 0);
    return;
  }

  // Blob IDを生成
  const blobId = `blob_${Date.now()}_${blobCounter++}`;
  audioBlob._debugId = blobId;
  audioBlob._enqueueTime = Date.now();

  // Duration算出（デバッグ用）
  let audioContext;
  try {
    audioContext = new AudioContext();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    audioBlob._duration = audioBuffer.duration;
    console.log(`[Blob Created] id=${blobId}, size=${audioBlob.size}, duration=${audioBuffer.duration.toFixed(2)}s`);
  } catch (e) {
    console.log(`[Blob Created] id=${blobId}, size=${audioBlob.size}, duration=unknown (${e.message})`);
  } finally {
    // AudioContextを確実にcloseする（リーク防止）
    if (audioContext) {
      await audioContext.close().catch(() => {});
    }
  }

  // キューに追加
  transcriptionQueue.push(audioBlob);
  console.log(`[Blob Enqueue] id=${blobId}, queue length:`, transcriptionQueue.length);

  // キューが溜まりすぎたら古いのを捨てる（リアルタイム優先）
  while (transcriptionQueue.length > 3) {
    const dropped = transcriptionQueue.shift();
    console.log('Dropped old blob from queue, size:', dropped.size);
  }

  // キュー処理を開始
  processQueue();
}

// キュー完了待機用のPromise解決関数
let queueDrainResolvers = [];

// キューを順次処理（chunked系プロバイダー用）
async function processQueue() {
  if (isProcessingQueue) return;
  if (transcriptionQueue.length === 0) {
    // キューが空の場合、待機中のPromiseを解決
    resolveQueueDrain();
    return;
  }

  isProcessingQueue = true;

  // デバッグ: STT設定のサマリーを出力
  console.log('=== processQueue: STT Configuration ===');
  console.log('Current STT Provider:', (currentSTTProvider && currentSTTProvider.getInfo) ? currentSTTProvider.getInfo() : 'none');
  console.log('Queue length:', transcriptionQueue.length);

  // stopRecording後もprovider参照を保持するためにキャプチャ
  const providerSnapshot = currentSTTProvider;

  try {
    while (transcriptionQueue.length > 0) {
      const audioBlob = transcriptionQueue.shift();
      const blobId = audioBlob._debugId || 'unknown';
      const waitTime = audioBlob._enqueueTime ? Date.now() - audioBlob._enqueueTime : 0;
      console.log(`[Blob Dequeue] id=${blobId}, size=${audioBlob.size}, waited=${waitTime}ms, remaining=${transcriptionQueue.length}`);

      try {
        // キャプチャしたproviderを使用（stopRecording後もnullにならない）
        if (providerSnapshot && typeof providerSnapshot.transcribeBlob === 'function') {
          const text = await providerSnapshot.transcribeBlob(audioBlob);
          console.log(`[Transcription] id=${blobId}, result:`, text);
          // handleTranscriptResultはprovider.emitTranscript経由で呼ばれる
          // ここでは重複呼び出しを避けるため、直接呼び出さない

          // コスト計算（Whisperは分単位課金）
          const estimatedSeconds = Math.max(audioBlob.size / 4000, 1);
          const estimatedMinutes = estimatedSeconds / 60;
          const audioCost = estimatedMinutes * PRICING.transcription.openai.perMinute;

          costs.transcript.duration += estimatedSeconds;
          costs.transcript.calls += 1;
          costs.transcript.byProvider.openai += audioCost;
          costs.transcript.total += audioCost;

          console.log(`[STT Cost] id=${blobId}, duration=${estimatedSeconds.toFixed(1)}s, cost=¥${audioCost.toFixed(2)}, total=¥${costs.transcript.total.toFixed(2)}`);

          updateCosts();
          checkCostAlert();

          // 前チャンクの末尾を保存（次回のWhisper prompt用）
          if (text && text.trim()) {
            lastTranscriptTail = text.trim().slice(-200);
          }
        } else {
          // フォールバック: 直接Whisper APIを呼び出し
          console.warn(`[Fallback] id=${blobId}, No provider available, using transcribeWithWhisper`);
          const text = await transcribeWithWhisper(audioBlob);
          if (text && text.trim()) {
            handleTranscriptResult(text, true);
            lastTranscriptTail = text.trim().slice(-200);
          }
        }
      } catch (err) {
        console.error(`[Transcription Error] id=${blobId}:`, err);
        showToast(t('error.transcript.failed', { message: err.message }), 'error');
        // エラーでもキュー処理は継続
      }

      // 連続リクエストを避けるため少し待機
      if (transcriptionQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  } finally {
    isProcessingQueue = false;

    // ★ループ後に新規enqueueが入ってたら、もう一回処理を蹴る
    // setTimeoutでイベントループに返して多重呼び出しを防止
    if (transcriptionQueue.length > 0) {
      console.log('[processQueue] New items enqueued during processing, scheduling restart...');
      setTimeout(() => processQueue(), 0);
      return;
    }

    // ★本当に空のときだけ解放
    resolveQueueDrain();
  }
}

// キューが空になるまで待機（timeout保険付き）
function waitForQueueDrain(timeoutMs = 15000) {
  if (transcriptionQueue.length === 0 && !isProcessingQueue) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    let settled = false;  // 二重resolve防止フラグ

    // timeout保険：最大待機時間を超えたら警告を出しつつresolve
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn('[QueueDrain] timeout - forcing resolve', {
        queueLength: transcriptionQueue.length,
        isProcessingQueue
      });
      resolve();
    }, timeoutMs);

    // 正常なresolve時はtimeoutをクリア
    queueDrainResolvers.push(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve();
    });
  });
}

// キュー完了を通知（条件を満たすときのみ）
function resolveQueueDrain() {
  // ★条件を満たさないなら解放しない（レース防止）
  if (transcriptionQueue.length !== 0 || isProcessingQueue) {
    return;
  }

  const resolvers = queueDrainResolvers;
  queueDrainResolvers = [];
  resolvers.forEach(resolve => resolve());
}

// =====================================
// [削除済み] transcribeWithGemini
// =====================================
// Gemini generateContent APIは音声文字起こし（STT）には使用しない。
// 理由: MediaRecorderのtimeslice使用時、2回目以降のチャンクにヘッダーがなく400エラーが発生する。
// STTには専用API（OpenAI Whisper, Deepgram, AssemblyAI等）を使用すること。
// Gemini APIはLLMタスク（要約、Q&A等）専用として残す。

// ユーザー辞書（固有名詞のヒント）- 設定画面から登録可能
// ローマ字＋カタカナ併記で認識精度向上（OpenAI推奨）
// デフォルト辞書 + ユーザー辞書を結合して使用
// NOTE: DEFAULT_DICTIONARY は js/stt/providers/openai_chunked.js で定義済み
let whisperUserDictionary = '';

// ユーザー辞書を読み込む
function loadUserDictionary() {
  const userDict = SecureStorage.getOption('sttUserDictionary', '');
  // デフォルト辞書とユーザー辞書を結合
  const parts = [DEFAULT_DICTIONARY];
  if (userDict && userDict.trim()) {
    parts.push(userDict.trim());
  }
  whisperUserDictionary = parts.join(', ');
  console.log('[STT] User dictionary loaded:', whisperUserDictionary.substring(0, 100) + (whisperUserDictionary.length > 100 ? '...' : ''));
}

async function transcribeWithWhisper(audioBlob) {
  console.log('=== transcribeWithWhisper ===');
  const openaiKey = SecureStorage.getApiKey('openai');

  // STTモデルの取得と検証
  let sttModel = SecureStorage.getModel('openai') || 'whisper-1';
  console.log('Requested STT model:', sttModel);

  // 許可リストチェック
  if (!ALLOWED_STT_MODELS.has(sttModel)) {
    console.warn(`⚠️ Model "${sttModel}" is NOT in ALLOWED_STT_MODELS. Falling back to "whisper-1".`);
    sttModel = 'whisper-1';
  } else {
    console.log(`✓ Model "${sttModel}" is allowed for STT.`);
  }

  console.log('Final STT model:', sttModel);
  console.log('Audio blob size:', audioBlob.size, 'bytes');
  console.log('Audio blob type:', audioBlob.type);

  // promptを構築（前チャンクの末尾 + ユーザー辞書）
  const promptParts = [];
  if (lastTranscriptTail) {
    promptParts.push(lastTranscriptTail);
  }
  if (whisperUserDictionary) {
    promptParts.push(whisperUserDictionary);
  }
  const prompt = promptParts.join(' ');

  // FormDataでファイルを送信
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', sttModel);

  // 言語設定を取得（auto/ja/en）
  // auto の場合は language パラメータを送信しない（Whisperに自動判定させる）
  const sttLanguage = SecureStorage.getOption('sttLanguage', 'ja');
  if (sttLanguage && sttLanguage !== 'auto') {
    formData.append('language', sttLanguage);
    console.log('STT language:', sttLanguage);
  } else {
    console.log('STT language: auto (no language parameter sent)');
  }

  // promptパラメータを追加（空でない場合のみ）
  // auto/en モードでは日本語の前チャンクを含めない（言語混入防止）
  var effectivePrompt = prompt || '';

  // 安全策: 変数未定義時のReferenceError防止
  var lastTail = (typeof lastTranscriptTail !== 'undefined' && lastTranscriptTail) ? lastTranscriptTail : '';
  var userDict = (typeof whisperUserDictionary !== 'undefined' && whisperUserDictionary) ? whisperUserDictionary : '';

  if (sttLanguage !== 'ja' && lastTail) {
    // 日本語文字が含まれている場合は前チャンクを除外
    var hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(lastTail);
    if (hasJapanese) {
      effectivePrompt = userDict;
      console.log('Skipping lastTranscriptTail (contains Japanese) for non-Japanese mode');
    }
  }
  if (effectivePrompt) {
    formData.append('prompt', effectivePrompt);
    console.log('Using Whisper prompt:', effectivePrompt.substring(0, 100) + (effectivePrompt.length > 100 ? '...' : ''));
  }

  const response = await fetchWithRetry('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('Whisper API error response:', errorBody);
    throw new Error(`Whisper API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  const text = data.text || '';

  // コスト計算（Whisperは分単位課金）
  const estimatedSeconds = Math.max(audioBlob.size / 4000, 1);
  const estimatedMinutes = estimatedSeconds / 60;
  const audioCost = estimatedMinutes * PRICING.transcription.openai.perMinute;

  costs.transcript.duration += estimatedSeconds;
  costs.transcript.calls += 1;
  costs.transcript.byProvider.openai += audioCost;
  costs.transcript.total += audioCost;

  updateCosts();
  checkCostAlert();

  return text.trim();
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// =====================================
// トースト通知
// =====================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${message}</span>
  `;

  container.appendChild(toast);

  // 4秒後に削除
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 4000);
}

// =====================================
// リトライ機能付きAPI呼び出し
// =====================================
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error;
      console.warn(`API呼び出し失敗 (${i + 1}/${maxRetries}):`, error);

      if (i < maxRetries - 1) {
        // 指数バックオフ: 1秒, 2秒, 4秒
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// =====================================
// ヘルパー関数
// =====================================
// 使用可能なLLMを取得
function getAvailableLlm() {
  const priority = SecureStorage.getOption('llmPriority', 'auto');
  // 優先順位: claude → openai_llm → gemini → groq
  // ※ openai_llm はLLM専用のOpenAI APIキー（STTとは別）
  const providers = ['claude', 'openai_llm', 'gemini', 'groq'];

  if (priority !== 'auto') {
    // 指定されたプロバイダーを優先
    if (SecureStorage.getApiKey(priority)) {
      return { provider: priority, model: SecureStorage.getModel(priority) || getDefaultModel(priority) };
    }
  }

  // 自動選択：設定されているAPIキーを優先順位で選択
  for (const p of providers) {
    if (SecureStorage.getApiKey(p)) {
      return { provider: p, model: SecureStorage.getModel(p) || getDefaultModel(p) };
    }
  }

  return null; // 使用可能なLLMなし
}

function getDefaultModel(provider) {
  const defaults = {
    gemini: 'gemini-2.0-flash-exp',
    claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    openai_llm: 'gpt-4o',
    groq: 'llama-3.1-70b-versatile'
  };
  return defaults[provider];
}

// =====================================
// AI質問機能
// =====================================
async function askAI(type) {
  const requestId = generateQARequestId();
  const questionForLog = type === 'custom'
    ? document.getElementById('customQuestion').value.trim()
    : type;

  // 送信ガード: 送信中は処理しない
  if (isSubmittingQA) {
    logQA(requestId, 'blocked', { reason: 'already_submitting', question: questionForLog });
    showToast(t('toast.qa.submitting'), 'warning');
    return;
  }

  // フィルタリングされたテキストを使用（除外チャンク・マーカー前を除く）
  const transcript = getFilteredTranscriptText().trim();
  if (!transcript) {
    alert(t('error.transcript.noText'));
    return;
  }

  // 選択テキストがあれば、それを対象にする
  const selection = window.getSelection().toString().trim();
  const targetText = selection || transcript;

  // 使用可能なLLMを自動選択
  const llm = getAvailableLlm();

  if (!llm) {
    alert(t('error.api.notConfigured'));
    navigateTo('config.html');
    return;
  }

  const provider = llm.provider;

  let prompt = '';
  let customQ = '';

  switch(type) {
    case 'summary':
      prompt = `${t('ai.prompt.summary')}\n\n${targetText}`;
      break;
    case 'opinion':
      prompt = `${t('ai.prompt.opinion')}\n\n${targetText}`;
      break;
    case 'idea':
      prompt = `${t('ai.prompt.idea')}\n\n${targetText}`;
      break;
    case 'minutes':
      // 議事録は録音停止後のみ
      if (isRecording) {
        showToast(t('toast.qa.minutesAfterStop'), 'warning');
        return;
      }
      prompt = `${t('ai.prompt.minutes')}\n\n${targetText}`;
      break;
    case 'custom':
      customQ = document.getElementById('customQuestion').value.trim();
      if (!customQ) {
        alert(t('toast.qa.enterQuestion'));
        return;
      }
      // 重複チェック
      if (isDuplicateQuestion(customQ)) {
        logQA(requestId, 'blocked', { reason: 'duplicate_question', question: customQ });
        showToast(t('toast.qa.duplicate'), 'warning');
        return;
      }
      prompt = t('ai.prompt.custom', { transcript: targetText, question: customQ });
      document.getElementById('customQuestion').value = '';
      break;
  }

  // 送信ガードON
  isSubmittingQA = true;
  disableAIButtons(true);

  logQA(requestId, 'started', { type, question: questionForLog, provider });

  // タブを切り替え
  switchTab(type);

  // ローディング表示用の要素参照を保持
  let answerEl = null;
  let qaItem = null;

  if (type === 'custom') {
    const qaHistory = document.getElementById('qa-history');
    qaItem = document.createElement('div');
    qaItem.className = 'qa-item';
    qaItem.dataset.requestId = requestId;

    const questionEl = document.createElement('div');
    questionEl.className = 'qa-question';
    questionEl.textContent = `Q: ${customQ}`;

    answerEl = document.createElement('div');
    answerEl.className = 'qa-answer';
    const loading = document.createElement('span');
    loading.className = 'loading';
    answerEl.appendChild(loading);
    answerEl.appendChild(document.createTextNode(' ' + t('common.generating')));

    qaItem.appendChild(questionEl);
    qaItem.appendChild(answerEl);
    qaHistory.appendChild(qaItem);
  } else {
    const responseEl = document.getElementById(`response-${type}`);
    responseEl.textContent = '';
    const loading = document.createElement('span');
    loading.className = 'loading';
    responseEl.appendChild(loading);
    responseEl.appendChild(document.createTextNode(' ' + t('common.generating')));
  }

  // タイムアウト付きLLM呼び出し
  const startTime = Date.now();
  let timeoutId = null;

  try {
    const llmPromise = callLLM(provider, prompt);
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const err = new Error(t('error.api.timeout'));
        err.code = 'TIMEOUT';
        reject(err);
      }, QA_TIMEOUT_MS);
    });

    const response = await Promise.race([llmPromise, timeoutPromise]);
    clearTimeout(timeoutId);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logQA(requestId, 'completed', { type, duration: `${duration}s` });

    if (type === 'custom') {
      answerEl.textContent = response;
      aiResponses.custom.push({ q: customQ, a: response, requestId });
    } else if (type === 'minutes') {
      // 議事録は上書き（単一）
      document.getElementById(`response-${type}`).textContent = response;
      aiResponses.minutes = response;
    } else {
      // 要約・意見・アイデアは配列で蓄積
      const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      aiResponses[type].push({ timestamp, content: response });

      // UIに表示（全エントリを表示）
      const displayText = aiResponses[type].map((entry, i) => {
        return `━━━ #${i + 1}（${entry.timestamp}）━━━\n\n${entry.content}`;
      }).join('\n\n');
      document.getElementById(`response-${type}`).textContent = displayText;
    }
  } catch (err) {
    clearTimeout(timeoutId);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const isTimeout = err.code === 'TIMEOUT';

    logQA(requestId, isTimeout ? 'timeout' : 'failed', {
      type,
      duration: `${duration}s`,
      error: err.message
    });

    console.error('AI呼び出しエラー:', err);
    const errorMsg = isTimeout
      ? `⏱️ ${t('toast.qa.timeout')}`
      : t('error.api.generic', { message: err.message });

    if (type === 'custom') {
      // answerElを直接使用（既に参照を保持している）
      if (answerEl) {
        answerEl.innerHTML = `<span class="error-text">${errorMsg}</span>`;
        // 再試行ボタンを追加
        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-ghost btn-sm';
        retryBtn.textContent = '🔄 再試行';
        retryBtn.onclick = () => {
          // 失敗したアイテムを削除して再送信
          if (qaItem && qaItem.parentNode) {
            qaItem.parentNode.removeChild(qaItem);
          }
          document.getElementById('customQuestion').value = customQ;
          // 重複チェックをリセット
          lastQAQuestion = '';
          lastQAQuestionTime = 0;
          askAI('custom');
        };
        answerEl.appendChild(document.createElement('br'));
        answerEl.appendChild(retryBtn);
      }
    } else {
      document.getElementById(`response-${type}`).innerHTML =
        `<span class="error-text">${errorMsg}</span>`;
    }
  } finally {
    // 送信ガードOFF
    isSubmittingQA = false;
    disableAIButtons(false);
  }
}

// AIボタンのdisable制御
function disableAIButtons(disabled) {
  const buttons = [
    ...document.querySelectorAll('.ask-ai-btn'),
    document.getElementById('askCustomBtn')
  ].filter(Boolean);

  buttons.forEach(btn => {
    btn.disabled = disabled;
    if (disabled) {
      btn.classList.add('btn-disabled');
    } else {
      btn.classList.remove('btn-disabled');
    }
  });
}

// LLM呼び出し（フォールバック付き）
async function callLLM(provider, prompt) {
  var model = SecureStorage.getModel(provider) || getDefaultModel(provider);

  try {
    return await callLLMOnce(provider, model, prompt);
  } catch (e) {
    var fb = getFallbackModel(provider, model);
    if (!fb) {
      // フォールバック不可（同じモデル or 未定義）→ そのまま投げる
      throw e;
    }

    // フォールバック通知
    showToast(
      '選択モデルでエラー。今回は ' + fb + ' に切替して再試行します（設定は変更しません）',
      'warning'
    );
    console.warn('[LLM] fallback', { provider: provider, from: model, to: fb, error: e.message });

    // 1回だけ再試行（これが失敗したらそのまま上に投げる）
    return await callLLMOnce(provider, fb, prompt);
  }
}

// LLM呼び出し（1回のみ、フォールバックなし）
async function callLLMOnce(provider, model, prompt) {
  var apiKey = SecureStorage.getApiKey(provider);
  var response, data, text;
  var inputTokens = 0, outputTokens = 0;

  switch(provider) {
    case 'gemini':
      response = await fetchWithRetry(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );
      data = await response.json();
      if (!response.ok) {
        var errMsg = (data && data.error && data.error.message) ? data.error.message : 'Gemini API error';
        throw new Error(errMsg);
      }
      text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
              data.candidates[0].content.parts && data.candidates[0].content.parts[0])
              ? data.candidates[0].content.parts[0].text : '';
      inputTokens = (data.usageMetadata && data.usageMetadata.promptTokenCount)
                    ? data.usageMetadata.promptTokenCount : Math.ceil(prompt.length / 4);
      outputTokens = (data.usageMetadata && data.usageMetadata.candidatesTokenCount)
                     ? data.usageMetadata.candidatesTokenCount : Math.ceil(text.length / 4);
      break;

    case 'claude':
      response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      data = await response.json();
      if (!response.ok) {
        var errMsg = (data && data.error && data.error.message) ? data.error.message : 'Claude API error';
        throw new Error(errMsg);
      }
      text = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : '';
      inputTokens = (data.usage && data.usage.input_tokens) ? data.usage.input_tokens : Math.ceil(prompt.length / 4);
      outputTokens = (data.usage && data.usage.output_tokens) ? data.usage.output_tokens : Math.ceil(text.length / 4);
      break;

    case 'openai':
    case 'openai_llm':
      response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      data = await response.json();
      if (!response.ok) {
        var errMsg = (data && data.error && data.error.message) ? data.error.message : 'OpenAI API error';
        throw new Error(errMsg);
      }
      text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
             ? data.choices[0].message.content : '';
      inputTokens = (data.usage && data.usage.prompt_tokens) ? data.usage.prompt_tokens : Math.ceil(prompt.length / 4);
      outputTokens = (data.usage && data.usage.completion_tokens) ? data.usage.completion_tokens : Math.ceil(text.length / 4);
      break;

    case 'groq':
      response = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      data = await response.json();
      if (!response.ok) {
        var errMsg = (data && data.error && data.error.message) ? data.error.message : 'Groq API error';
        throw new Error(errMsg);
      }
      text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
             ? data.choices[0].message.content : '';
      inputTokens = (data.usage && data.usage.prompt_tokens) ? data.usage.prompt_tokens : Math.ceil(prompt.length / 4);
      outputTokens = (data.usage && data.usage.completion_tokens) ? data.usage.completion_tokens : Math.ceil(text.length / 4);
      break;
  }

  // コスト計算（詳細版）
  var pricingProvider = PRICING[provider];
  var pricing = (pricingProvider && pricingProvider[model]) ? pricingProvider[model] : { input: 1, output: 3 };
  var cost = ((inputTokens * pricing.input + outputTokens * pricing.output) / 1000000) * PRICING.yenPerDollar;

  costs.llm.inputTokens += inputTokens;
  costs.llm.outputTokens += outputTokens;
  costs.llm.calls += 1;
  costs.llm.byProvider[provider] += cost;
  costs.llm.total += cost;

  updateCosts();
  checkCostAlert();

  return text;
}

function getDefaultModel(provider) {
  var defaults = {
    gemini: 'gemini-2.0-flash-exp',
    claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    openai_llm: 'gpt-4o',
    groq: 'llama-3.1-70b-versatile'
  };
  return defaults[provider];
}

// フォールバック用モデルを取得（リクエストモデルと同じなら null を返す）
function getFallbackModel(provider, requestedModel) {
  var fallbacks = {
    gemini: 'gemini-2.0-flash-exp',
    claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    openai_llm: 'gpt-4o',
    groq: 'llama-3.1-70b-versatile'
  };
  var fb = fallbacks[provider];
  // フォールバックが同じモデルなら再試行しない
  if (!fb || fb === requestedModel) return null;
  return fb;
}

// =====================================
// UI更新
// =====================================
function updateUI() {
  const btn = document.getElementById('recordBtn');
  const badge = document.getElementById('statusBadge');
  const floatingBtn = document.getElementById('floatingStopBtn');
  const meetingModeToggle = document.getElementById('meetingModeToggle');
  const minutesBtn = document.getElementById('minutesBtn');

  if (isRecording) {
    btn.textContent = '⏹ 録音停止';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-danger');
    badge.textContent = '🔴 録音中';
    badge.classList.remove('status-ready');
    badge.classList.add('status-recording');
    // Phase 2: フローティング停止ボタンを表示（スマホ用）
    if (floatingBtn) {
      floatingBtn.classList.add('visible');
    }
    // Phase 5: 会議中モード切替ボタンを表示（スマホ用）
    if (meetingModeToggle) {
      meetingModeToggle.classList.add('visible');
    }
    // 議事録ボタンは録音中は無効
    if (minutesBtn) {
      minutesBtn.disabled = true;
      minutesBtn.title = '録音停止後に利用可能';
    }
    // 録音開始時間を記録
    if (!recordingStartTime) {
      recordingStartTime = Date.now();
    }
  } else {
    btn.textContent = '🎤 録音開始';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-primary');
    badge.textContent = '⏸ 待機中';
    badge.classList.remove('status-recording');
    badge.classList.add('status-ready');
    // Phase 2: フローティング停止ボタンを非表示
    if (floatingBtn) {
      floatingBtn.classList.remove('visible');
    }
    // Phase 5: 会議中モード切替ボタンを非表示
    if (meetingModeToggle) {
      meetingModeToggle.classList.remove('visible');
    }
    // 議事録ボタンは録音停止後かつ文字起こしがある場合に有効
    if (minutesBtn) {
      const hasTranscript = fullTranscript && fullTranscript.trim().length > 0;
      minutesBtn.disabled = !hasTranscript;
      minutesBtn.title = hasTranscript ? '会議の議事録を作成' : '文字起こしがありません';
    }
    // 録音開始時間をリセット
    recordingStartTime = null;
  }
}

// ステータスバッジを直接更新（streaming系プロバイダー用）
function updateStatusBadge(text, status) {
  const badge = document.getElementById('statusBadge');
  if (!badge) return;

  badge.textContent = text;
  badge.classList.remove('status-ready', 'status-recording', 'status-error');

  switch (status) {
    case 'recording':
      badge.classList.add('status-recording');
      break;
    case 'error':
      badge.classList.add('status-error');
      break;
    default:
      badge.classList.add('status-ready');
  }
}

function updateCosts() {
  const total = costs.transcript.total + costs.llm.total;

  // 文字起こしコスト
  document.getElementById('transcriptCostTotal').textContent = formatCost(costs.transcript.total);
  document.getElementById('transcriptDuration').textContent = formatDuration(costs.transcript.duration);
  document.getElementById('transcriptCalls').textContent = `${costs.transcript.calls}回`;
  document.getElementById('openaiTranscriptCost').textContent = formatCost(costs.transcript.byProvider.openai);
  document.getElementById('deepgramTranscriptCost').textContent = formatCost(costs.transcript.byProvider.deepgram);
  document.getElementById('assemblyaiTranscriptCost').textContent = formatCost(costs.transcript.byProvider.assemblyai);

  // 文字起こしコストバッジ
  const transcriptBadge = document.getElementById('transcriptCostBadge');
  updateCostBadge(transcriptBadge, costs.transcript.total);

  // LLMコスト
  document.getElementById('llmCostTotal').textContent = formatCost(costs.llm.total);
  document.getElementById('llmInputTokens').textContent = formatNumber(costs.llm.inputTokens);
  document.getElementById('llmOutputTokens').textContent = formatNumber(costs.llm.outputTokens);
  document.getElementById('llmCalls').textContent = `${costs.llm.calls}回`;

  // プロバイダー別
  document.getElementById('geminiLlmCost').textContent = formatCost(costs.llm.byProvider.gemini);
  document.getElementById('claudeCost').textContent = formatCost(costs.llm.byProvider.claude);
  document.getElementById('openaiCost').textContent = formatCost(costs.llm.byProvider.openai);
  document.getElementById('groqCost').textContent = formatCost(costs.llm.byProvider.groq);

  // LLMコストバッジ
  const llmBadge = document.getElementById('llmCostBadge');
  updateCostBadge(llmBadge, costs.llm.total);

  // 合計
  document.getElementById('totalCost').textContent = formatCost(total);
}

function formatCost(yen) {
  if (yen < 1) {
    return `¥${yen.toFixed(2)}`;
  }
  return `¥${Math.round(yen).toLocaleString()}`;
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}秒`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}分${secs}秒`;
}

function formatNumber(num) {
  return num.toLocaleString();
}

function updateCostBadge(badge, cost) {
  badge.classList.remove('cost-badge-low', 'cost-badge-medium', 'cost-badge-high');
  if (cost < 10) {
    badge.classList.add('cost-badge-low');
    badge.textContent = '低';
  } else if (cost < 50) {
    badge.classList.add('cost-badge-medium');
    badge.textContent = '中';
  } else {
    badge.classList.add('cost-badge-high');
    badge.textContent = '高';
  }
}

function toggleCostDetails(type) {
  const details = document.getElementById(`${type}CostDetails`);
  details.classList.toggle('show');
}

function checkCostAlert() {
  const alertEnabled = SecureStorage.getOption('costAlertEnabled', true);
  const costLimit = SecureStorage.getOption('costLimit', 100);

  if (!alertEnabled || costLimit <= 0) return;

  const total = costs.transcript.total + costs.llm.total;
  const threshold = costLimit * 0.8;

  const warningEl = document.getElementById('costWarning');
  if (total >= threshold) {
    warningEl.style.display = 'block';
    warningEl.textContent = `⚠️ 上限（¥${costLimit}）の${Math.round(total / costLimit * 100)}%に達しています`;

    if (total >= costLimit) {
      warningEl.textContent = `🚫 上限（¥${costLimit}）を超えました！`;
      warningEl.style.background = '#fee2e2';
      warningEl.style.borderColor = '#fca5a5';
      warningEl.style.color = '#991b1b';
    }
  } else {
    warningEl.style.display = 'none';
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

// Phase 3: メインパネル切り替え（スマホ用）
function switchMainTab(tabName) {
  // タブの切り替え
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.main-tab[data-main-tab="${tabName}"]`).classList.add('active');

  // パネルの切り替え
  const transcriptPanel = document.getElementById('transcriptPanel');
  const aiPanel = document.getElementById('aiPanel');

  if (tabName === 'transcript') {
    transcriptPanel.classList.add('active');
    aiPanel.classList.remove('active');
  } else if (tabName === 'ai') {
    transcriptPanel.classList.remove('active');
    aiPanel.classList.add('active');
  }
}

// Phase 5: 会議中モード
function enterMeetingMode() {
  if (!isRecording) return;

  isMeetingMode = true;
  const overlay = document.getElementById('meetingModeOverlay');
  if (overlay) {
    overlay.classList.add('active');
  }

  // タイマー開始
  updateMeetingModeTime();
  meetingModeTimerId = setInterval(updateMeetingModeTime, 1000);
}

function exitMeetingMode() {
  isMeetingMode = false;
  const overlay = document.getElementById('meetingModeOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }

  // タイマー停止
  if (meetingModeTimerId) {
    clearInterval(meetingModeTimerId);
    meetingModeTimerId = null;
  }
}

function updateMeetingModeTime() {
  if (!recordingStartTime) return;

  const elapsed = Date.now() - recordingStartTime;
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  const timeStr = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');

  const timeEl = document.getElementById('meetingModeTime');
  if (timeEl) {
    timeEl.textContent = timeStr;
  }
}

function clearTranscript() {
  if (confirm(t('app.transcript.clearConfirm'))) {
    fullTranscript = '';
    transcriptChunks = [];
    chunkIdCounter = 0;
    meetingStartMarkerId = null;
    renderTranscriptChunks();
  }
}

// =====================================
// エクスポート
// =====================================
function openExportModal() {
  updateExportPreview();
  document.getElementById('exportModal').classList.add('active');

  // チェックボックスの変更時にプレビューを更新
  const checkboxes = document.querySelectorAll('.export-option input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.removeEventListener('change', updateExportPreview);
    cb.addEventListener('change', updateExportPreview);
  });
}

function updateExportPreview() {
  const preview = generateExportMarkdown(getExportOptions());
  document.getElementById('exportPreview').textContent = preview;
}

function getExportOptions() {
  var getChecked = function(id) {
    var el = document.getElementById(id);
    return el ? el.checked : true;
  };
  return {
    minutes: getChecked('exportMinutes'),
    summary: getChecked('exportSummary'),
    opinion: getChecked('exportOpinion'),
    idea: getChecked('exportIdea'),
    qa: getChecked('exportQA'),
    transcript: getChecked('exportTranscript'),
    cost: getChecked('exportCost')
  };
}

function setExportPreset(preset) {
  const checkboxes = {
    minutes: document.getElementById('exportMinutes'),
    summary: document.getElementById('exportSummary'),
    opinion: document.getElementById('exportOpinion'),
    idea: document.getElementById('exportIdea'),
    qa: document.getElementById('exportQA'),
    transcript: document.getElementById('exportTranscript'),
    cost: document.getElementById('exportCost')
  };

  const presets = {
    all: { minutes: true, summary: true, opinion: true, idea: true, qa: true, transcript: true, cost: true },
    minutes: { minutes: true, summary: false, opinion: false, idea: false, qa: false, transcript: false, cost: false },
    ai: { minutes: false, summary: true, opinion: true, idea: true, qa: true, transcript: false, cost: false },
    none: { minutes: false, summary: false, opinion: false, idea: false, qa: false, transcript: false, cost: false }
  };

  const selected = presets[preset] || presets.all;

  Object.keys(checkboxes).forEach(key => {
    if (checkboxes[key]) {
      checkboxes[key].checked = selected[key];
    }
  });

  updateExportPreview();
}

function closeExportModal() {
  document.getElementById('exportModal').classList.remove('active');
}

function closeWelcomeModal() {
  document.getElementById('welcomeModal').classList.remove('active');
}

function generateExportMarkdown(options = null) {
  // デフォルトは全て有効
  const opts = options || {
    minutes: true, summary: true, opinion: true, idea: true,
    qa: true, transcript: true, cost: true
  };

  const now = new Date().toLocaleString(I18n.getLanguage() === 'ja' ? 'ja-JP' : 'en-US');
  const total = costs.transcript.total + costs.llm.total;

  let md = `# ${t('export.document.title')}\n\n`;
  md += `**${t('export.document.datetime')}** ${now}\n\n`;

  // 選択された項目がない場合の警告
  const hasAnySelection = Object.values(opts).some(v => v);
  if (!hasAnySelection) {
    md += `⚠️ ${t('export.document.noSelection')}\n`;
    return md;
  }

  // 1. 議事録（最重要 - 一番上に配置）
  if (opts.minutes && aiResponses.minutes) {
    md += `---\n\n`;
    md += `## 📝 ${t('export.document.sectionMinutes')}\n\n`;
    md += `${aiResponses.minutes}\n\n`;
  }

  // 2. AI回答（要約・意見・アイデア）- 配列形式でタイムスタンプ付き
  const showSummary = opts.summary && aiResponses.summary.length > 0;
  const showOpinion = opts.opinion && aiResponses.opinion.length > 0;
  const showIdea = opts.idea && aiResponses.idea.length > 0;
  const hasAIResponses = showSummary || showOpinion || showIdea;

  // 配列形式のAI回答をフォーマット
  const formatAIResponses = (entries, label, emoji) => {
    if (entries.length === 1) {
      // 1件の場合はシンプルに
      return `### ${emoji} ${label}\n\n*${entries[0].timestamp}*\n\n${entries[0].content}\n\n`;
    }
    // 複数件の場合は番号付き
    return entries.map((entry, i) => {
      const header = `#### ${emoji} ${label} #${i + 1}（${entry.timestamp}）\n\n`;
      const content = `${entry.content}\n\n`;
      return header + content + (i < entries.length - 1 ? '---\n\n' : '');
    }).join('');
  };

  if (hasAIResponses) {
    md += `---\n\n`;
    md += `## 🤖 ${t('export.document.sectionAI')}\n\n`;

    if (showSummary) {
      md += formatAIResponses(aiResponses.summary, t('export.items.summary'), '📋');
    }
    if (showOpinion) {
      md += formatAIResponses(aiResponses.opinion, t('export.items.opinion'), '💭');
    }
    if (showIdea) {
      md += formatAIResponses(aiResponses.idea, t('export.items.idea'), '💡');
    }
  }

  // 3. Q&A
  if (opts.qa && aiResponses.custom.length > 0) {
    md += `---\n\n`;
    md += `## ❓ ${t('export.items.qa')}\n\n`;
    aiResponses.custom.forEach((qa, i) => {
      md += `### Q${i+1}: ${qa.q}\n\n${qa.a}\n\n`;
    });
  }

  // 4. 文字起こし（参照用 - 折りたたみ）
  if (opts.transcript) {
    md += `---\n\n`;
    md += `## 📜 ${t('export.document.sectionTranscript')}\n\n`;
    // フィルタリングされたテキストを使用
    const transcriptText = getFilteredTranscriptText() || t('export.document.none');
    const lineCount = transcriptText.split('\n').filter(l => l.trim()).length;
    md += `<details>\n`;
    md += `<summary>${t('export.document.linesCount', { n: lineCount })}</summary>\n\n`;
    md += `${transcriptText}\n\n`;
    md += `</details>\n\n`;
  }

  // 5. コスト詳細（付録）
  if (opts.cost) {
    md += `---\n\n`;
    md += `## 💰 ${t('export.document.sectionCost')}\n\n`;
    md += `### ${t('export.document.costStt')}\n`;
    md += `- ${t('export.document.costProcessingTime')}: ${formatDuration(costs.transcript.duration)}\n`;
    md += `- ${t('export.document.costApiCalls')}: ${costs.transcript.calls}\n`;
    md += `- OpenAI Whisper: ${formatCost(costs.transcript.byProvider.openai)}\n`;
    md += `- Deepgram: ${formatCost(costs.transcript.byProvider.deepgram)}\n`;
    md += `- AssemblyAI: ${formatCost(costs.transcript.byProvider.assemblyai)}\n`;
    md += `- ${t('export.document.costSubtotal')}: ${formatCost(costs.transcript.total)}\n\n`;
    md += `### ${t('export.document.costLlm')}\n`;
    md += `- ${t('export.document.costInputTokens')}: ${formatNumber(costs.llm.inputTokens)}\n`;
    md += `- ${t('export.document.costOutputTokens')}: ${formatNumber(costs.llm.outputTokens)}\n`;
    md += `- ${t('export.document.costApiCalls')}: ${costs.llm.calls}\n`;
    md += `- Gemini: ${formatCost(costs.llm.byProvider.gemini)}\n`;
    md += `- Claude: ${formatCost(costs.llm.byProvider.claude)}\n`;
    md += `- OpenAI: ${formatCost(costs.llm.byProvider.openai)}\n`;
    md += `- Groq: ${formatCost(costs.llm.byProvider.groq)}\n`;
    md += `- ${t('export.document.costSubtotal')}: ${formatCost(costs.llm.total)}\n\n`;
    md += `### ${t('export.document.costTotal')}\n`;
    md += `**${formatCost(total)}**\n\n`;
    md += `---\n`;
    md += `*${t('export.document.costDisclaimer')}*\n`;
  }

  return md;
}

function downloadExport() {
  const options = getExportOptions();

  // 何も選択されていない場合は警告
  const hasAny = Object.values(options).some(v => v);
  if (!hasAny) {
    showToast(t('toast.export.selectItems'), 'warning');
    return;
  }

  const md = generateExportMarkdown(options);
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meeting-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);

  closeExportModal();
  showToast(t('toast.export.success'), 'success');
}

// =====================================
// LLMインジケーター
// =====================================
function updateLLMIndicator() {
  const indicator = document.getElementById('llmIndicator');
  if (!indicator) return;

  const llm = getAvailableLlm();
  
  if (llm) {
    const providerNames = {
      gemini: 'Gemini',
      claude: 'Claude',
      openai: 'OpenAI',
      openai_llm: 'ChatGPT',
      groq: 'Groq'
    };
    const providerEmoji = {
      gemini: '✨',
      claude: '🧠',
      openai: '🚀',
      openai_llm: '🚀',
      groq: '⚡'
    };
    indicator.textContent = `${providerEmoji[llm.provider] || '🤖'} ${providerNames[llm.provider] || llm.provider}`;
    indicator.classList.remove('no-api');
    indicator.title = `使用中LLM: ${llm.model}`;
  } else {
    indicator.textContent = '⚠️ API未設定';
    indicator.classList.add('no-api');
    indicator.title = 'APIキーを設定してください';
  }
  // ボタン状態も同期
  updateLLMButtonsState();
}

// LLM未設定時にAIボタンを無効化
function updateLLMButtonsState() {
  var llm = getAvailableLlm();
  var buttons = document.querySelectorAll('.ask-ai-btn');

  for (var i = 0; i < buttons.length; i++) {
    var btn = buttons[i];
    // 議事録ボタンは別ロジックで制御されるためスキップ
    if (btn.id === 'minutesBtn') continue;

    if (!llm) {
      btn.disabled = true;
      btn.classList.add('disabled');
      btn.title = 'LLM APIキーが未設定です';
    } else {
      btn.disabled = false;
      btn.classList.remove('disabled');
      btn.title = '';
    }
  }
}
