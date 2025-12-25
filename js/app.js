// =====================================
// グローバル変数
// =====================================
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let transcriptIntervalId = null;
let fullTranscript = '';

// 停止時のレース防止用
let isStopping = false;
let finalStopPromise = null;
let finalStopResolve = null;

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
  'assemblyai_realtime', // streaming (WebSocket)
  'gcp_stt_proxy'     // streaming (WebSocket via backend proxy)
]);

// chunked系プロバイダー
const CHUNKED_PROVIDERS = new Set(['openai_stt']);

// streaming系プロバイダー
const STREAMING_PROVIDERS = new Set([
  'deepgram_realtime',
  'assemblyai_realtime',
  'gcp_stt_proxy'
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
      // Deepgram Nova-2 - $0.0043/minute (pay-as-you-go)
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
  summary: '',
  opinion: '',
  idea: '',
  custom: [] // Q&A形式で蓄積
};

function safeURL(input) {
  try {
    const url = new URL(input, window.location.origin);
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
  // セキュリティオプション：ブラウザを閉じたらクリア
  if (SecureStorage.getOption('clearOnClose', false)) {
    // sessionStorageにフラグがなければ、新しいセッション
    if (!sessionStorage.getItem('_session_active')) {
      SecureStorage.clearApiKeys();
    }
  }
  sessionStorage.setItem('_session_active', 'true');

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

  const recordBtn = document.getElementById('recordBtn');
  if (recordBtn) {
    recordBtn.addEventListener('click', toggleRecording);
  }

  const exportBtn = document.getElementById('openExportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', openExportModal);
  }

  const clearTranscriptBtn = document.getElementById('clearTranscriptBtn');
  if (clearTranscriptBtn) {
    clearTranscriptBtn.addEventListener('click', clearTranscript);
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
      const type = btn.getAttribute('data-ai-type');
      if (type) {
        askAI(type);
      }
    });
  });

  const askCustomBtn = document.getElementById('askCustomBtn');
  if (askCustomBtn) {
    askCustomBtn.addEventListener('click', () => askAI('custom'));
  }

  const customQuestionInput = document.getElementById('customQuestion');
  if (customQuestionInput) {
    customQuestionInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
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
});

// 録音機能
// =====================================
async function toggleRecording() {
  if (isRecording) {
    await stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
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
    showToast(validationResult.message, 'error');
    if (validationResult.redirectToConfig) {
      navigateTo('config.html');
    }
    return;
  }

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
    showToast(`録音を開始しました（${providerName}）`, 'success');

  } catch (err) {
    console.error('録音開始エラー:', err);
    showToast(`録音の開始に失敗しました: ${err.message}`, 'error');
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
    case 'gcp_stt_proxy': {
      const url = SecureStorage.getOption('gcpProxyUrl', '');
      if (!url) {
        return { valid: false, message: 'GCP STTにはバックエンドURLが必要です', redirectToConfig: true };
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
    'assemblyai_realtime': 'AssemblyAI Realtime',
    'gcp_stt_proxy': 'GCP STT'
  };
  return names[provider] || provider;
}

// =====================================
// Chunked系録音（OpenAI Whisper）
// =====================================
async function startChunkedRecording(provider) {
  console.log('[Chunked] Starting recording for provider:', provider);

  currentAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

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
    showToast(`文字起こしエラー: ${error.message}`, 'error');
  });

  await currentSTTProvider.start();

  // MediaRecorderを開始
  startNewMediaRecorder();

  // 定期的にstop/restartで完結したBlobを生成
  const interval = parseInt(document.getElementById('transcriptInterval').value) * 1000;
  transcriptIntervalId = setInterval(stopAndRestartRecording, interval);
}

