/**
 * Recording Monitor
 *
 * スマホでの画面スリープ・バックグラウンド遷移・着信による
 * 録音中断を検知し、安全に停止してユーザーに再開を促す
 *
 * 方針：自動復帰は行わず、中断時は安全停止＋データ保全＋再開案内
 *
 * Issue #18 対応
 */

class RecordingMonitor {
  constructor() {
    this.isMonitoring = false;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.mediaStream = null;

    // コールバック
    this.onInterruption = null;      // (reason, details) => void
    this.onVisibilityChange = null;  // (isVisible) => void
    this.onStateChange = null;       // (state) => void

    // 状態追跡
    this.lastState = {
      visibility: 'visible',
      audioContextState: null,
      mediaRecorderState: null,
      streamActive: true
    };

    // イベントログ（デバッグ用）
    this.eventLog = [];
    this.maxLogEntries = 100;

    // バインドされたハンドラ（removeEventListener用に保持）
    this._boundHandlers = {
      visibilityChange: this._handleVisibilityChange.bind(this),
      pageHide: this._handlePageHide.bind(this),
      pageShow: this._handlePageShow.bind(this),
      focus: this._handleFocus.bind(this),
      blur: this._handleBlur.bind(this),
      freeze: this._handleFreeze.bind(this),
      resume: this._handleResume.bind(this)
    };

    // リスナー登録済みフラグ（多重登録防止）
    this._listenersRegistered = false;
  }

  /**
   * 監視を開始
   */
  start(options = {}) {
    // 多重開始防止（idempotent）
    if (this.isMonitoring) {
      console.warn('[RecordingMonitor] Already monitoring, updating references only');
      this.updateReferences(options);
      return;
    }

    this.mediaRecorder = options.mediaRecorder || null;
    this.audioContext = options.audioContext || null;
    this.mediaStream = options.mediaStream || null;

    // イベントリスナーを登録（多重登録防止）
    if (!this._listenersRegistered) {
      document.addEventListener('visibilitychange', this._boundHandlers.visibilityChange);
      window.addEventListener('pagehide', this._boundHandlers.pageHide);
      window.addEventListener('pageshow', this._boundHandlers.pageShow);
      window.addEventListener('focus', this._boundHandlers.focus);
      window.addEventListener('blur', this._boundHandlers.blur);

      // Page Lifecycle API（Chrome/Edge のみ）
      if ('onfreeze' in document) {
        document.addEventListener('freeze', this._boundHandlers.freeze);
        document.addEventListener('resume', this._boundHandlers.resume);
      }

      this._listenersRegistered = true;
    }

    // MediaStreamTrack の終了を監視
    this._setupStreamMonitoring();

    // AudioContext の状態変化を監視
    this._setupAudioContextMonitoring();

    this.isMonitoring = true;
    this._log('start', 'Monitoring started');
    console.log('[RecordingMonitor] Monitoring started');
  }

  /**
   * 監視を停止（必ずリスナーを解除）
   */
  stop() {
    // 多重停止OK（idempotent）
    if (!this.isMonitoring && !this._listenersRegistered) {
      return;
    }

    // イベントリスナーを確実に解除
    if (this._listenersRegistered) {
      try {
        document.removeEventListener('visibilitychange', this._boundHandlers.visibilityChange);
        window.removeEventListener('pagehide', this._boundHandlers.pageHide);
        window.removeEventListener('pageshow', this._boundHandlers.pageShow);
        window.removeEventListener('focus', this._boundHandlers.focus);
        window.removeEventListener('blur', this._boundHandlers.blur);

        if ('onfreeze' in document) {
          document.removeEventListener('freeze', this._boundHandlers.freeze);
          document.removeEventListener('resume', this._boundHandlers.resume);
        }
      } catch (e) {
        console.error('[RecordingMonitor] Error removing listeners:', e);
      }
      this._listenersRegistered = false;
    }

    // 参照をクリア
    this.isMonitoring = false;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.mediaStream = null;

    this._log('stop', 'Monitoring stopped');
    console.log('[RecordingMonitor] Monitoring stopped');
  }

