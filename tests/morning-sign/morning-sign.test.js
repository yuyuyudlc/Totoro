import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MorningSignService,
  encryptMorningPayload,
  formatShanghaiDateTime,
} from '../../lib/server/morning-sign/morning-sign.js';
import { POST as taskPOST } from '../../app/api/morning-sign/task/route.js';
import { POST as submitPOST } from '../../app/api/morning-sign/submit/route.js';

const identity = { token: 'fixture-token', stuNumber: 'student-1' };
const upstreamTask = {
  status: '00',
  code: '0',
  signType: '0',
  startDate: '2026-09-14',
  endDate: '2027-01-08',
  startTime: '06:00',
  endTime: '08:30',
  offsetRange: '400.00',
  dayNeedSignCount: '1',
  dayCompSignCount: '0',
  minTimeInterval: '0',
  signPointList: [{
    longitude: '118.79519236430531',
    latitude: '31.93664958350164',
    taskId: 'mornsign-task-1',
    pointId: '01',
    pointName: '东操',
    qrCode: 'fixture-qr-code',
  }],
};

function setup({ submitReply = { status: '01', code: '1', message: '签到时间不在规则时间内，提交异常' } } = {}) {
  const calls = [];
  let capturedPayload = null;
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(options.body);
    calls.push({ path, options, body });
    if (path.endsWith('/getMornSignPaper')) return Response.json(upstreamTask);
    if (path.endsWith('/morningExercises')) return Response.json(submitReply);
    return new Response('not found', { status: 404 });
  };
  const service = new MorningSignService(identity, {
    fetchImpl,
    now: () => new Date('2026-09-16T06:40:25.000Z'),
    encryptPayload: value => {
      capturedPayload = JSON.parse(value);
      return 'encrypted-fixture';
    },
  });
  return { service, calls, getCapturedPayload: () => capturedPayload };
}

test('task retrieval uses the real endpoint and strips point secrets', async () => {
  const { service, calls } = setup();
  const task = await service.getTask();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/wxxcx/platform/mornSign/getMornSignPaper');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-token');
  assert.deepEqual(calls[0].body, { stuNumber: 'student-1', token: 'fixture-token' });
  assert.equal(task.signPointList[0].pointName, '东操');
  assert.equal(task.signPointList[0].qrCode, undefined);
  assert.equal(task.signPointList[0].latitude, undefined);
  assert.equal(task.signPointList[0].longitude, undefined);
  assert.equal(JSON.stringify(task).includes('fixture-token'), false);
});

test('one submit action re-fetches the task and posts its selected point exactly once', async () => {
  const { service, calls, getCapturedPayload } = setup();
  const result = await service.submit({ pointId: '01', phoneInfo: 'Codex/Test/Windows VX:interop' });
  const payload = getCapturedPayload();

  assert.deepEqual(calls.map(call => call.path), [
    '/wxxcx/platform/mornSign/getMornSignPaper',
    '/wxxcx/platform/mornSign/morningExercises',
  ]);
  assert.deepEqual(calls[1].body, { encryptParams: 'encrypted-fixture' });
  assert.equal(payload.taskId, 'mornsign-task-1');
  assert.equal(payload.pointId, '01');
  assert.equal(payload.latitude, upstreamTask.signPointList[0].latitude);
  assert.equal(payload.longitude, upstreamTask.signPointList[0].longitude);
  assert.equal(payload.qrCode, upstreamTask.signPointList[0].qrCode);
  assert.equal(payload.token, identity.token);
  assert.equal(payload.stuNumber, identity.stuNumber);
  assert.equal(payload.signDate, '2026-09-16 14:40:25');
  assert.equal(result.accepted, false);
  assert.equal(result.message, '签到时间不在规则时间内，提交异常');
});

test('unknown point is rejected before the real submission endpoint', async () => {
  const { service, calls } = setup();
  await assert.rejects(service.submit({ pointId: 'missing' }), /点位/);
  assert.deepEqual(calls.map(call => call.path), ['/wxxcx/platform/mornSign/getMornSignPaper']);
});

test('encryptLong-compatible output is one 128-byte RSA block per 117 UTF-8 bytes', () => {
  const encrypted = Buffer.from(encryptMorningPayload('a'.repeat(118)), 'base64');
  assert.equal(encrypted.length, 256);
  assert.notEqual(encrypted.toString('utf8'), 'a'.repeat(118));
});

test('Shanghai timestamps do not depend on the server deployment timezone', () => {
  assert.equal(formatShanghaiDateTime(new Date('2026-09-16T06:40:25.000Z')), '2026-09-16 14:40:25');
});

function request(path, body) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('task route returns sanitized task data', { concurrency: false }, async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).pathname, '/wxxcx/platform/mornSign/getMornSignPaper');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    return Response.json(upstreamTask);
  });
  const response = await taskPOST(request('/api/morning-sign/task', {
    token: identity.token,
    stu_number: identity.stuNumber,
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.task.signPointList[0].pointName, '东操');
  assert.equal(JSON.stringify(body).includes('fixture-qr-code'), false);
  assert.equal(JSON.stringify(body).includes('fixture-token'), false);
});

test('submit route preserves an upstream business rejection without retrying', { concurrency: false }, async t => {
  const paths = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path.endsWith('/getMornSignPaper')) return Response.json(upstreamTask);
    return Response.json({ status: '01', code: '1', message: '签到时间不在规则时间内，提交异常' });
  });
  const response = await submitPOST(request('/api/morning-sign/submit', {
    token: identity.token,
    stu_number: identity.stuNumber,
    point_id: '01',
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.result.accepted, false);
  assert.equal(body.result.message, '签到时间不在规则时间内，提交异常');
  assert.deepEqual(paths, [
    '/wxxcx/platform/mornSign/getMornSignPaper',
    '/wxxcx/platform/mornSign/morningExercises',
  ]);
});

test('submit route validates point id before accessing the upstream', async () => {
  const response = await submitPOST(request('/api/morning-sign/submit', {
    token: identity.token,
    stu_number: identity.stuNumber,
  }));
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.message, /点位/);
});
