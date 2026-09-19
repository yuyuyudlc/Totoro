import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRunLogContext,
  logRunEvent,
  runFailureDetails,
} from '../lib/server/run-events.js';

const input = {
  token: 'super-secret-token',
  stuNumber: '162330222',
  schoolCode: 'nuaa',
  task: { taskId: 'paper-1', mileage: '3.20' },
  route: {
    pointId: 'line-1',
    pointName: '教学楼',
    pointList: [{ longitude: 118.1, latitude: 31.1 }],
  },
};

test('run log context contains only allowlisted input summary fields', () => {
  const context = createRunLogContext(input, {
    jobId: 'job-1',
    plan: { targetMeters: 3200, durationSeconds: 1200, device: { phoneInfo: 'secret-device' } },
  });

  assert.equal(context.request_id, 'job-1');
  assert.equal(context.school_code, 'nuaa');
  assert.equal(context.input.task_id, 'paper-1');
  assert.equal(context.input.route_id, 'line-1');
  assert.equal(context.input.route_name, '教学楼');
  assert.equal(context.input.planned_km, '3.20');
  assert.equal(context.input.planned_duration_seconds, 1200);
  assert.match(context.user_key, /^[A-Za-z0-9_-]{43}$/);

  const serialized = JSON.stringify(context);
  for (const forbidden of [
    input.token,
    input.stuNumber,
    'longitude',
    'latitude',
    'pointList',
    'secret-device',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('user key is stable per school and student without exposing either combination', () => {
  const first = createRunLogContext(input, { jobId: 'job-1' });
  const second = createRunLogContext(input, { jobId: 'job-2' });
  const other = createRunLogContext({ ...input, stuNumber: '162330223' }, { jobId: 'job-3' });

  assert.equal(first.user_key, second.user_key);
  assert.notEqual(first.user_key, other.user_key);
  assert.equal(first.user_key.includes(input.stuNumber), false);
});

test('failure details preserve diagnostics while redacting credentials', () => {
  const error = Object.assign(
    new Error('getRunBegin rejected Bearer abc.def.ghi token=raw-secret student 162330222\nnext-line'),
    {
      stage: 'get_run_begin',
      endpoint: '/wxxcx/sunrun/getRunBegin',
      kind: 'business_rejected',
      httpStatus: 200,
      businessStatus: '01',
      businessCode: 'LIMIT',
      elapsedMs: 321,
    },
  );
  const details = runFailureDetails(error, 'run_prepare', [input.stuNumber]);

  assert.equal(details.stage, 'get_run_begin');
  assert.equal(details.upstream.path, '/wxxcx/sunrun/getRunBegin');
  assert.equal(details.upstream.http_status, 200);
  assert.equal(details.upstream.business_status, '01');
  assert.equal(details.upstream.business_code, 'LIMIT');
  assert.equal(details.error.kind, 'business_rejected');
  assert.equal(details.error.message.includes('abc.def.ghi'), false);
  assert.equal(details.error.message.includes('raw-secret'), false);
  assert.equal(details.error.message.includes(input.stuNumber), false);
  assert.equal(details.error.message.includes('\n'), false);
  assert.equal(details.elapsed_ms, 321);
});

test('log event emits one JSON line with schema and timestamp', () => {
  const lines = [];
  const context = createRunLogContext(input, { jobId: 'job-1' });
  const record = logRunEvent('run.started', context, {
    stage: 'get_run_begin',
    scantron_id: 'scantron-1',
  }, {
    now: new Date('2026-09-19T10:00:00.000Z'),
    sink: line => lines.push(line),
  });

  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), record);
  assert.equal(record.schema_version, 1);
  assert.equal(record.timestamp, '2026-09-19T10:00:00.000Z');
  assert.equal(record.event, 'run.started');
});