  /**
   * 参照を更新（録音再開時など）
   */
  updateReferences(options) {
    if (options.mediaRecorder !== undefined) {
      this.mediaRecorder = options.mediaRecorder;
    }
    if (options.audioContext !== undefined) {
      this.audioContext = options.audioContext;
      this._setupAudioContextMonitoring();
    }
    if (options.mediaStream !== undefined) {
      this.mediaStream = options.mediaStream;
      this._setupStreamMonitoring();
    }
  }

  /**
   * 現在の状態を取得
   */
  getState() {
    return {
      visibility: document.visibilityState,
      audioContextState: this.audioContext?.state || null,
      mediaRecorderState: this.mediaRecorder?.state || null,
      streamActive: this._isStreamActive()
    };
  }

  /**
   * イベントログを取得（デバッグ用）
   */
  getEventLog() {
    return [...this.eventLog];
  }

  /**
   * ログをクリア
   */
  clearEventLog() {
    this.eventLog = [];
  }

  /**
   * MediaRecorderのデータを安全に回収してから停止
   * @returns {boolean} 停止操作を行ったか
   */
  safeStopMediaRecorder() {
    try {
      if (!this.mediaRecorder) return false;

      const state = this.mediaRecorder.state;
      if (state === 'inactive') return false;

      // 現在までのデータを回収
      if (typeof this.mediaRecorder.requestData === 'function') {
        try {
          this.mediaRecorder.requestData();
        } catch (e) {
          console.warn('[RecordingMonitor] requestData failed:', e);
        }
      }

      // 停止
      this.mediaRecorder.stop();
      console.log('[RecordingMonitor] MediaRecorder safely stopped');
      return true;
    } catch (e) {
      console.error('[RecordingMonitor] safeStopMediaRecorder error:', e);
      return false;
    }
  }

  /**
   * AudioContextの復帰を試みる（ベストエフォート）
   * @returns {Promise<boolean>}
   */
  async tryResumeAudioContext() {
    try {
      if (!this.audioContext) return false;
      if (this.audioContext.state !== 'suspended') return true;

      await this.audioContext.resume();
      console.log('[RecordingMonitor] AudioContext resumed');
      return true;
    } catch (e) {
      console.warn('[RecordingMonitor] AudioContext resume failed:', e);
      return false;
    }
  }

  // ========================================
  // イベントハンドラ（すべてtry/catchで保護）
  // ========================================

  _handleVisibilityChange() {
    try {
      const state = document.visibilityState;
      const previousState = this.lastState.visibility;
      this.lastState.visibility = state;

      this._log('visibilitychange', { from: previousState, to: state });
      console.log(`[RecordingMonitor] Visibility: ${previousState} → ${state}`);

      if (this.onVisibilityChange) {
        this.onVisibilityChange(state === 'visible');
      }

      if (state === 'hidden') {
        // バックグラウンドに移行
        this._notifyInterruption('background', { previousState });
      }

      this._emitStateChange();
    } catch (e) {
      console.error('[RecordingMonitor] visibilitychange handler error:', e);
    }
  }

  _handlePageHide(event) {
    try {
      this._log('pagehide', { persisted: event.persisted });
      console.log('[RecordingMonitor] Page hide, persisted:', event.persisted);

      if (!event.persisted) {
        this._notifyInterruption('page_unload', { persisted: false });
      }
    } catch (e) {
      console.error('[RecordingMonitor] pagehide handler error:', e);
    }
  }

  _handlePageShow(event) {
    try {
      this._log('pageshow', { persisted: event.persisted });
      console.log('[RecordingMonitor] Page show, persisted:', event.persisted);

      if (event.persisted) {
        // bfcache から復帰 - 状態確認のみ
        this._emitStateChange();
      }
    } catch (e) {
      console.error('[RecordingMonitor] pageshow handler error:', e);
    }
  }

  _handleFocus() {
    try {
      this._log('focus', {});
      console.log('[RecordingMonitor] Window focus');
      this._emitStateChange();
    } catch (e) {
      console.error('[RecordingMonitor] focus handler error:', e);
    }
  }

