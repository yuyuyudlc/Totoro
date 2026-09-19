import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRunFixture,
  createRunPlan,
  distanceOfTrack,
  summarizeRunPlan,
} from '../lib/server/run-data.js';
import { completeRun, prepareRun, startRun } from '../lib/server/start-run.js';

const task = {
  taskId: 'paper-1', name: '跑步任务', mileage: '3.20', minTime: '10', maxTime: '25', fitDegree: '0.60',
  runPointList: [],
};
const route = {
  taskId: 'paper-1', pointId: 'line-1', pointName: '测试路线', longitude: '118.820000', latitude: '31.940000',
  pointList: [
    { longitude: '118.820000', latitude: '31.940000' },
    { longitude: '118.824000', latitude: '31.940000' },
    { longitude: '118.824000', latitude: '31.943000' },
    { longitude: '118.820000', latitude: '31.943000' },
  ],
};
const identity = { token: 'fixture-token', stuNumber: 'student-1', schoolCode: 'school-1' };

test('fixture follows the selected route with realistic mini-program fields', () => {
  const now = new Date('2026-09-14T06:30:00+08:00');
  const fixture = buildRunFixture({ task, route, identity, now });
  const points = fixture.detail.pointList;
  const alternateFixture = buildRunFixture({ task, route, identity, now });
  assert.ok(points.length > 250);
  assert.ok(Math.abs(distanceOfTrack(points) / 1000 - 3.2) < 0.02);
  assert.notDeepEqual(
    points.map(({ latitude, longitude }) => ({ latitude, longitude })),
    alternateFixture.detail.pointList.map(({ latitude, longitude }) => ({ latitude, longitude })),
  );
  const segmentDistances = points.slice(1).map((point, index) => distanceOfTrack([points[index], point]));
  assert.ok(segmentDistances.every(distance => distance > 0 && distance < 35));
  assert.match(fixture.exercise.avgSpeed, /^\d+'\d{2}"$/);
  assert.match(fixture.exercise.usedTime, /^00:\d{2}:\d{2}$/);
  assert.equal(fixture.begin.paperId, 'paper-1');
  assert.equal(fixture.begin.lineId, 'line-1');
  assert.equal(fixture.exercise.scantronId, '');
  assert.deepEqual(fixture.exercise.sunrunPathPointList, route.pointList);
  assert.equal(fixture.detail.cheatCode, '正常跑步');
  assert.equal(fixture.detail.forceStop, '0');
  assert.equal(fixture.detail.stopReason, '');
  assert.equal(fixture.detail.offsiteDistance, 0);
  assert.match(fixture.exercise.fitDegree, /^(0\.\d{2}|1\.00)$/);
  assert.ok(points.every((point, index) => Number.isFinite(point.timestamp)
    && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(point.time)
    && (!index || point.timestamp > points[index - 1].timestamp)));
  const timestampGaps = points.slice(1).map((point, index) => point.timestamp - points[index].timestamp);
  assert.ok(new Set(timestampGaps).size > 1);
});

test('run plan randomizes bounded time and stride while preserving preview metrics', () => {
  const plans = Array.from({ length: 12 }, () => createRunPlan(task));
  for (const plan of plans) {
    assert.equal(plan.targetMeters, 3200);
    assert.ok(plan.durationSeconds >= 735 && plan.durationSeconds <= 1365);
    assert.ok(plan.strideMeters >= 0.7 && plan.strideMeters <= 0.86);
  }
  assert.ok(new Set(plans.map(plan => `${plan.durationSeconds}:${plan.strideMeters}`)).size > 1);

  const plan = plans[0];
  const preview = summarizeRunPlan({ task, route, plan });
  const fixture = buildRunFixture({ task, route, identity }, { plan });
  assert.deepEqual(
    (({ routeName, km, usedTime, avgSpeed, steps, deviceModel, fitDegree }) => ({ routeName, km, usedTime, avgSpeed, steps, deviceModel, fitDegree }))(fixture.summary),
    preview,
  );
});

test('start run sends the complete mini-program contract', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const endpoint = new URL(url).pathname;
    const body = JSON.parse(options.body);
    calls.push({ endpoint, body, authorization: options.headers.Authorization });
    const replies = {
      '/wxxcx/platform/camera/currentTimeMillis': { status: '00', code: '0', body: 1 },
      '/wxxcx/platform/sunrunFace/selectSunRunStartConfiguration': { status: '00', code: '0', body: { sunrunStartFace: '0', sunrunPointRandom: '0' } },
      '/wxxcx/platform/camera/getCameraConfig': { status: '00', code: '0', body: { flag: 0 }, data: [] },
      '/wxxcx/platform/sunrunFace/selectSunRunRandomConfiguration': { status: '00', code: '0', body: {} },
      '/wxxcx/platform/sunrunFace/startUpNote': { status: '00', code: '0' },
      '/wxxcx/sunrun/getRunBegin': { status: '00', code: '0', scantronId: 'test-session-1' },
      '/wxxcx/sunrun/getRunPointList': { status: '00', code: '0', data: [] },
      '/wxxcx/sunrun/getRunPointListAbnormal': { status: '00', code: '0', data: [] },
      '/wxxcx/sunrun/sunRunExercises': { status: '00', code: '0' },
      '/wxxcx/platform/recrecord/sunRunExercisesDetail': { status: '00', code: '0' },
    };
    return new Response(JSON.stringify(replies[endpoint]), { status: 200 });
  };
  const result = await startRun({ task, route, ...identity }, {
    baseUrl: 'https://sunrun-test.example.com', fetchImpl,
    now: new Date('2026-09-14T06:30:00+08:00'),
  });
  assert.equal(result.scantronId, 'test-session-1');
  assert.equal(calls.length, 10);
  assert.ok(calls.every(call => call.authorization === 'Bearer fixture-token' && call.body.token === 'fixture-token'));
  assert.equal(calls[5].body.paperId, 'paper-1');
  assert.equal(calls[8].body.scantronId, 'test-session-1');
  assert.equal(calls[9].body.pointList.length, result.track.pointCount);
  assert.equal(calls[9].body.scantronId, 'test-session-1');
  assert.equal(calls[9].body.forceStop, '0');
  assert.equal(calls[9].body.stopReason, '');
  assert.equal(calls[9].body.offsiteDistance, 0);
  assert.deepEqual(result.steps.map(step => step.endpoint), calls.map(call => call.endpoint));
});

