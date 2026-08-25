import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import process from 'node:process';
import { ensureLocalStaticServer, getLocalServerConfig } from './local-static-server.mjs';

const PORT = Number(process.env.REALTIME_UI_PORT || process.env.PORT || 8091);

async function main() {
  const server = await ensureLocalStaticServer({ port: PORT });
  const { baseUrl } = getLocalServerConfig({ port: PORT });
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      localStorage.setItem('_visited', 'true');
      const listeners = target => {
        const handlers = new Map();
        target.addEventListener = (name, handler) => {
          const values = handlers.get(name) || [];
          values.push(handler);
          handlers.set(name, values);
        };
        target.emit = (name, value) => {
          (handlers.get(name) || []).forEach(handler => handler(value));
        };
        return target;
      };

      const track = {
        kind: 'audio',
        readyState: 'live',
        stopped: false,
        stop() {
          this.stopped = true;
          this.readyState = 'ended';
        }
      };
      const stream = {
        getAudioTracks: () => [track],
        getTracks: () => [track]
      };
      const remoteAudioStream = new MediaStream();

      class MockPeerConnection {
        constructor() {
          listeners(this);
          this.connectionState = 'connected';
          this.closed = false;
          this.addedTracks = [];
          window.__realtimeMock.peer = this;
        }

        addTrack(trackValue, streamValue) {
          this.addedTracks.push({ track: trackValue, stream: streamValue });
        }

        createDataChannel() {
          const channel = listeners({ readyState: 'open', closed: false, sent: [] });
          channel.send = message => channel.sent.push(message);
          channel.close = () => {
            channel.closed = true;
            channel.readyState = 'closed';
          };
          window.__realtimeMock.channel = channel;
          return channel;
        }

        async createOffer() {
          return { type: 'offer', sdp: 'v=0\r\nmock-offer' };
        }

        async setLocalDescription(description) {
          this.localDescription = description;
        }

        async setRemoteDescription(description) {
          this.remoteDescription = description;
          this.ontrack?.({ streams: [remoteAudioStream] });
        }

        close() {
          this.closed = true;
          this.connectionState = 'closed';
        }
      }

      window.__realtimeMock = { track, stream, remoteAudioStream, peer: null, channel: null };
      window.RTCPeerConnection = MockPeerConnection;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => stream
        }
      });
    });

    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error' || message.text().includes('[Realtime]')) {
        console.log(`[realtime-ui][browser] ${message.type()}: ${message.text()}`);
      }
    });
    page.on('pageerror', error => console.log(`[realtime-ui][pageerror] ${error.message}`));
    page.on('requestfailed', request =>
      console.log(
        `[realtime-ui][requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`
      )
    );
    await page.route('**/api/realtime/client-secret', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ value: 'ek_ui_mock_only' })
      });
    });
    await page.route('**/v1/realtime/calls', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/sdp',
        body: 'v=0\r\nmock-answer'
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('#realtimeStartBtn').waitFor();
    await page.locator('#realtimeStartBtn').click();
    try {
      await page.waitForFunction(
        () => document.querySelector('#realtimeStateBadge')?.dataset.state === 'connected'
      );
    } catch (error) {
      const state = await page.locator('#realtimeStateBadge').getAttribute('data-state');
      const errorText = await page.locator('#realtimeError').textContent();
      throw new Error(`${error.message} state=${state} realtimeError=${errorText}`, {
        cause: error
      });
    }

    const connectedSnapshot = await page.evaluate(() => ({
      state: document.querySelector('#realtimeStateBadge')?.dataset.state,
      audioAutoplay: document.querySelector('#realtimeAudio')?.autoplay,
      audioPlaysInline: document.querySelector('#realtimeAudio')?.hasAttribute('playsinline'),
      sentEvent: JSON.parse(window.__realtimeMock.channel.sent[0]).type
    }));
    assert.deepEqual(connectedSnapshot, {
      state: 'connected',
      audioAutoplay: true,
      audioPlaysInline: true,
      sentEvent: 'session.update'
    });

    await page.evaluate(() => {
      const emit = event =>
        window.__realtimeMock.channel.emit('message', { data: JSON.stringify(event) });
      emit({ type: 'response.created' });
      emit({ type: 'response.output_audio_transcript.done', transcript: 'モックAI回答です。' });
      emit({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: '利用者発話は保存しない'
      });
      emit({
        type: 'response.done',
        response: {
          usage: {
            total_tokens: 42,
            input_tokens: 24,
            output_tokens: 18,
            input_token_details: { audio_tokens: 24 },
            output_token_details: { audio_tokens: 18 }
          }
        }
      });
    });

    await page.getByText('モックAI回答です。').first().waitFor();
    const responseSnapshot = await page.evaluate(() => ({
      responseCount: document
        .querySelector('#realtimeResponseList')
        ?.textContent.includes('モックAI回答です。'),
      usage: document.querySelector('#realtimeTotalTokens')?.textContent,
      timelineAiCount: document.querySelectorAll('#timelineList .timeline-item[data-source="ai"]')
        .length,
      transcriptText: document.querySelector('#transcriptBody')?.textContent || ''
    }));
    assert.equal(responseSnapshot.responseCount, true);
    assert.equal(responseSnapshot.usage, '42');
    assert.equal(responseSnapshot.timelineAiCount, 1);
    assert.doesNotMatch(responseSnapshot.transcriptText, /利用者発話は保存しない/);

    await page.locator('#realtimeStopBtn').click();
    await page.waitForFunction(
      () => document.querySelector('#realtimeStateBadge')?.dataset.state === 'ended'
    );
    const stoppedSnapshot = await page.evaluate(() => ({
      state: document.querySelector('#realtimeStateBadge')?.dataset.state,
      trackStopped: window.__realtimeMock.track.stopped,
      peerClosed: window.__realtimeMock.peer.closed,
      channelClosed: window.__realtimeMock.channel.closed,
      audioStreamCleared: document.querySelector('#realtimeAudio')?.srcObject === null
    }));
    assert.deepEqual(stoppedSnapshot, {
      state: 'ended',
      trackStopped: true,
      peerClosed: true,
      channelClosed: true,
      audioStreamCleared: true
    });

    console.log('[realtime-ui] mock WebRTC start, response, usage, timeline, and cleanup passed');
  } finally {
    await browser.close();
    if (!server.reused) await server.stop();
  }
}

main().catch(error => {
  console.error(`[realtime-ui] ${error.message}`);
  process.exit(1);
});
