'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckSquare, RefreshCcw, Square } from 'lucide-react';
import { bulkRun, bulkRunV2, getRunRecords } from '../../lib/api';
import useStore from '../../lib/store';

const BULK_LIMIT = 3;

export default function RecordsPage() {
  const router = useRouter();
  const {
    hasHydrated,
    isLoggedIn,
    getAuthData,
    records,
    recordsLoading,
    setRecords,
    setRecordsLoading,
  } = useStore();

  const [taskInfo, setTaskInfo] = useState(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDates, setSelectedDates] = useState(new Set());
  const [intervalSeconds, setIntervalSeconds] = useState(1);

  const fetchRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const result = await getRunRecords(getAuthData());
      if (result.success) {
        const seenDays = new Set();
        const uniqueRecords = result.records.filter((record) => {
          if (seenDays.has(record.day)) return false;
          seenDays.add(record.day);
          return true;
        });
        setRecords(uniqueRecords);
        setTaskInfo(result.task_info);
      }
    } catch {
      setRecords([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [getAuthData, setRecords, setRecordsLoading]);

  useEffect(() => {
    if (hasHydrated && !isLoggedIn) {
      router.replace('/');
    }
  }, [hasHydrated, isLoggedIn, router]);

  useEffect(() => {
    if (hasHydrated && isLoggedIn) {
      const timer = window.setTimeout(() => {
        fetchRecords();
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [fetchRecords, hasHydrated, isLoggedIn]);

  const availableDates = useMemo(() => {
    if (!taskInfo?.startDate || !taskInfo?.endDate) return [];

    const start = new Date(taskInfo.startDate);
    const end = new Date(taskInfo.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const actualEnd = end < yesterday ? end : yesterday;
    const runDays = new Set(records.map((record) => record.day));
    const dates = [];
    const current = new Date(start);

    while (current <= actualEnd) {
      const dateStr = current.toISOString().slice(0, 10);
      if (!runDays.has(dateStr)) dates.push(dateStr);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }, [records, taskInfo]);

  const toggleSelectAll = useCallback(() => {
    setSelectedDates((current) => {
      if (current.size === availableDates.length) return new Set();
      return new Set(availableDates);
    });
  }, [availableDates]);

  const toggleDate = useCallback((date) => {
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }, []);

  const runDateQueue = async (dates) => {
    let successCount = 0;
    let attemptedCount = 0;
    const failures = [];

    for (let index = 0; index < dates.length; index += BULK_LIMIT) {
      const batch = dates.slice(index, index + BULK_LIMIT);
      setBulkProgress(`正在提交 ${Math.min(index + batch.length, dates.length)} / ${dates.length}`);

      const result = await bulkRunV2(getAuthData(), batch, intervalSeconds);
      attemptedCount += result.results?.filter((item) => item.date && !item.message?.includes('未处理')).length || batch.length;
      successCount += result.total_submitted || 0;

      for (const item of result.results || []) {
        if (!item.success) failures.push(item);
      }
    }

    return { successCount, attemptedCount, failures };
  };

  const handleBulkRun = async () => {
    const remainingCount = Math.max(0, 36 - records.length);

    if (remainingCount <= 0) {
      window.alert('已完成36次跑步，无需补跑');
      return;
    }

    if (!window.confirm(`将通过前端队列分批补跑 ${remainingCount} 次，日期由后端随机选择。请保持页面打开。继续？`)) return;

    setBulkRunning(true);
    try {
      let successCount = 0;
      let attemptedCount = 0;
      let remaining = remainingCount;

      while (remaining > 0) {
        const batchCount = Math.min(BULK_LIMIT, remaining);
        setBulkProgress(`正在补跑 ${successCount} / ${remainingCount}`);
        const result = await bulkRun(getAuthData(), batchCount);
        const submitted = result.total_submitted || 0;
        successCount += submitted;
        attemptedCount += batchCount;
        remaining -= submitted;

        if (!result.success || submitted === 0) {
          break;
        }
      }

      await fetchRecords();
      window.alert(`队列完成：成功 ${successCount}/${attemptedCount} 次`);
    } catch (error) {
      window.alert(`批量提交失败：${error.message}`);
    } finally {
      setBulkRunning(false);
      setBulkProgress(null);
    }
  };

  const handleBulkRunV2 = async () => {
    const dates = Array.from(selectedDates).sort();
    if (dates.length === 0) {
      window.alert('请至少选择一个日期');
      return;
    }

    if (!window.confirm(`将通过前端队列分批提交 ${dates.length} 个日期。请保持页面打开。继续？`)) {
      return;
    }

    setBulkRunning(true);
    try {
      const result = await runDateQueue(dates);
      setSelectedDates(new Set());
      await fetchRecords();
      window.alert(`队列完成：成功 ${result.successCount}/${result.attemptedCount} 次`);
    } catch (error) {
      window.alert(`批量提交失败：${error.message}`);
    } finally {
      setBulkRunning(false);
    }
  };

  if (!hasHydrated || !isLoggedIn) {
    return <main className="screen">Loading</main>;
  }

  const remainingCount = Math.max(0, 36 - records.length);

  return (
    <main className="screen app-screen">
      <header className="top-strip">
        <div>
          <Link href="/dashboard" className="back-action">
            <ArrowLeft size={18} />
            返回
          </Link>
          <h1 className="page-heading">记录</h1>
        </div>
        <button className="icon-button" onClick={fetchRecords} type="button" aria-label="刷新记录">
          <RefreshCcw size={20} />
        </button>
      </header>

      {taskInfo && (
        <section className="progress-block">
          <p className="block-label">当前任务周期</p>
          <h2>
            {records.length}
            <span>/36</span>
          </h2>
          <p>
            {taskInfo.startDate} 至 {taskInfo.endDate}
          </p>
          <div className="bulk-actions">
            {remainingCount > 0 && (
              <button className="action-button" onClick={handleBulkRun} disabled={bulkRunning} type="button">
                {bulkRunning ? bulkProgress || '处理中' : `补跑 ${remainingCount} 次`}
              </button>
            )}
            {availableDates.length > 0 && (
              <button
                className="action-button secondary"
                onClick={() => setShowDatePicker((value) => !value)}
                type="button"
              >
                自选日期
              </button>
            )}
          </div>
          <p className="limit-note">前端队列模式：每批最多 {BULK_LIMIT} 条，自动分批提交，请保持页面打开。</p>
        </section>
      )}

      {showDatePicker && (
        <section className="date-panel">
          <div className="date-panel-head">
            <h2>可用日期</h2>
            <button className="text-toggle" onClick={toggleSelectAll} type="button">
              {selectedDates.size === availableDates.length ? <CheckSquare size={18} /> : <Square size={18} />}
              {selectedDates.size === availableDates.length ? '取消全选' : '全选'}
            </button>
          </div>

          <div className="date-grid">
            {availableDates.map((date) => (
              <label key={date} className={`date-chip ${selectedDates.has(date) ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={selectedDates.has(date)}
                  onChange={() => toggleDate(date)}
                />
                <span>{date.slice(5)}</span>
              </label>
            ))}
          </div>

          <div className="date-panel-footer">
            <label>
              <span>间隔秒数</span>
              <input
                type="number"
                min="0"
                max="1"
                value={intervalSeconds}
                onChange={(event) => setIntervalSeconds(Math.min(1, Number.parseInt(event.target.value, 10) || 0))}
              />
            </label>
            <button
              className="action-button"
              onClick={handleBulkRunV2}
              disabled={bulkRunning || selectedDates.size === 0}
              type="button"
            >
              提交 {selectedDates.size} 个日期
            </button>
          </div>
        </section>
      )}

      {recordsLoading && <div className="empty-state">加载中</div>}

      {!recordsLoading && records.length === 0 && <div className="empty-state">暂无跑步记录</div>}

      <section className="records-list" aria-label="跑步记录列表">
        {records.map((record, index) => (
          <article key={`${record.day}-${index}`} className="record-card">
            <div>
              <p className="record-date">{record.day}</p>
              <span className={`status-pill ${record.status === '1' ? 'success' : ''}`}>
                {record.status === '1' ? '有效' : '待审核'}
              </span>
            </div>
            <dl>
              <div>
                <dt>开始</dt>
                <dd>{record.runTime || '-'}</dd>
              </div>
              <div>
                <dt>用时</dt>
                <dd>{record.usedTime || '-'}</dd>
              </div>
              <div>
                <dt>公里</dt>
                <dd>{record.mileage || '-'}</dd>
              </div>
            </dl>
          </article>
        ))}
      </section>
    </main>
  );
}