test('start run rejects invalid origins and incomplete identity before fetching', async () => {
  const fetchImpl = () => assert.fail('invalid input must not access the network');
  await assert.rejects(startRun({ task, route, ...identity }, {
    baseUrl: 'http://sunrun-test.example.com', fetchImpl,
  }), /HTTPS origin/);
  await assert.rejects(startRun({ task, route, ...identity }, {
    baseUrl: 'https://sunrun-test.example.com/path', fetchImpl,
  }), /HTTPS origin/);
  await assert.rejects(startRun({ task, route, token: '', stuNumber: 'student-1', schoolCode: 'school-1' }, {
    baseUrl: 'https://sunrun-test.example.com', fetchImpl,
  }), /缺少账号资料/);
});

test('delayed workflow creates the session now and only completes it later', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const endpoint = new URL(url).pathname;
    calls.push({ endpoint, body: JSON.parse(options.body) });
    const replies = {
      '/wxxcx/platform/camera/currentTimeMillis': { status: '00', code: '0', body: 1 },
      '/wxxcx/platform/sunrunFace/selectSunRunStartConfiguration': { status: '00', code: '0', body: { sunrunStartFace: '0', sunrunPointRandom: '0' } },
      '/wxxcx/platform/camera/getCameraConfig': { status: '00', code: '0', body: { flag: 0 } },
      '/wxxcx/platform/sunrunFace/selectSunRunRandomConfiguration': { status: '00', code: '0', body: {} },
      '/wxxcx/platform/sunrunFace/startUpNote': { status: '00', code: '0' },
      '/wxxcx/sunrun/getRunBegin': { status: '00', code: '0', scantronId: 'prepared-session-1' },
      '/wxxcx/sunrun/getRunPointList': { status: '00', code: '0', data: [] },
      '/wxxcx/sunrun/getRunPointListAbnormal': { status: '00', code: '0', data: [] },
      '/wxxcx/sunrun/sunRunExercises': { status: '00', code: '0' },
      '/wxxcx/platform/recrecord/sunRunExercisesDetail': { status: '00', code: '0' },
    };
    return Response.json(replies[endpoint]);
  };
  const now = new Date('2026-09-15T10:00:00.000Z');
  const prepared = await prepareRun({ task, route, ...identity }, {
    baseUrl: 'https://sunrun-test.example.com', fetchImpl, now,
  });
  assert.equal(prepared.scantronId, 'prepared-session-1');
  assert.equal(calls.some(call => call.endpoint === '/wxxcx/sunrun/sunRunExercises'), false);

  const preparationCount = calls.length;
  await completeRun({ task, route, ...identity }, prepared, {
    baseUrl: 'https://sunrun-test.example.com', fetchImpl,
  });
  assert.deepEqual(calls.slice(preparationCount).map(call => call.endpoint), [
    '/wxxcx/sunrun/sunRunExercises',
    '/wxxcx/platform/recrecord/sunRunExercisesDetail',
  ]);
  assert.equal(calls.filter(call => call.endpoint === '/wxxcx/sunrun/getRunBegin').length, 1);
  assert.ok(calls.slice(preparationCount).every(call => call.body.scantronId === 'prepared-session-1'));
});

