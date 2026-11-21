'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { getMorningSignTask, submitMorningSign } from '../../lib/client/api';
import useStore from '../../lib/client/store';

export default function MorningSignPanel() {
  const getAuthData = useStore(state => state.getAuthData);
  const loadingRef = useRef(false);
  const submittingRef = useRef(false);
  const [task, setTask] = useState(null);
  const [pointId, setPointId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const loadTask = useCallback(async ({ preserveFeedback = false } = {}) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    if (!preserveFeedback) {
      setError('');
      setResult(null);
    }
    try {
      const data = await getMorningSignTask(getAuthData());
      const nextTask = data.task;
      setTask(nextTask);
      setPointId(current => nextTask.signPointList.some(point => point.pointId === current)
        ? current
        : nextTask.signPointList[0]?.pointId || '');
    } catch (caught) {
      setTask(null);
      setError(caught.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [getAuthData]);

  useEffect(() => {
    let active = true;
    getMorningSignTask(getAuthData()).then(data => {
      if (!active) return;
      setTask(data.task);
      setPointId(data.task.signPointList[0]?.pointId || '');
    }).catch(caught => {
      if (active) setError(caught.message);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [getAuthData]);

  async function handleSubmit() {
    if (submittingRef.current || !pointId) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const data = await submitMorningSign(getAuthData(), pointId);
      setResult(data.result);
      await loadTask({ preserveFeedback: true });
    } catch (caught) {
      setError(caught.message);
      await loadTask({ preserveFeedback: true });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const points = task?.signPointList || [];
  const completed = Number(task?.dayCompSignCount || 0);
  const required = Number(task?.dayNeedSignCount || 0);

  return <section className="command-panel morning-sign-panel" aria-label="早操打卡" aria-busy={loading || submitting}>
    <div className="top-strip morning-sign-header">
      <div className="panel-copy">
        <p className="block-label">Morning Sign</p>
        <h2>早操打卡</h2>
      </div>
      <button className="icon-button" type="button" aria-label="刷新早操任务"
        disabled={loading || submitting} onClick={() => loadTask()}>
        <RefreshCcw size={20} aria-hidden="true" />
      </button>
    </div>

    {loading && !task ? <p role="status">正在获取早操任务…</p> : null}
    {error ? <p className="result-block error" role="alert">{error}</p> : null}
    {!loading && !error && !task ? <p>当前没有可用早操任务。</p> : null}

    {task ? <>
      <dl className="morning-metrics">
        <div><dt>任务日期</dt><dd>{task.startDate || '-'} 至 {task.endDate || '-'}</dd></div>
        <div><dt>签到时段</dt><dd>{task.startTime || '-'}–{task.endTime || '-'}</dd></div>
        <div><dt>今日进度</dt><dd>{completed}/{required}</dd></div>
        <div><dt>任务范围</dt><dd>{task.offsetRange || '-'} 米</dd></div>
      </dl>

      {points.length ? <div className="morning-sign-controls">
        <label htmlFor="morning-sign-point"><span>签到点位</span>
          <select id="morning-sign-point" value={pointId} disabled={submitting}
            onChange={event => setPointId(event.target.value)}>
            {points.map(point => <option key={`${point.taskId}:${point.pointId}`} value={point.pointId}>
              {point.pointName}（{point.pointId}）
            </option>)}
          </select>
        </label>
        <button className="action-button morning-submit" type="button" disabled={loading || submitting || !pointId}
          onClick={handleSubmit}>
          {submitting ? '正在提交签到…' : '提交签到'}
        </button>
      </div> : <p className="limit-note">当前任务没有可提交的签到点位。</p>}
    </> : null}

    {result ? <article className={`result-block ${result.accepted ? 'success' : 'error'}`}
      role={result.accepted ? 'status' : 'alert'}>
      <strong>{result.accepted ? '上游已接受签到' : '上游已拒绝签到'}</strong>
      <span>{result.message}</span>
      <div className="inline-stats">
        <span>状态 {result.status || '-'}</span>
        <span>代码 {result.code || '-'}</span>
        <span>{result.pointName} · {result.submittedAt}</span>
      </div>
    </article> : null}
  </section>;
}
