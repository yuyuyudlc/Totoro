import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeConfirmedRun } from '../lib/server/confirmed-run.js';
import {
  buildDelayedRunJob,
  getDelayedRunJobStatus,
  getStudentRunJobs,
  processDelayedRunJob,
  validateRedisUrl,
} from '../lib/server/run-queue.js';

const env = {
  REDIS_URL: 'redis://127.0.0.1:6379',
};
const identity = {
  token: 'dedicated-test-token',
  stuNumber: 'student-1',
  schoolCode: 'school-1',
};
const track = {
  routeName: '测试路线',
  km: '3.20',
  usedTime: '00:20:00',
  avgSpeed: `6'15"`,
  steps: '4000',
};
const task = { taskId: 'paper-1', mileage: '3.20', minTime: 20, maxTime: 20 };
const route = {
  pointId: 'line-1',
  pointName: '测试路线',
  pointList: [
    { longitude: 118.1, latitude: 31.1 },
    { longitude: 118.2, latitude: 31.2 },
  ],
};
const plan = { targetMeters: 3200, durationSeconds: 1200, strideMeters: 0.8 };
const session = {
  scantronId: 'test-session-1',
  runStartedAt: '2026-09-15T10:00:00.000Z',
  preferredBaseUrl: 'https://app.xtotoro.com/',
};

test('queue configuration validates Redis', () => {
  assert.equal(validateRedisUrl(env.REDIS_URL).protocol, 'redis:');
  assert.equal(validateRedisUrl('rediss://example.test:6380').protocol, 'rediss:');
  assert.throws(() => validateRedisUrl('https://example.test'), /Redis/);
});

test('delayed jobs store the real execution input and retain the confirmation time', () => {
  const now = new Date('2026-09-15T10:00:00.000Z');
  const job = buildDelayedRunJob({ input: { task, route, ...identity }, plan, session, track }, {
    now,
    jobId: 'job-1',
    env,
  });

  assert.equal(job.delayMs, 1_200_000);
  assert.equal(job.scheduledAt, '2026-09-15T10:20:00.000Z');
  assert.equal(job.data.schemaVersion, 4);
  assert.equal(job.data.jobId, 'job-1');
  assert.deepEqual(job.data.payload.input, { task, route, ...identity });
  assert.deepEqual(job.data.payload.plan, plan);
  assert.deepEqual(job.data.payload.session, session);
  assert.deepEqual(job.data.track, track);
  assert.equal(job.data.scheduledAt, '2026-09-15T10:20:00.000Z');
});

test('student queue listing filters by school and student without exposing payloads', async () => {
  const own = buildDelayedRunJob({ input: { task, route, ...identity }, plan, session, track }, {
    jobId: 'own-job', now: new Date(session.runStartedAt), env,
  });
  const other = buildDelayedRunJob({
    input: { task, route, ...identity, stuNumber: 'student-2' }, plan,
    session: { ...session, scantronId: 'other-session' }, track,
  }, { jobId: 'other-job', now: new Date(session.runStartedAt), env });
  const fakeJob = (id, data, state) => ({ id, data, getState: async () => state });
  const queue = {
    getJobs: async () => [
      fakeJob('other-job', other.data, 'active'),
      fakeJob('own-job', own.data, 'delayed'),
    ],
  };

  const jobs = await getStudentRunJobs(identity, { queue });
  assert.deepEqual(jobs, [{
    jobId: 'own-job',
    state: 'delayed',
    scheduledAt: '2026-09-15T10:20:00.000Z',
    track,
  }]);
  assert.equal(JSON.stringify(jobs).includes(identity.token), false);
});

test('confirmed runs enqueue one non-retrying real execution job', async () => {
  const added = [];
  const events = [];
  const queue = { add: async (...args) => { added.push(args); } };
  const result = await executeConfirmedRun({ task, route, ...identity }, {
    plan,
    queue,
    jobId: 'job-2',
    now: new Date('2026-09-15T10:00:00.000Z'),
    env,
    prepareRunImpl: async () => session,
    logRunEventImpl: (name, context, details) => events.push({ name, context, details }),
  });

  assert.equal(result.mode, 'queued');
  assert.equal(result.jobId, 'job-2');
  assert.equal(added.length, 1);
  assert.equal(added[0][0], 'execute-live-run');
  assert.equal(added[0][2].delay, 1_200_000);
  assert.equal(added[0][2].attempts, 1);
  assert.equal(added[0][1].payload.session.scantronId, 'test-session-1');
  assert.deepEqual(events.map(event => event.name), ['run.started', 'run.queued']);
  assert.ok(events.every(event => event.context.request_id === 'job-2'));
  assert.equal(events[0].details.stage, 'get_run_begin');
  assert.equal(events[0].details.scantron_id, 'test-session-1');
  assert.equal(events[1].details.stage, 'redis_queue');
  assert.equal(JSON.stringify(events).includes(identity.token), false);
});

