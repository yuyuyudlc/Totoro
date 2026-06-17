import { BULK_INTERVAL_LIMIT_SECONDS, BULK_SYNC_LIMIT } from './config';
import { generateRandomRunTime, getDateRange, getYesterdayDate } from './run-data';

function sleep(seconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

function sample(items, count) {
  const pool = [...items];
  const selected = [];

  while (selected.length < count && pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }

  return selected.sort();
}

export function getExistingDays(recordsResult, task) {
  const existingDays = new Set();
  if (recordsResult.code !== '0') return existingDays;

  for (const record of recordsResult.runList || []) {
    const day = record.day || '';
    if (day && task.startDate <= day && day <= task.endDate) {
      existingDays.add(day);
    }
  }

  return existingDays;
}

export function getAvailableDates(task, existingDays) {
  const yesterday = getYesterdayDate();
  const actualEnd = task.endDate < yesterday ? task.endDate : yesterday;

  if (actualEnd < task.startDate) return [];

  return getDateRange(task.startDate, actualEnd).filter((date) => !existingDays.has(date));
}

export function validateSelectedDates(dates, task, existingDays) {
  const yesterday = getYesterdayDate();
  const validDates = [];
  const skippedDates = [];

  for (const date of [...new Set(dates)].sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skippedDates.push({ date, reason: '日期格式无效' });
    } else if (date > yesterday) {
      skippedDates.push({ date, reason: '不能选择今天或未来的日期' });
    } else if (date < task.startDate || date > task.endDate) {
      skippedDates.push({ date, reason: '不在任务日期范围内' });
    } else if (existingDays.has(date)) {
      skippedDates.push({ date, reason: '该日期已有跑步记录' });
    } else {
      validDates.push(date);
    }
  }

  return { validDates, skippedDates };
}

export async function submitDates({ service, task, campusName, dates, intervalSeconds = 0, skippedDates = [] }) {
  const limitedDates = dates.slice(0, BULK_SYNC_LIMIT);
  const deferredDates = dates.slice(BULK_SYNC_LIMIT);
  const interval = Math.max(0, Math.min(Number(intervalSeconds) || 0, BULK_INTERVAL_LIMIT_SECONDS));
  const results = skippedDates.map((item) => ({
    date: item.date,
    success: false,
    message: item.reason,
  }));
  let successCount = 0;

  for (const [index, runDate] of limitedDates.entries()) {
    if (index > 0 && interval > 0) {
      await sleep(interval);
    }

    const runTime = generateRandomRunTime(task.startTime, task.endTime);

    try {
      const startResult = await service.startRun();
      if (startResult.code !== '0') {
        results.push({
          date: runDate,
          time: runTime,
          success: false,
          message: `开始跑步失败: ${startResult.message || ''}`,
        });
        continue;
      }

      const { result1, runInfo } = await service.submitCompleteRun({
        task,
        campusName,
        runDate,
        runTime,
      });

      if (result1.code === '0') {
        successCount += 1;
        results.push({
          date: runDate,
          time: runTime,
          success: true,
          message: '提交成功',
          km: runInfo.km,
          usedTime: runInfo.usedTime,
        });
      } else {
        results.push({
          date: runDate,
          time: runTime,
          success: false,
          message: result1.message || '提交失败',
        });
      }
    } catch (error) {
      results.push({
        date: runDate,
        time: runTime,
        success: false,
        message: error.message,
      });
    }
  }

  for (const date of deferredDates) {
    results.push({
      date,
      success: false,
      message: `已超过 Vercel 单次同步限制 ${BULK_SYNC_LIMIT} 条，请拆分提交`,
    });
  }

  return { successCount, attemptedCount: limitedDates.length, results };
}

export function pickRandomDates(availableDates, requestedCount) {
  return sample(availableDates, Math.min(requestedCount, availableDates.length));
}