  _handleBlur() {
    try {
      this._log('blur', {});
      console.log('[RecordingMonitor] Window blur');
    } catch (e) {
      console.error('[RecordingMonitor] blur handler error:', e);
    }
  }

  _handleFreeze() {
    try {
      this._log('freeze', {});
      console.log('[RecordingMonitor] Page frozen (lifecycle API)');
      this._notifyInterruption('page_frozen', {});
    } catch (e) {
      console.error('[RecordingMonitor] freeze handler error:', e);
    }
  }

  _handleResume() {
    try {
      this._log('resume', {});
      console.log('[RecordingMonitor] Page resumed (lifecycle API)');
      this._emitStateChange();
    } catch (e) {
      console.error('[RecordingMonitor] resume handler error:', e);
    }
  }

  // ========================================
  // ストリーム・AudioContext 監視
  // ========================================

  _setupStreamMonitoring() {
    try {
      if (!this.mediaStream) return;

      const tracks = this.mediaStream.getTracks();
      tracks.forEach(track => {
        track.onended = () => {
          try {
            this._log('track_ended', { kind: track.kind, label: track.label });
            console.log(`[RecordingMonitor] Track ended: ${track.kind}`);
            this._notifyInterruption('stream_ended', { kind: track.kind });
          } catch (e) {
            console.error('[RecordingMonitor] track.onended error:', e);
          }
        };

        track.onmute = () => {
          try {
            this._log('track_muted', { kind: track.kind });
            console.log(`[RecordingMonitor] Track muted: ${track.kind}`);
          } catch (e) {
            console.error('[RecordingMonitor] track.onmute error:', e);
          }
        };

        track.onunmute = () => {
          try {
            this._log('track_unmuted', { kind: track.kind });
            console.log(`[RecordingMonitor] Track unmuted: ${track.kind}`);
          } catch (e) {
            console.error('[RecordingMonitor] track.onunmute error:', e);
          }
        };
      });
    } catch (e) {
      console.error('[RecordingMonitor] _setupStreamMonitoring error:', e);
    }
  }

  _setupAudioContextMonitoring() {
    try {
      if (!this.audioContext) return;

      this.audioContext.onstatechange = () => {
        try {
          const state = this.audioContext?.state;
          this._log('audiocontext_statechange', { state });
          console.log(`[RecordingMonitor] AudioContext state: ${state}`);

          if (state === 'suspended') {
            this._notifyInterruption('audiocontext_suspended', {});
          }

          this._emitStateChange();
        } catch (e) {
          console.error('[RecordingMonitor] audioContext.onstatechange error:', e);
        }
      };
    } catch (e) {
      console.error('[RecordingMonitor] _setupAudioContextMonitoring error:', e);
    }
  }

  _isStreamActive() {
    try {
      if (!this.mediaStream) return false;
      const tracks = this.mediaStream.getTracks();
      return tracks.length > 0 && tracks.every(t => t.readyState === 'live');
    } catch (e) {
      console.error('[RecordingMonitor] _isStreamActive error:', e);
      return false;
    }
  }

  // ========================================
  // 中断通知（自動復帰は行わない）
  // ========================================

  _notifyInterruption(reason, details = {}) {
    try {
      const state = this.getState();
      this._log('interruption', { reason, details, state });
      console.log(`[RecordingMonitor] Interruption: ${reason}`, details);

      if (this.onInterruption) {
        this.onInterruption(reason, { ...details, state });
      }
    } catch (e) {
      console.error('[RecordingMonitor] _notifyInterruption error:', e);
    }
  }

  // ========================================
  // ユーティリティ
  // ========================================

  _log(event, data) {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        event,
        data
      };
      this.eventLog.push(entry);

      // ログサイズを制限
      while (this.eventLog.length > this.maxLogEntries) {
        this.eventLog.shift();
      }
    } catch (e) {
      // ログ記録の失敗は無視
    }
  }

  _emitStateChange() {
    try {
      if (this.onStateChange) {
        this.onStateChange(this.getState());
      }
    } catch (e) {
      console.error('[RecordingMonitor] _emitStateChange error:', e);
    }
  }
}

// グローバルに公開
window.RecordingMonitor = RecordingMonitor;