test('a route-less task creates a real session and submits an empty configured route', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const endpoint = new URL(url).pathname;
    calls.push({ endpoint, body: JSON.parse(options.body) });
    const replies = {
      '/wxxcx/platform/camera/currentTimeMillis': { status: '00', code: '0', body: 1 },
      '/wxxcx/platform/sunrunFace/selectSunRunStartConfiguration': { status: '00', code: '0', body: { sunrunStartFace: '0', sunrunPointRandom: '0' } },
      '/wxxcx/platform/sunrunFace/startUpNote': { status: '00', code: '0' },
      '/wxxcx/sunrun/getRunBegin': { status: '00', code: '0', scantronId: 'route-free-session-1' },
      '/wxxcx/sunrun/getRunPointList': { status: '00', code: '0', data: [] },
      '/wxxcx/sunrun/getRunPointListAbnormal': { status: '00', code: '0', data: [] },
      '/wxxcx/sunrun/sunRunExercises': { status: '00', code: '0' },
      '/wxxcx/platform/recrecord/sunRunExercisesDetail': { status: '00', code: '0' },
    };
    return Response.json(replies[endpoint]);
  };
  const result = await startRun({ task: { ...task, runPointList: [] }, route: undefined, ...identity }, {
    baseUrl: 'https://sunrun-test.example.com', fetchImpl,
    now: new Date('2026-09-15T18:00:00+08:00'),
  });
  assert.equal(result.mode, 'completed');
  assert.equal(result.scantronId, 'route-free-session-1');
  assert.equal(result.track.routeName, '无固定路线');
  assert.ok(result.track.pointCount > 250);
  assert.deepEqual(calls.map(call => call.endpoint), [
    '/wxxcx/platform/camera/currentTimeMillis',
    '/wxxcx/platform/sunrunFace/selectSunRunStartConfiguration',
    '/wxxcx/platform/sunrunFace/startUpNote',
    '/wxxcx/sunrun/getRunBegin',
    '/wxxcx/sunrun/getRunPointList',
    '/wxxcx/sunrun/getRunPointListAbnormal',
    '/wxxcx/sunrun/sunRunExercises',
    '/wxxcx/platform/recrecord/sunRunExercisesDetail',
  ]);
  assert.equal(calls[3].body.runType, 0);
  assert.equal(calls[3].body.paperId, 'paper-1');
  assert.equal(calls[3].body.lineId, '');
  assert.equal(calls[3].body.faceBase64, '');
  assert.equal(calls[3].body.token, 'fixture-token');
  assert.match(calls[3].body.version, /^\d+\.\d+\.\d+$/);
  assert.ok(calls[3].body.phoneInfo.includes('&') && !calls[3].body.phoneInfo.includes('Node.js'));
  assert.equal(calls[6].body.scantronId, 'route-free-session-1');
  assert.equal(calls[6].body.taskId, 'paper-1');
  assert.deepEqual(calls[6].body.sunrunPathPointList, []);
  assert.equal(calls[7].body.scantronId, 'route-free-session-1');
  assert.equal(calls[7].body.forceStop, '0');
  assert.equal(calls[7].body.stopReason, '');
  assert.equal(calls[7].body.offsiteDistance, 0);
  assert.equal(calls[7].body.pointList.length, result.track.pointCount);
  assert.ok(Math.abs(distanceOfTrack(calls[7].body.pointList) / 1000 - 3.2) < 0.02);
  assert.deepEqual(
    { longitude: calls[7].body.pointList[0].longitude, latitude: calls[7].body.pointList[0].latitude },
    { longitude: 118.789377, latitude: 31.939196 },
  );
  assert.ok(calls[7].body.pointList.every(point => (
    point.longitude >= 118.788176 && point.longitude <= 118.792038
    && point.latitude >= 31.934225 && point.latitude <= 31.93925
  )));
});

