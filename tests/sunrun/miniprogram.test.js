import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeMiniTasks } from '../../lib/server/sunrun/sunrun-models.js';
import { SunRunService } from '../../lib/server/sunrun/sunrun-service.js';

const taskPaper = {
  taskId: 'paper-1', name: '秋季任务', startDate: '2026-01-01', endDate: '2026-12-31',
  mileage: '3', minTime: '15', maxTime: '25',
  runTimeRuleList: [{ startTime: '06:30:00', endTime: '08:00:00' }, { startTime: '16:00:00', endTime: '20:00:00' }],
  runPointList: [{ taskId: 'paper-1', pointId: 'line-1', pointName: '东校区', longitude: '119.48', latitude: '31.37',
    pointList: [{ longitude: '119.48', latitude: '31.37' }, { longitude: '119.483', latitude: '31.37' }, { longitude: '119.483', latitude: '31.373' }] }],
};

function setup() {
  const calls = [];
  const replies = {
    '/wxxcx/sunrun/getSunrunPaper': { getSunrunPaperResponseList: [taskPaper] },
  };
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push({ path, url, options, body: JSON.parse(options.body) });
    assert.ok(path in replies, `Unexpected production endpoint: ${path}`);
    const reply = replies[path];
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply), { status: 200 });
  };
  const service = new SunRunService({ token: 'fixture-token', stuNumber: 'student-1', campusId: 'campus-1' }, { fetchImpl });
  return { service, calls, fetchImpl };
}

test('task list uses mini JSON/Bearer protocol and preserves windows', async () => {
  const { service, calls } = setup();
  const tasks = await service.getSunrunTasks();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].runTimeRuleList.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-token');
  assert.equal(calls[0].body.campusId, 'campus-1');
  assert.equal(calls[0].body.token, 'fixture-token');
  assert.equal(new URL(calls[0].url).hostname, 'wxxcx.xtotoro.com');
});

test('task list retries the fallback origin after a connection failure', async t => {
  t.mock.method(console, 'error', () => {});
  const hosts = [];
  const fetchImpl = async (url) => {
    const host = new URL(url).hostname;
    hosts.push(host);
    if (host === 'wxxcx.xtotoro.com') throw new TypeError('fetch failed');
    return Response.json({ getSunrunPaperResponseList: [taskPaper] });
  };
  const service = new SunRunService({ token: 'fixture-token', stuNumber: 'student-1', campusId: 'campus-1' }, { fetchImpl });
  const tasks = await service.getSunrunTasks();
  assert.equal(tasks.length, 1);
  assert.deepEqual(hosts, ['wxxcx.xtotoro.com', 'app.xtotoro.com']);
});

test('task normalization preserves a task whose route list is empty', () => {
  const [task] = makeMiniTasks({
    getSunrunPaperResponseList: [{ ...taskPaper, taskId: 'paper-no-route', runPointList: [] }],
  });
  assert.equal(task.taskId, 'paper-no-route');
  assert.deepEqual(task.runPointList, []);
});
