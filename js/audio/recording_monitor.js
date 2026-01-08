/**
 * Recording Monitor
 *
 * スマホでの画面スリープ・バックグラウンド遷移・着信による
 * 録音中断を検知し、可能な場合は復帰を試みる
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
    this.onInterruption = null;      // (reason, canRecover) => void
    this.onRecoveryAttempt = null;   // (reason) => void
    this.onRecoverySuccess = null;   // () => void
    this.onRecoveryFailed = null;    // (reason) => void
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

    // バインドされたハンドラ
    this._boundHandlers = {
      visibilityChange: this._handleVisibilityChange.bind(this),
      pageHide: this._handlePageHide.bind(this),
      pageShow: this._handlePageShow.bind(this),
      focus: this._handleFocus.bind(this),
      blur: this._handleBlur.bind(this),
      freeze: this._handleFreeze.bind(this),
      resume: this._handleResume.bind(this)
    };
  }

  /**
   * 監視を開始
   */
  start(options = {}) {
    if (this.isMonitoring) {
      console.warn('[RecordingMonitor] Already monitoring');
      return;
    }

    this.mediaRecorder = options.mediaRecorder || null;
    this.audioContext = options.audioContext || null;
    this.mediaStream = options.mediaStream || null;

    // イベントリスナーを登録
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

    // MediaStreamTrack の終了を監視
    if (this.mediaStream) {
      this._setupStreamMonitoring(this.mediaStream);
    }

    // AudioContext の状態変化を監視
    if (this.audioContext) {
      this._setupAudioContextMonitoring(this.audioContext);
    }

    this.isMonitoring = true;
    this._log('start', 'Monitoring started');
    console.log('[RecordingMonitor] Monitoring started');
  }

  /**
   * 監視を停止
   */
  stop() {
    if (!this.isMonitoring) return;

    // イベントリスナーを解除
    document.removeEventListener('visibilitychange', this._boundHandlers.visibilityChange);
    window.removeEventListener('pagehide', this._boundHandlers.pageHide);
    window.removeEventListener('pageshow', this._boundHandlers.pageShow);
    window.removeEventListener('focus', this._boundHandlers.focus);
    window.removeEventListener('blur', this._boundHandlers.blur);

    if ('onfreeze' in document) {
      document.removeEventListener('freeze', this._boundHandlers.freeze);
      document.removeEventListener('resume', this._boundHandlers.resume);
    }

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
      if (this.audioContext) {
        this._setupAudioContextMonitoring(this.audioContext);
      }
    }
    if (options.mediaStream !== undefined) {
      this.mediaStream = options.mediaStream;
      if (this.mediaStream) {
        this._setupStreamMonitoring(this.mediaStream);
      }
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

  // ========================================
  // イベントハンドラ
  // ========================================

  _handleVisibilityChange() {
    const state = document.visibilityState;
    const previousState = this.lastState.visibility;
    this.lastState.visibility = state;

    this._log('visibilitychange', { from: previousState, to: state });
    console.log(`[RecordingMonitor] Visibility: ${previousState} → ${state}`);

    if (state === 'hidden') {
      // バックグラウンドに移行
      this._checkAndNotifyInterruption('background');
    } else if (state === 'visible' && previousState === 'hidden') {
      // フォアグラウンドに復帰
      this._attemptRecovery('foreground_return');
    }

    this._emitStateChange();
  }

  _handlePageHide(event) {
    this._log('pagehide', { persisted: event.persisted });
    console.log('[RecordingMonitor] Page hide, persisted:', event.persisted);

    if (!event.persisted) {
      // ページが破棄される（bfcacheに入らない）
      this._checkAndNotifyInterruption('page_unload');
    }
  }

  _handlePageShow(event) {
    this._log('pageshow', { persisted: event.persisted });
    console.log('[RecordingMonitor] Page show, persisted:', event.persisted);

    if (event.persisted) {
      // bfcache から復帰
      this._attemptRecovery('bfcache_restore');
    }
  }

  _handleFocus() {
    this._log('focus', {});
    console.log('[RecordingMonitor] Window focus');

    // フォーカス復帰時に状態をチェック
    this._attemptRecovery('focus');
  }

  _handleBlur() {
    this._log('blur', {});
    console.log('[RecordingMonitor] Window blur');
  }

  _handleFreeze() {
    this._log('freeze', {});
    console.log('[RecordingMonitor] Page frozen (lifecycle API)');
    this._checkAndNotifyInterruption('page_frozen');
  }

  _handleResume() {
    this._log('resume', {});
    console.log('[RecordingMonitor] Page resumed (lifecycle API)');
    this._attemptRecovery('page_resume');
  }

  // ========================================
  // ストリーム・AudioContext 監視
  // ========================================

  _setupStreamMonitoring(stream) {
    const tracks = stream.getTracks();
    tracks.forEach(track => {
      track.onended = () => {
        this._log('track_ended', { kind: track.kind, label: track.label });
        console.log(`[RecordingMonitor] Track ended: ${track.kind}`);
        this._checkAndNotifyInterruption('stream_ended');
      };

      track.onmute = () => {
        this._log('track_muted', { kind: track.kind });
        console.log(`[RecordingMonitor] Track muted: ${track.kind}`);
      };

      track.onunmute = () => {
        this._log('track_unmuted', { kind: track.kind });
        console.log(`[RecordingMonitor] Track unmuted: ${track.kind}`);
      };
    });
  }

  _setupAudioContextMonitoring(context) {
    context.onstatechange = () => {
      const state = context.state;
      this._log('audiocontext_statechange', { state });
      console.log(`[RecordingMonitor] AudioContext state: ${state}`);

      if (state === 'suspended') {
        this._checkAndNotifyInterruption('audiocontext_suspended');
      } else if (state === 'running') {
        this._emitStateChange();
      }
    };
  }

  _isStreamActive() {
    if (!this.mediaStream) return false;
    const tracks = this.mediaStream.getTracks();
    return tracks.length > 0 && tracks.every(t => t.readyState === 'live');
  }

  // ========================================
  // 中断検知・復帰処理
  // ========================================

  _checkAndNotifyInterruption(reason) {
    const state = this.getState();
    const canRecover = this._canRecover(reason, state);

    this._log('interruption', { reason, canRecover, state });
    console.log(`[RecordingMonitor] Interruption detected: ${reason}, canRecover: ${canRecover}`);

    if (this.onInterruption) {
      this.onInterruption(reason, canRecover);
    }
  }

  _canRecover(reason, state) {
    // ストリームが終了している場合は復帰困難（再取得が必要）
    if (!state.streamActive) {
      return false;
    }

    // AudioContext が closed の場合は復帰不可
    if (state.audioContextState === 'closed') {
      return false;
    }

    // その他のケースは復帰可能性あり
    return true;
  }

  async _attemptRecovery(reason) {
    this._log('recovery_attempt', { reason });
    console.log(`[RecordingMonitor] Attempting recovery: ${reason}`);

    if (this.onRecoveryAttempt) {
      this.onRecoveryAttempt(reason);
    }

    let success = true;
    const failures = [];

    // 1. AudioContext の復帰を試みる
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log('[RecordingMonitor] AudioContext resumed successfully');
      } catch (e) {
        console.error('[RecordingMonitor] Failed to resume AudioContext:', e);
        failures.push('audiocontext_resume');
        success = false;
      }
    }

    // 2. ストリームの状態を確認
    if (!this._isStreamActive()) {
      console.log('[RecordingMonitor] Stream is not active, cannot auto-recover');
      failures.push('stream_inactive');
      success = false;
    }

    // 3. MediaRecorder の状態を確認
    if (this.mediaRecorder) {
      const mrState = this.mediaRecorder.state;
      if (mrState === 'inactive') {
        console.log('[RecordingMonitor] MediaRecorder is inactive');
        // MediaRecorder の再起動は外部で行う必要がある
        failures.push('mediarecorder_inactive');
        // これは警告だが、外部で対処可能なので success は変えない
      }
    }

    this._log('recovery_result', { success, failures });

    if (success) {
      console.log('[RecordingMonitor] Recovery successful');
      if (this.onRecoverySuccess) {
        this.onRecoverySuccess();
      }
    } else {
      console.log('[RecordingMonitor] Recovery failed:', failures);
      if (this.onRecoveryFailed) {
        this.onRecoveryFailed(failures.join(', '));
      }
    }

    this._emitStateChange();
    return success;
  }

  // ========================================
  // ユーティリティ
  // ========================================

  _log(event, data) {
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
  }

  _emitStateChange() {
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }
}

// グローバルに公開
window.RecordingMonitor = RecordingMonitor;
