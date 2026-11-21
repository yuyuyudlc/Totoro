import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRouteSelection, assertRunWindow } from '../../lib/server/sunrun/run-window.js';

const baseTask = {
  taskId: 'paper-1',
  startDate: '2026-09-10',
  endDate: '2026-09-20',
  runTimeRuleList: [
    { startTime: '06:00', endTime: '08:00' },
    { startTime: '17:30', endTime: '19:00' },
  ],
  runPointList: [{ pointId: 'line-1', pointName: '测试路线' }],
};

test('run window accepts starts inside the task date and slot', () => {
  assert.doesNotThrow(() => assertRunWindow(baseTask, new Date('2026-09-14T07:00:00+08:00')));
  // 同一时刻用 UTC 表示也必须落在同一个上海时段里。
  assert.doesNotThrow(() => assertRunWindow(baseTask, new Date('2026-09-14T23:00:00Z')));
});

test('run window rejects starts outside the task date or slot', () => {
  assert.throws(() => assertRunWindow(baseTask, new Date('2026-09-21T07:00:00+08:00')), /日期/);
  assert.throws(() => assertRunWindow(baseTask, new Date('2026-09-09T07:00:00+08:00')), /日期/);
  assert.throws(() => assertRunWindow(baseTask, new Date('2026-09-14T12:00:00+08:00')), /时段/);
});

test('run window handles overnight slots and tasks without rules', () => {
  const overnight = { ...baseTask, runTimeRuleList: [{ startTime: '22:30', endTime: '01:30' }] };
  assert.doesNotThrow(() => assertRunWindow(overnight, new Date('2026-09-14T23:10:00+08:00')));
  assert.doesNotThrow(() => assertRunWindow(overnight, new Date('2026-09-15T01:00:00+08:00')));
  assert.throws(() => assertRunWindow(overnight, new Date('2026-09-15T02:00:00+08:00')), /时段/);
  assert.doesNotThrow(() => assertRunWindow({ taskId: 'paper-1' }, new Date('2026-09-14T03:00:00+08:00')));
});

test('route selection must belong to the task', () => {
  assert.doesNotThrow(() => assertRouteSelection(baseTask, { pointId: 'line-1' }));
  assert.throws(() => assertRouteSelection(baseTask, undefined), /请选择路线/);
  assert.throws(() => assertRouteSelection(baseTask, { pointId: 'line-9' }), /不属于/);
  assert.doesNotThrow(() => assertRouteSelection({ runPointList: [] }, undefined));
});

test('run window rejects runs whose expected completion crosses outside the slot or end date', () => {
  assert.doesNotThrow(() => assertRunWindow(baseTask, new Date('2026-09-14T07:35:00+08:00'), { durationSeconds: 1200 }));
  assert.throws(
    () => assertRunWindow(baseTask, new Date('2026-09-14T07:50:00+08:00'), { durationSeconds: 1200 }),
    /预计完成时间 08:10 不在跑步时段/,
  );
  const overnight = { ...baseTask, runTimeRuleList: [{ startTime: '22:30', endTime: '01:30' }] };
  assert.doesNotThrow(() => assertRunWindow(overnight, new Date('2026-09-14T23:45:00+08:00'), { durationSeconds: 1800 }));
  assert.throws(
    () => assertRunWindow(overnight, new Date('2026-09-20T23:45:00+08:00'), { durationSeconds: 1800 }),
    /预计完成日期 2026-09-21/,
  );
});
