'use client';

import { useEffect, useRef, useState } from 'react';
import { getCurrentRunJobs, getRunJobStatus, previewRun, startRun } from '../lib/api';
import useStore from '../lib/store';

export default function StartRunPanel({ task, route }) {
  const getAuthData = useStore(state => state.getAuthData);
  const pending = useRef(false);
  const [operation, setOperation] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [queuedJobs, setQueuedJobs] = useState([]);
  const [queueReady, setQueueReady] = useState(false);
  const queuedJobsRef = useRef([]);
  const queuedJobIds = queuedJobs.map(job => job.jobId).join(':');

  useEffect(() => {
    queuedJobsRef.current = queuedJobs;
  }, [queuedJobs]);

  useEffect(() => {
    let cancelled = false;
    getCurrentRunJobs(getAuthData()).then(data => {
      if (!cancelled) setQueuedJobs(data.jobs || []);
    }).catch(caught => {
      if (!cancelled) setError(caught.message);
    }).finally(() => {
      if (!cancelled) setQueueReady(true);
    });
    return () => { cancelled = true; };
  }, [getAuthData]);

  useEffect(() => {
    if (!queuedJobIds) return undefined;
    let cancelled = false;
    let timer;

    async function poll() {
      const statuses = await Promise.allSettled(
        queuedJobsRef.current.map(job => getRunJobStatus(getAuthData(), job.jobId)),
      );
      if (cancelled) return;
      const remaining = [];
      let pollingError = '';
      statuses.forEach((status, index) => {
        const queued = queuedJobsRef.current[index];
        if (status.status === 'rejected') {
          remaining.push(queued);
          pollingError = `${status.reason.message}，正在重试`;
          return;
        }
        if (status.value.job.state === 'completed') {
          setResult(status.value.job.result);
          return;
        }
        if (status.value.job.state === 'failed') {
          pollingError = status.value.job.failedReason || '延迟任务处理失败';
          return;
        }
        remaining.push({ ...queued, state: status.value.job.state });
      });
      setQueuedJobs(remaining);
      setError(pollingError);
      if (remaining.length) timer = window.setTimeout(poll, 2000);
    }

    timer = window.setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [getAuthData, queuedJobIds]);

  async function generatePreview() {
    if (pending.current || !task) return;
    pending.current = true;
    setOperation('preview');
    setError('');
    setResult(null);
    try {
      const data = await previewRun(getAuthData(), task, route);
      setPreview(data.preview);
    } catch (caught) {
      setError(caught.message);
    } finally {
      pending.current = false;
      setOperation('');
    }
  }

  async function execute() {
    if (pending.current || !preview) return;
    pending.current = true;
    setOperation('start');
    setError('');
    try {
      const data = await startRun(getAuthData(), task, route, preview.previewToken);
      setQueuedJobs(current => [data.result, ...current.filter(job => job.jobId !== data.result.jobId)]);
      setResult(null);
      setPreview(null);
    } catch (caught) {
      setError(caught.message);
    } finally {
      pending.current = false;
      setOperation('');
    }
  }

  const busy = Boolean(operation);

  return <section className="start-run" aria-label="开始跑步" aria-busy={busy}>
    <h2>开始跑步</h2>
    <p>先生成并核对本次跑步数据，确认无误后再开始。</p>
    {!task && <p className="limit-note">当前没有可用跑步任务。</p>}
    {task && !route && <p className="limit-note" role="status">
      当前任务未配置固定路线；开始后仍会创建真实跑步场次，并按空路线任务提交成绩。
    </p>}
    {!queueReady && <p className="limit-note" role="status">正在恢复跑步队列…</p>}
    {queueReady && !preview && !result && queuedJobs.length === 0 && <button className="action-button" type="button" disabled={busy || !task} onClick={generatePreview}>
      {operation === 'preview' ? '正在生成数据…' : '查看跑步数据'}
    </button>}
    {error && <p className="result-block error" role="alert">{error}</p>}
    {preview && <article className="run-preview result-block" aria-labelledby="run-preview-title">
      <div>
        <div>
          <p className="block-label">跑步数据预览</p>
          <strong id="run-preview-title">确认后才会开始跑步</strong>
        </div>
        <span className="preview-state">10 分钟内有效</span>
      </div>
      <dl className="run-metrics">
        <div><dt>路线</dt><dd>{preview.track.routeName}</dd></div>
        <div><dt>里程</dt><dd className="metric-value">{preview.track.km} km</dd></div>
        <div><dt>用时</dt><dd className="metric-value">{preview.track.usedTime}</dd></div>
        <div><dt>平均配速</dt><dd className="metric-value">{preview.track.avgSpeed}</dd></div>
        <div><dt>步数</dt><dd className="metric-value">{preview.track.steps}</dd></div>
        {preview.track.fitDegree != null && <div><dt>预估拟合度</dt><dd className="metric-value">{preview.track.fitDegree}</dd></div>}
        {preview.track.deviceModel && <div className="device-metric"><dt>模拟机型</dt><dd title={preview.track.deviceModel}>{preview.track.deviceModel}</dd></div>}
      </dl>
      <div className="run-preview-actions">
        <button className="action-button secondary" type="button" disabled={busy} onClick={generatePreview}>
          {operation === 'preview' ? '正在重新生成…' : '重新生成'}
        </button>
        <button className="action-button" type="button" disabled={busy} onClick={execute}>
          {operation === 'start' ? '正在跑步…' : route ? '确认并开始跑步' : '确认并开始无固定路线跑步'}
        </button>
      </div>
    </article>}
    {queuedJobs.map(job => <article className="run-result result-block" role="status" key={job.jobId}>
      <div>
        <strong>{job.state === 'active' ? '正在提交跑步数据' : '跑步已加入延迟队列'}</strong>
        <span>{job.track.routeName} · {job.track.km} km · {job.track.usedTime}</span>
      </div>
      <div className="inline-stats">
        <span>{job.state === 'active' ? '独立 Worker 正在处理' : '正在等待独立 Worker'}</span>
        <span>计划处理：{new Date(job.scheduledAt).toLocaleTimeString('zh-CN')}</span>
      </div>
      <p>任务 {job.jobId}</p>
    </article>)}
    {result && <article className="run-result result-block success" role="status">
      <div>
        <strong>跑步流程已完成</strong>
        <span>{result.track.routeName} · {result.track.km} km · {result.track.usedTime}</span>
      </div>
      <div className="inline-stats">
        <span>配速 {result.track.avgSpeed}</span>
        <span>{result.track.steps} 步</span>
      </div>
      <p>场次 {result.scantronId}</p>
      <button className="action-button secondary" type="button" disabled={busy} onClick={generatePreview}>
        查看下一次跑步数据
      </button>
    </article>}
  </section>;
}