// =====================================
// Streaming系録音（Deepgram/AssemblyAI/GCP）
// =====================================
async function startStreamingRecording(provider) {
  console.log('[Streaming] Starting recording for provider:', provider);

  // プロバイダーインスタンスを作成
  switch (provider) {
    case 'deepgram_realtime':
      currentSTTProvider = new DeepgramWSProvider({
        apiKey: SecureStorage.getApiKey('deepgram'),
        model: SecureStorage.getModel('deepgram') || 'nova-2'
      });
      break;
    case 'assemblyai_realtime':
      currentSTTProvider = new AssemblyAIWSProvider({
        apiKey: SecureStorage.getApiKey('assemblyai')
      });
      break;
    case 'gcp_stt_proxy':
      currentSTTProvider = new GCPProxyWSProvider({
        proxyUrl: SecureStorage.getOption('gcpProxyUrl'),
        authToken: SecureStorage.getOption('gcpProxyToken')
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
    showToast(`文字起こしエラー: ${error.message}`, 'error');
  });

  currentSTTProvider.setOnStatusChange((status) => {
    console.log('[Streaming] Status:', status);
    if (status === 'connected') {
      updateStatusBadge('🎙️ 接続中', 'recording');
    } else if (status === 'reconnecting') {
      updateStatusBadge('🔄 再接続中', 'ready');
    } else if (status === 'disconnected') {
      updateStatusBadge('⚠️ 切断', 'ready');
    }
  });

  // WebSocket接続を開始
  await currentSTTProvider.start();

  // PCMストリームプロセッサを作成
  pcmStreamProcessor = new PCMStreamProcessor({
    sampleRate: 16000,
    sendInterval: 100
  });

  pcmStreamProcessor.setOnAudioData((pcmData) => {
    if (currentSTTProvider && currentSTTProvider.isConnected) {
      currentSTTProvider.sendAudioData(pcmData);
    }
  });

  pcmStreamProcessor.setOnError((error) => {
    console.error('[Streaming] Audio error:', error);
    showToast(`音声処理エラー: ${error.message}`, 'error');
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
    // 確定結果を履歴に追加
    fullTranscript += `[${timestamp}] ${processedText}\n`;
    document.getElementById('transcriptText').textContent = fullTranscript;
  } else {
    // 途中結果を表示（オプション）
    // partialTranscriptを表示するUI要素があれば更新
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
  showToast('録音を停止しました', 'info');
}

// キュー方式で直列化
const transcriptionQueue = [];
let isProcessingQueue = false;
let blobCounter = 0;  // Blob識別用カウンター
let lastTranscriptTail = '';  // 前チャンクの末尾（Whisper prompt用）

// 完結したBlobをキューに追加して処理
async function processCompleteBlob(audioBlob) {
  if (!audioBlob || audioBlob.size < 1000) {
    console.log('Audio blob too small, skipping:', audioBlob?.size);
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
  console.log('Current STT Provider:', currentSTTProvider?.getInfo?.() || 'none');
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
        showToast(`文字起こしエラー: ${err.message}`, 'error');
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
    if (transcriptionQueue.length > 0) {
      console.log('[processQueue] New items enqueued during processing, restarting...');
      processQueue();
      return;
    }

    // ★本当に空のときだけ解放
    resolveQueueDrain();
  }
}

// キューが空になるまで待機
function waitForQueueDrain() {
  if (transcriptionQueue.length === 0 && !isProcessingQueue) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    queueDrainResolvers.push(resolve);
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

// ユーザー辞書（固有名詞のヒント）- 設定画面から更新可能
// ローマ字＋カタカナ併記で認識精度向上（OpenAI推奨）
let whisperUserDictionary = 'AI Meeting Assistant, OpenAI, Anthropic, Gemini, Web Speech API, Whisper';

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
  formData.append('language', 'ja');

  // promptパラメータを追加（空でない場合のみ）
  if (prompt) {
    formData.append('prompt', prompt);
    console.log('Using Whisper prompt:', prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''));
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
  const providers = ['claude', 'openai', 'gemini', 'groq']; // 優先順位

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
    groq: 'llama-3.1-70b-versatile'
  };
  return defaults[provider];
}

// =====================================
// AI質問機能
// =====================================
async function askAI(type) {
  const transcript = fullTranscript.trim();
  if (!transcript) {
    alert('文字起こしがありません');
    return;
  }

  // 選択テキストがあれば、それを対象にする
  const selection = window.getSelection().toString().trim();
  const targetText = selection || transcript;

  // 使用可能なLLMを自動選択
  const llm = getAvailableLlm();

  if (!llm) {
    alert('LLM用のAPIキーが設定されていません。\n設定画面でAPIキーを入力してください。');
    navigateTo('config.html');
    return;
  }

  const provider = llm.provider;

  let prompt = '';
  let customQ = '';

  switch(type) {
    case 'summary':
      prompt = `以下の会議内容を簡潔に要約してください。重要なポイントを箇条書きでまとめてください。\n\n${targetText}`;
      break;
    case 'opinion':
      prompt = `以下の会議内容について、AIとしての意見や分析を述べてください。改善点や注意点があれば指摘してください。\n\n${targetText}`;
      break;
    case 'idea':
      prompt = `以下の会議内容を踏まえて、新しいアイデアや提案を3つ挙げてください。\n\n${targetText}`;
      break;
    case 'custom':
      customQ = document.getElementById('customQuestion').value.trim();
      if (!customQ) {
        alert('質問を入力してください');
        return;
      }
      prompt = `以下の会議内容について質問に答えてください。\n\n【会議内容】\n${targetText}\n\n【質問】\n${customQ}`;
      document.getElementById('customQuestion').value = '';
      break;
  }

  // タブを切り替え
  switchTab(type);

  // ローディング表示
  if (type === 'custom') {
    const qaHistory = document.getElementById('qa-history');
    const qaItem = document.createElement('div');
    qaItem.className = 'qa-item';

    const questionEl = document.createElement('div');
    questionEl.className = 'qa-question';
    questionEl.textContent = `Q: ${customQ}`;

    const answerEl = document.createElement('div');
    answerEl.className = 'qa-answer';
    const loading = document.createElement('span');
    loading.className = 'loading';
    answerEl.appendChild(loading);
    answerEl.appendChild(document.createTextNode(' 回答を生成中...'));

    qaItem.appendChild(questionEl);
    qaItem.appendChild(answerEl);
    qaHistory.appendChild(qaItem);
  } else {
    const responseEl = document.getElementById(`response-${type}`);
    responseEl.textContent = '';
    const loading = document.createElement('span');
    loading.className = 'loading';
    responseEl.appendChild(loading);
    responseEl.appendChild(document.createTextNode(' 回答を生成中...'));
  }

  try {
    const response = await callLLM(provider, prompt);

    if (type === 'custom') {
      // Q&A履歴を更新
      const qaItems = document.querySelectorAll('#qa-history .qa-item');
      const lastItem = qaItems[qaItems.length - 1];
      lastItem.querySelector('.qa-answer').textContent = response;
      aiResponses.custom.push({ q: customQ, a: response });
    } else if (type === 'summary') {
      // 要約は上書き
      document.getElementById(`response-${type}`).textContent = response;
      aiResponses[type] = response;
    } else {
      // 意見・アイデアは蓄積
      const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      const newResponse = `【${timestamp}】\n${response}`;
      aiResponses[type] = aiResponses[type] ? `${aiResponses[type]}\n\n---\n\n${newResponse}` : newResponse;
      document.getElementById(`response-${type}`).textContent = aiResponses[type];
    }
  } catch (err) {
    console.error('AI呼び出しエラー:', err);
    const errorMsg = `エラーが発生しました: ${err.message}`;
    if (type === 'custom') {
      const qaItems = document.querySelectorAll('#qa-history .qa-item');
      const lastItem = qaItems[qaItems.length - 1];
      lastItem.querySelector('.qa-answer').textContent = errorMsg;
    } else {
      document.getElementById(`response-${type}`).textContent = errorMsg;
    }
  }
}

async function callLLM(provider, prompt) {
  const apiKey = SecureStorage.getApiKey(provider);
  const model = SecureStorage.getModel(provider) || getDefaultModel(provider);

  let response, data, text;
  let inputTokens = 0, outputTokens = 0;

  switch(provider) {
    case 'gemini':
      response = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );
      data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Gemini API error');
      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      inputTokens = data.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4);
      outputTokens = data.usageMetadata?.candidatesTokenCount || Math.ceil(text.length / 4);
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
      if (!response.ok) throw new Error(data.error?.message || 'Claude API error');
      text = data.content?.[0]?.text || '';
      inputTokens = data.usage?.input_tokens || Math.ceil(prompt.length / 4);
      outputTokens = data.usage?.output_tokens || Math.ceil(text.length / 4);
      break;

    case 'openai':
      response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'OpenAI API error');
      text = data.choices?.[0]?.message?.content || '';
      inputTokens = data.usage?.prompt_tokens || Math.ceil(prompt.length / 4);
      outputTokens = data.usage?.completion_tokens || Math.ceil(text.length / 4);
      break;

    case 'groq':
      response = await fetchWithRetry('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Groq API error');
      text = data.choices?.[0]?.message?.content || '';
      inputTokens = data.usage?.prompt_tokens || Math.ceil(prompt.length / 4);
      outputTokens = data.usage?.completion_tokens || Math.ceil(text.length / 4);
      break;
  }

  // コスト計算（詳細版）
  const pricing = PRICING[provider]?.[model] || { input: 1, output: 3 };
  const cost = ((inputTokens * pricing.input + outputTokens * pricing.output) / 1000000) * PRICING.yenPerDollar;

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
  const defaults = {
    gemini: 'gemini-2.0-flash-exp',
    claude: 'claude-sonnet-4-20250514',
    openai: 'gpt-4o',
    groq: 'llama-3.1-70b-versatile'
  };
  return defaults[provider];
}

