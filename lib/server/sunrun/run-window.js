const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

const pad = value => String(value).padStart(2, '0');

function shanghaiClock(now) {
  const shifted = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function parseMinutes(value) {
  const match = TIME_PATTERN.exec(String(value || '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseDate(value) {
  const text = String(value || '').trim().slice(0, 10);
  return DATE_PATTERN.test(text) ? text : '';
}

function formatMinutes(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function assertMomentInWindow(task, moment, label = '当前') {
  const { date, minutes } = shanghaiClock(moment);
  const startDate = parseDate(task?.startDate);
  const endDate = parseDate(task?.endDate);

  if (startDate && date < startDate) {
    throw new Error(`${label}日期 ${date} 不在任务有效期 ${startDate} 至 ${endDate || startDate} 内`);
  }
  if (endDate && date > endDate) {
    throw new Error(`${label}日期 ${date} 不在任务有效期 ${startDate || endDate} 至 ${endDate} 内`);
  }

  const rules = Array.isArray(task?.runTimeRuleList) ? task.runTimeRuleList : [];
  const windows = rules
    .map(rule => ({ start: parseMinutes(rule?.startTime), end: parseMinutes(rule?.endTime) }))
    .filter(window => window.start != null && window.end != null);
  if (!windows.length) return;

  const inside = windows.some(({ start, end }) => (
    start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end
  ));
  if (!inside) {
    const text = windows.map(({ start, end }) => `${formatMinutes(start)}-${formatMinutes(end)}`).join(' / ');
    throw new Error(`${label}时间 ${formatMinutes(minutes)} 不在跑步时段 ${text} 内`);
  }
}

export function assertRunWindow(task, now = new Date(), options = {}) {
  assertMomentInWindow(task, now, '当前');
  const durationSeconds = Number(options?.durationSeconds);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const expectedEnd = new Date(now.getTime() + Math.round(durationSeconds * 1000));
    assertMomentInWindow(task, expectedEnd, '预计完成');
  }
}

export function assertRouteSelection(task, route) {
  const routes = Array.isArray(task?.runPointList) ? task.runPointList.filter(point => point?.pointId) : [];
  if (!routes.length) return;
  if (!route?.pointId) throw new Error('任务已配置固定路线，请选择路线后再开始');
  if (!routes.some(point => String(point.pointId) === String(route.pointId))) {
    throw new Error('所选路线不属于当前任务');
  }
}

export function assertRunnableSelection(task, route, now = new Date(), options = {}) {
  assertRouteSelection(task, route);
  assertRunWindow(task, now, options);
}
