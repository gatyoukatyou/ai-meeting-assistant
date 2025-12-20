// =====================================
// グローバル変数
// =====================================
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let transcriptIntervalId = null;
let fullTranscript = '';

// コスト管理（詳細版）
let costs = {
  transcript: {
    total: 0,
    duration: 0,      // 処理した音声の秒数
    calls: 0,         // API呼び出し回数
    byProvider: {
      gemini: 0,
      openai: 0
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
  // 文字起こしAPI
  transcription: {
    gemini: {
      // Gemini 2.0 Flash - Audio input: $0.00001/second
      perSecond: 0.00001 * 150  // ¥0.0015/秒
    },
    openai: {
      // Whisper - $0.006/minute
      perMinute: 0.006 * 150  // ¥0.9/分
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
});

// 録音機能
// =====================================
async function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  const provider = document.getElementById('transcriptProvider').value;
  const apiKey = SecureStorage.getApiKey(provider);

  if (!apiKey) {
    alert(`${provider === 'gemini' ? 'Gemini' : 'OpenAI'} APIキーを設定してください`);
    navigateTo('config.html');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    audioChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.start();
    isRecording = true;
    updateUI();

    // 定期的に文字起こし
    const interval = parseInt(document.getElementById('transcriptInterval').value) * 1000;
    transcriptIntervalId = setInterval(processAudioChunk, interval);

  } catch (err) {
    console.error('録音開始エラー:', err);
    alert('マイクへのアクセスに失敗しました');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
  }
  if (transcriptIntervalId) {
    clearInterval(transcriptIntervalId);
    transcriptIntervalId = null;
  }

  // 残りの音声を処理
  if (audioChunks.length > 0) {
    processAudioChunk();
  }

  isRecording = false;
  updateUI();
}

async function processAudioChunk() {
  console.log('processAudioChunk called, chunks:', audioChunks.length);
  if (audioChunks.length === 0) return;

  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  console.log('Audio blob created, size:', audioBlob.size, 'bytes');
  audioChunks = [];

  // 新しい録音を開始
  if (isRecording && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    mediaRecorder.start();
  }

  try {
    const provider = document.getElementById('transcriptProvider').value;
    console.log('Transcription provider:', provider);
    const text = provider === 'openai'
      ? await transcribeWithWhisper(audioBlob)
      : await transcribeWithGemini(audioBlob);
    console.log('Transcription result:', text);

    if (text && text.trim()) {
      const timestamp = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      fullTranscript += `[${timestamp}] ${text}\n`;
      document.getElementById('transcriptText').textContent = fullTranscript;

      // スクロール
      const body = document.getElementById('transcriptBody');
      body.scrollTop = body.scrollHeight;
    }
  } catch (err) {
    console.error('文字起こしエラー:', err);
    alert(`文字起こしエラー: ${err.message}`);
  }
}

async function transcribeWithGemini(audioBlob) {
  console.log('transcribeWithGemini called');
  const geminiKey = SecureStorage.getApiKey('gemini');
  console.log('Gemini API key exists:', !!geminiKey);
  const base64Audio = await blobToBase64(audioBlob);
  console.log('Base64 audio length:', base64Audio.length);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: '以下の音声を日本語で文字起こししてください。話者が複数いる場合は区別してください。音声がない場合や聞き取れない場合は「（音声なし）」と返してください。' },
            { inline_data: { mime_type: 'audio/webm', data: base64Audio } }
          ]
        }]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // コスト計算
  const estimatedSeconds = Math.max(audioBlob.size / 4000, 1);
  const audioCost = estimatedSeconds * PRICING.transcription.gemini.perSecond;

  costs.transcript.duration += estimatedSeconds;
  costs.transcript.calls += 1;
  costs.transcript.byProvider.gemini += audioCost;
  costs.transcript.total += audioCost;

  updateCosts();
  checkCostAlert();

  return text.replace('（音声なし）', '').trim();
}

async function transcribeWithWhisper(audioBlob) {
  const openaiKey = SecureStorage.getApiKey('openai');

  // FormDataでファイルを送信
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'ja');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Whisper API error: ${response.status}`);
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
      response = await fetch(
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
      response = await fetch('https://api.anthropic.com/v1/messages', {
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
      response = await fetch('https://api.openai.com/v1/chat/completions', {
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
      response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

function updateCosts() {
  const total = costs.transcript.total + costs.llm.total;

  // 文字起こしコスト
  document.getElementById('transcriptCostTotal').textContent = formatCost(costs.transcript.total);
  document.getElementById('transcriptDuration').textContent = formatDuration(costs.transcript.duration);
  document.getElementById('transcriptCalls').textContent = `${costs.transcript.calls}回`;
  document.getElementById('geminiTranscriptCost').textContent = formatCost(costs.transcript.byProvider.gemini);
  document.getElementById('openaiTranscriptCost').textContent = formatCost(costs.transcript.byProvider.openai);

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
  md += `### 文字起こし\n`;
  md += `- 処理時間: ${formatDuration(costs.transcript.duration)}\n`;
  md += `- API呼び出し: ${costs.transcript.calls}回\n`;
  md += `- Gemini Audio: ${formatCost(costs.transcript.byProvider.gemini)}\n`;
  md += `- OpenAI Whisper: ${formatCost(costs.transcript.byProvider.openai)}\n`;
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