test('confirmed run logs a stage-aware failure without swallowing it', async () => {
  const events = [];
  const expected = Object.assign(new Error('begin rejected'), {
    stage: 'get_run_begin',
    endpoint: '/wxxcx/sunrun/getRunBegin',
    kind: 'business_rejected',
    businessCode: 'LIMIT',
  });
  await assert.rejects(executeConfirmedRun({ task, route, ...identity }, {
    plan,
    queue: { waitUntilReady: async () => {} },
    jobId: 'job-failed-before-queue',
    prepareRunImpl: async () => { throw expected; },
    logRunEventImpl: (name, context, details) => events.push({ name, context, details }),
  }), error => error === expected);

  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'run.failed');
  assert.equal(events[0].context.request_id, 'job-failed-before-queue');
  assert.equal(events[0].details.stage, 'get_run_begin');
  assert.equal(events[0].details.error.kind, 'business_rejected');
});

test('getRunBegin is logged before a later preparation stage fails', async () => {
  const events = [];
  const expected = Object.assign(new Error('points rejected'), {
    stage: 'run_points',
    endpoint: '/wxxcx/sunrun/getRunPointList',
    kind: 'business_rejected',
  });

  await assert.rejects(executeConfirmedRun({ task, route, ...identity }, {
    plan,
    queue: { waitUntilReady: async () => {} },
    jobId: 'job-points-failed',
    prepareRunImpl: async (_input, options) => {
      options.onSessionStarted(session);
      throw expected;
    },
    logRunEventImpl: (name, context, details) => events.push({ name, context, details }),
  }), error => error === expected);

  assert.deepEqual(events.map(event => event.name), ['run.started', 'run.failed']);
  assert.equal(events[0].details.scantron_id, session.scantronId);
  assert.equal(events[1].details.stage, 'run_points');
  assert.ok(events.every(event => event.context.request_id === 'job-points-failed'));
});

test('job status is bound to the same student and school', async () => {
  const built = buildDelayedRunJob({ input: { task, route, ...identity }, plan, session, track }, {
    jobId: 'job-3', env,
  });
  const queue = {
    getJob: async jobId => jobId === 'job-3' ? {
      data: built.data,
      failedReason: undefined,
      returnvalue: undefined,
      getState: async () => 'delayed',
    } : undefined,
  };

  const status = await getDelayedRunJobStatus('job-3', identity, { queue });
  assert.equal(status.state, 'delayed');
  await assert.rejects(
    getDelayedRunJobStatus('job-3', { ...identity, stuNumber: 'student-9' }, { queue }),
    /无权/,
  );
});

test('worker reads the payload and calls the real runner with the confirmation time', async () => {
  const built = buildDelayedRunJob({ input: { task, route, ...identity }, plan, session, track }, {
    jobId: 'job-4',
    now: new Date('2026-09-15T10:00:00.000Z'),
    env,
  });
  const calls = [];
  const events = [];
  const expected = { mode: 'completed', scantronId: 'test-session-1', track, steps: [] };
  const result = await processDelayedRunJob({
    id: 'job-4', name: 'execute-live-run', data: built.data,
  }, {
    env,
    completeRunImpl: async (...args) => {
      calls.push(args);
      return expected;
    },
    logRunEventImpl: (name, context, details) => events.push({ name, context, details }),
  });

  assert.deepEqual(result, expected);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], { task, route, ...identity });
  assert.deepEqual(calls[0][1], session);
  assert.deepEqual(calls[0][2].plan, plan);
  assert.equal(calls[0][2].preferredBaseUrl, session.preferredBaseUrl);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'run.completed');
  assert.equal(events[0].context.request_id, 'job-4');
  assert.equal(events[0].details.stage, 'worker_complete');
  assert.equal(events[0].details.scantron_id, 'test-session-1');
});

test('worker logs upstream failure and preserves the original error', async () => {
  const built = buildDelayedRunJob({ input: { task, route, ...identity }, plan, session, track }, {
    jobId: 'job-worker-failed',
    now: new Date('2026-09-15T10:00:00.000Z'),
    env,
  });
  const events = [];
  const expected = Object.assign(new Error('exercise rejected'), {
    stage: 'submit_exercises',
    endpoint: '/wxxcx/sunrun/sunRunExercises',
    kind: 'business_rejected',
  });

  await assert.rejects(processDelayedRunJob({
    id: 'job-worker-failed', name: 'execute-live-run', data: built.data,
  }, {
    env,
    completeRunImpl: async () => { throw expected; },
    logRunEventImpl: (name, context, details) => events.push({ name, context, details }),
  }), error => error === expected);

  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'run.failed');
  assert.equal(events[0].context.request_id, 'job-worker-failed');
  assert.equal(events[0].details.stage, 'submit_exercises');
  assert.equal(JSON.stringify(events).includes(identity.token), false);
});
