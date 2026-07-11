import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from '../helpers/load-script.mjs';

function loadService() {
  return loadScript('js/services/recording-duration-limit-service.js')
    .RecordingDurationLimitService;
}

describe('RecordingDurationLimitService', () => {
  it('normalizes invalid limits to the default (120 minutes)', () => {
    const service = loadService();
    assert.equal(service.DEFAULT_MAX_RECORDING_MINUTES, 120);
    assert.equal(service.normalizeMaxMinutes(undefined), 120);
    assert.equal(service.normalizeMaxMinutes(null), 120);
    assert.equal(service.normalizeMaxMinutes(NaN), 120);
    assert.equal(service.normalizeMaxMinutes(-5), 120);
    assert.equal(service.normalizeMaxMinutes('abc'), 120);
  });

  it('keeps valid limits including 0 (unlimited) and floors fractions', () => {
    const service = loadService();
    assert.equal(service.normalizeMaxMinutes(0), 0);
    assert.equal(service.normalizeMaxMinutes(90), 90);
    assert.equal(service.normalizeMaxMinutes('60'), 60);
    assert.equal(service.normalizeMaxMinutes(45.9), 45);
  });

  it('treats 0 as disabled and positive limits as enabled', () => {
    const service = loadService();
    assert.equal(service.isLimitEnabled(0), false);
    assert.equal(service.isLimitEnabled(120), true);
    // invalid values fall back to the default limit, so the guard stays on
    assert.equal(service.isLimitEnabled(undefined), true);
  });

  it('auto-stops only when active duration reaches the limit', () => {
    const service = loadService();
    const twoHoursMs = 120 * 60000;
    assert.equal(service.shouldAutoStop(twoHoursMs - 1, 120), false);
    assert.equal(service.shouldAutoStop(twoHoursMs, 120), true);
    assert.equal(service.shouldAutoStop(twoHoursMs + 60000, 120), true);
  });

  it('never auto-stops when the limit is 0 (unlimited)', () => {
    const service = loadService();
    assert.equal(service.shouldAutoStop(Number.MAX_SAFE_INTEGER, 0), false);
  });

  it('ignores invalid active durations', () => {
    const service = loadService();
    assert.equal(service.shouldAutoStop(NaN, 120), false);
    assert.equal(service.shouldAutoStop(undefined, 120), false);
    assert.equal(service.shouldAutoStop(0, 120), false);
  });
});