test('start run stops before creating a session when face verification is required', async () => {
  const calls = [];
  const fetchImpl = async url => {
    const endpoint = new URL(url).pathname;
    calls.push(endpoint);
    const result = endpoint.endsWith('selectSunRunStartConfiguration')
      ? { status: '00', code: '0', body: { sunrunStartFace: '1' } }
      : endpoint.endsWith('getCameraConfig')
        ? { status: '00', code: '0', body: { flag: 0 } }
        : { status: '00', code: '0', body: {} };
    return new Response(JSON.stringify(result), { status: 200 });
  };
  await assert.rejects(startRun({ task, route, ...identity }, {
    baseUrl: 'https://sunrun-test.example.com', fetchImpl,
  }), /人脸校验/);
  assert.equal(calls.length, 5);
  assert.ok(!calls.includes('/wxxcx/sunrun/getRunBegin'));
});

test('start run switches to the fallback origin for the rest of the workflow', async t => {
  t.mock.method(console, 'error', () => {});
  const hosts = [];
  const fetchImpl = async url => {
    const parsed = new URL(url);
    hosts.push(parsed.hostname);
    if (parsed.hostname === 'wxxcx.xtotoro.com') throw new TypeError('fetch failed');
    const result = parsed.pathname.endsWith('selectSunRunStartConfiguration')
      ? { status: '00', code: '0', body: { sunrunStartFace: '1' } }
      : parsed.pathname.endsWith('getCameraConfig')
        ? { status: '00', code: '0', body: { flag: 0 } }
        : { status: '00', code: '0', body: {} };
    return Response.json(result);
  };
  await assert.rejects(startRun({ task, route, ...identity }, { fetchImpl }), /人脸校验/);
  assert.deepEqual(hosts, [
    'wxxcx.xtotoro.com',
    'app.xtotoro.com',
    'app.xtotoro.com',
    'app.xtotoro.com',
    'app.xtotoro.com',
    'app.xtotoro.com',
  ]);
});

test('getRunBegin business rejection exposes safe stage metadata', async () => {
  const fetchImpl = async url => {
    const endpoint = new URL(url).pathname;
    const replies = {
      '/wxxcx/platform/camera/currentTimeMillis': { status: '00', code: '0', body: Date.now() },
      '/wxxcx/platform/sunrunFace/selectSunRunStartConfiguration': { status: '00', code: '0', body: { sunrunStartFace: '0', sunrunPointRandom: '0' } },
      '/wxxcx/platform/camera/getCameraConfig': { status: '00', code: '0', body: { flag: 0 } },
      '/wxxcx/platform/sunrunFace/selectSunRunRandomConfiguration': { status: '00', code: '0', body: {} },
      '/wxxcx/platform/sunrunFace/startUpNote': { status: '00', code: '0' },
      '/wxxcx/sunrun/getRunBegin': { status: '01', code: 'LIMIT', msg: '该任务次数今日已达上限' },
    };
    return Response.json(replies[endpoint]);
  };

  await assert.rejects(
    prepareRun({ task, route, ...identity }, {
      baseUrl: 'https://sunrun-test.example.com',
      fetchImpl,
      plan: createRunPlan(task),
    }),
    error => {
      assert.equal(error.stage, 'get_run_begin');
      assert.equal(error.endpoint, '/wxxcx/sunrun/getRunBegin');
      assert.equal(error.kind, 'business_rejected');
      assert.equal(error.httpStatus, 200);
      assert.equal(error.businessStatus, '01');
      assert.equal(error.businessCode, 'LIMIT');
      assert.match(error.message, /今日已达上限/);
      assert.ok(error.elapsedMs >= 0);
      return true;
    },
  );
});

test('worker submission HTTP failure identifies the exercise stage', async () => {
  const fetchImpl = async () => new Response('unavailable', { status: 503 });
  await assert.rejects(
    completeRun({ task, route, ...identity }, {
      scantronId: 'session-1',
      runStartedAt: '2026-09-19T08:00:00.000Z',
    }, {
      baseUrl: 'https://sunrun-test.example.com',
      fetchImpl,
      plan: createRunPlan(task),
    }),
    error => {
      assert.equal(error.stage, 'submit_exercises');
      assert.equal(error.endpoint, '/wxxcx/sunrun/sunRunExercises');
      assert.equal(error.kind, 'upstream_http');
      assert.equal(error.httpStatus, 503);
      assert.ok(error.elapsedMs >= 0);
      return true;
    },
  );
});