// =====================================
// UI更新
// =====================================
function updateUI() {
  const btn = document.getElementById('recordBtn');
  const badge = document.getElementById('statusBadge');

  if (isRecording) {
    btn.textContent = '⏹ 録音停止';
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-danger');
    badge.textContent = '🔴 録音中';
    badge.classList.remove('status-ready');
    badge.classList.add('status-recording');
  } else {
    btn.textContent = '🎤 録音開始';
    btn.classList.remove('btn-danger');
    btn.classList.add('btn-primary');
    badge.textContent = '⏸ 待機中';
    badge.classList.remove('status-recording');
    badge.classList.add('status-ready');
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

function clearTranscript() {
  if (confirm('文字起こしをクリアしますか？')) {
    fullTranscript = '';
    document.getElementById('transcriptText').textContent = '';
  }
}

// =====================================
// エクスポート
// =====================================
function openExportModal() {
  const preview = generateExportMarkdown();
  document.getElementById('exportPreview').textContent = preview;
  document.getElementById('exportModal').classList.add('active');
}

function closeExportModal() {
  document.getElementById('exportModal').classList.remove('active');
}

function closeWelcomeModal() {
  document.getElementById('welcomeModal').classList.remove('active');
}

function generateExportMarkdown() {
  const now = new Date().toLocaleString('ja-JP');
  const total = costs.transcript.total + costs.llm.total;

  let md = `# 会議記録\n\n`;
  md += `**日時:** ${now}\n\n`;
  md += `---\n\n`;
  md += `## 📝 文字起こし\n\n`;
  md += fullTranscript || '（なし）';
  md += `\n\n---\n\n`;

  if (aiResponses.summary) {
    md += `## 📋 要約\n\n${aiResponses.summary}\n\n`;
  }
  if (aiResponses.opinion) {
    md += `## 💭 意見\n\n${aiResponses.opinion}\n\n`;
  }
  if (aiResponses.idea) {
    md += `## 💡 アイデア\n\n${aiResponses.idea}\n\n`;
  }
  if (aiResponses.custom.length > 0) {
    md += `## ❓ Q&A\n\n`;
    aiResponses.custom.forEach((qa, i) => {
      md += `### Q${i+1}: ${qa.q}\n\n${qa.a}\n\n`;
    });
  }

  md += `---\n\n`;
  md += `## 💰 コスト詳細\n\n`;
  md += `### 文字起こし（STT）\n`;
  md += `- 処理時間: ${formatDuration(costs.transcript.duration)}\n`;
  md += `- API呼び出し: ${costs.transcript.calls}回\n`;
  md += `- OpenAI Whisper: ${formatCost(costs.transcript.byProvider.openai)}\n`;
  md += `- Deepgram: ${formatCost(costs.transcript.byProvider.deepgram)}\n`;
  md += `- AssemblyAI: ${formatCost(costs.transcript.byProvider.assemblyai)}\n`;
  md += `- 小計: ${formatCost(costs.transcript.total)}\n\n`;
  md += `### LLM（AI回答）\n`;
  md += `- 入力トークン: ${formatNumber(costs.llm.inputTokens)}\n`;
  md += `- 出力トークン: ${formatNumber(costs.llm.outputTokens)}\n`;
  md += `- API呼び出し: ${costs.llm.calls}回\n`;
  md += `- Gemini: ${formatCost(costs.llm.byProvider.gemini)}\n`;
  md += `- Claude: ${formatCost(costs.llm.byProvider.claude)}\n`;
  md += `- OpenAI: ${formatCost(costs.llm.byProvider.openai)}\n`;
  md += `- Groq: ${formatCost(costs.llm.byProvider.groq)}\n`;
  md += `- 小計: ${formatCost(costs.llm.total)}\n\n`;
  md += `### 合計\n`;
  md += `**${formatCost(total)}**\n\n`;
  md += `---\n`;
  md += `*この金額は概算です。実際の請求額とは異なる場合があります。*\n`;

  return md;
}

function downloadExport() {
  const md = generateExportMarkdown();
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meeting-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}
