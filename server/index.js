/**
 * GCP Speech-to-Text WebSocket Proxy Server
 *
 * ブラウザからのWebSocket接続を受け付け、
 * Google Cloud Speech-to-Text API (gRPC) に中継する
 *
 * 環境変数:
 *   PORT: サーバーポート（デフォルト: 8080）
 *   GOOGLE_APPLICATION_CREDENTIALS: GCPサービスアカウントキーのパス
 *   AUTH_TOKEN: クライアント認証用トークン（オプション）
 */

require('dotenv').config();
const WebSocket = require('ws');
const http = require('http');
const speech = require('@google-cloud/speech');

const PORT = process.env.PORT || 8080;
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

// GCP Speech-to-Text クライアント
const speechClient = new speech.SpeechClient();

// HTTP サーバー
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('GCP STT Proxy Server is running\n');
});

// WebSocket サーバー
const wss = new WebSocket.Server({ server });

console.log(`[Server] Starting GCP STT Proxy on port ${PORT}`);

wss.on('connection', (ws, req) => {
  console.log('[Server] New WebSocket connection');

  // URLパラメータを解析
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const language = url.searchParams.get('language') || 'ja-JP';
  const encoding = url.searchParams.get('encoding') || 'LINEAR16';
  const sampleRate = parseInt(url.searchParams.get('sampleRate')) || 16000;
  const token = url.searchParams.get('token') || '';

  // トークン認証（設定されている場合）
  if (AUTH_TOKEN && token !== AUTH_TOKEN) {
    console.warn('[Server] Authentication failed');
    ws.send(JSON.stringify({ type: 'error', error: 'Authentication failed' }));
    ws.close(1008, 'Authentication failed');
    return;
  }

  console.log(`[Server] Config: language=${language}, encoding=${encoding}, sampleRate=${sampleRate}`);

  // Streaming認識を開始
  let recognizeStream = null;

  const startRecognitionStream = () => {
    const config = {
      encoding: encoding,
      sampleRateHertz: sampleRate,
      languageCode: language,
      enableAutomaticPunctuation: true,
      model: 'latest_long', // 長時間音声用モデル
    };

    const request = {
      config: config,
      interimResults: true, // 途中結果を有効化
    };

    recognizeStream = speechClient
      .streamingRecognize(request)
      .on('error', (error) => {
        console.error('[GCP] Recognition error:', error);
        ws.send(JSON.stringify({ type: 'error', error: error.message }));
      })
      .on('data', (data) => {
        const result = data.results[0];
        if (result) {
          const transcript = result.alternatives[0]?.transcript || '';
          const isFinal = result.isFinal || false;

          console.log(`[GCP] ${isFinal ? 'Final' : 'Partial'}: ${transcript}`);

          ws.send(JSON.stringify({
            type: 'transcript',
            text: transcript,
            isFinal: isFinal,
            confidence: result.alternatives[0]?.confidence || 0
          }));
        }
      })
      .on('end', () => {
        console.log('[GCP] Recognition stream ended');
      });

    console.log('[GCP] Recognition stream started');
    ws.send(JSON.stringify({ type: 'connected', message: 'GCP STT connected' }));
  };

  // 初期ストリームを開始
  startRecognitionStream();

  // クライアントからの音声データを受信
  ws.on('message', (message) => {
    // バイナリデータの場合は音声データ
    if (message instanceof Buffer) {
      if (recognizeStream) {
        recognizeStream.write(message);
      }
    } else {
      // JSONメッセージの場合はコマンド
      try {
        const data = JSON.parse(message);
        if (data.type === 'stop') {
          console.log('[Server] Stopping recognition');
          if (recognizeStream) {
            recognizeStream.end();
            recognizeStream = null;
          }
        } else if (data.type === 'restart') {
          console.log('[Server] Restarting recognition');
          if (recognizeStream) {
            recognizeStream.end();
          }
          startRecognitionStream();
        }
      } catch (e) {
        console.error('[Server] Failed to parse message:', e);
      }
    }
  });

  ws.on('close', () => {
    console.log('[Server] WebSocket connection closed');
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }
  });

  ws.on('error', (error) => {
    console.error('[Server] WebSocket error:', error);
    if (recognizeStream) {
      recognizeStream.end();
      recognizeStream = null;
    }
  });
});

// サーバー起動
server.listen(PORT, () => {
  console.log(`[Server] GCP STT Proxy listening on port ${PORT}`);
  console.log(`[Server] WebSocket endpoint: ws://localhost:${PORT}`);
  if (AUTH_TOKEN) {
    console.log('[Server] Authentication is enabled');
  }
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('[Server] Received SIGTERM, shutting down...');
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});
