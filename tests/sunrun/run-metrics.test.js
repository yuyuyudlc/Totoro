import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeMileageInput, summarizeMetrics } from '../../lib/shared/run-metrics.js';

test('mileage input keeps at most two decimals', () => {
  assert.equal(sanitizeMileageInput('3.456'), '3.45');
  assert.equal(sanitizeMileageInput('12.34.5'), '12.34');
  assert.equal(sanitizeMileageInput('3..4'), '3.4');
  assert.equal(sanitizeMileageInput('3.'), '3.');
  assert.equal(sanitizeMileageInput(''), '');
  assert.equal(sanitizeMileageInput('abc'), '');
  assert.equal(sanitizeMileageInput('0.5'), '0.5');
});

test('metrics conversion stays consistent across rounds of edits', () => {
  const first = summarizeMetrics({ meters: 3200, durationSeconds: 1200 });
  const second = summarizeMetrics({ meters: 3450, durationSeconds: 990 });
  assert.equal(first.km, '3.20');
  assert.equal(second.km, '3.45');
  assert.equal(first.usedTime, '00:20:00');
  assert.equal(second.usedTime, '00:16:30');
  assert.equal(first.avgSpeed, '6\'15"');
  assert.equal(second.avgSpeed, '4\'47"');
  assert.equal(first.steps, String(Math.round(3200 / Number(first.strideMeters))));
});
