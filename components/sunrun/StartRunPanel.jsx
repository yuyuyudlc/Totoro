'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentRunJobs, getRunJobStatus, previewRun, startRun } from '../../lib/client/api';
import { REAL_DEVICE_PROFILES, formatDeviceProfile } from '../../lib/shared/device-profiles';
import { parseUsedTime, sanitizeMileageInput, summarizeMetrics } from '../../lib/shared/run-metrics';
import useStore from '../../lib/client/store';

export default function StartRunPanel({ task }) {
  const getAuthData = useStore(state => state.getAuthData);
  const deviceId = useStore(state => state.deviceId);
  const setDeviceId = useStore(state => state.setDeviceId);
  const pending = useRef(false);
  const [pointId, setPointId] = useState('');
  const [operation, setOperation] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [queuedJobs, setQueuedJobs] = useState([]);
  const [queueReady, setQueueReady] = useState(false);
  const [km, setKm] = useState('');
  const [usedTime, setUsedTime] = useState('');
  const [applied, setApplied] = useState(null);
  const queuedJobsRef = useRef([]);
  const queuedJobIds = queuedJobs.map(job => job.jobId).join(':');
  const routes = Array.isArray(task?.runPointList) ? task.runPointList : [];
  const route = routes.find(point => point.pointId === pointId) || routes[0];

  // 里程或用时一改，配速和步数就地重算，不用等重新生成预览。
  const liveMetrics = useMemo(() => {
    if (!preview) return null;
    const meters = Math.round(Number(km) * 1000);
    const seconds = parseUsedTime(usedTime);
    if (!Number.isFinite(meters) || meters < 200 || meters > 50000 || seconds == null) return null;
    return summarizeMetrics({ meters, durationSeconds: seconds });
  }, [preview, km, usedTime]);

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

  function applyPreview(nextPreview) {
    setPreview(nextPreview);
    setKm(nextPreview.track.km);
    setUsedTime(nextPreview.track.usedTime);
    setApplied({ km: nextPreview.track.km, usedTime: nextPreview.track.usedTime });
  }

  async function generatePreview(overrides) {
    if (pending.current || !task) return;
    pending.current = true;
    setOperation(overrides ? 'regenerate' : 'preview');
    setError('');
    setResult(null);
    try {
      const data = await previewRun(getAuthData(), task, route, overrides, deviceId);
      applyPreview(data.preview);
    } catch (caught) {
      setError(caught.message);
    } finally {
      pending.current = false;
      setOperation('');
    }
  }

  function regenerate() {
    const kilometers = Number(km);
    if (!Number.isFinite(kilometers) || kilometers < 0.2 || kilometers > 50) {
      setError('里程需要在 0.2 到 50 公里之间');
      return;
    }
    if (parseUsedTime(usedTime) == null) {
      setError('用时格式应为 HH:MM:SS 或 MM:SS');
      return;
    }
    generatePreview({ km: kilometers.toFixed(2), usedTime: usedTime.trim() });
  }

  function selectRoute(event) {
    setPointId(event.target.value);
    setPreview(null);
    setResult(null);
    setError('');
    setApplied(null);
  }

  function selectDevice(event) {
    setDeviceId(event.target.value);
    setPreview(null);
    setResult(null);
    setError('');
    setApplied(null);
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
      setApplied(null);
      setKm('');
      setUsedTime('');
    } catch (caught) {
      setError(caught.message);
    } finally {
      pending.current = false;
      setOperation('');
    }
  }

  const busy = Boolean(operation);
  const taskMileage = Number(task?.mileage);
  const previewSeconds = parseUsedTime(usedTime);
  const minutesMin = Number(task?.minTime);
  const minutesMax = Number(task?.maxTime);
  const outsideWindow = previewSeconds != null && Number.isFinite(minutesMin) && Number.isFinite(minutesMax)
    && (previewSeconds < minutesMin * 60 || previewSeconds > minutesMax * 60);
  const belowMileage = Number.isFinite(taskMileage) && Number(km) > 0 && Number(km) < taskMileage;
  const dirty = Boolean(preview) && (!liveMetrics || !applied
    || liveMetrics.km !== applied.km || liveMetrics.usedTime !== applied.usedTime);
  const shown = liveMetrics || preview?.track;
  const invalidInput = Boolean(preview) && !liveMetrics;

  return <section className="start-run" aria-label="开始跑步" aria-busy={busy}>
    <h2>开始跑步</h2>
    <p>任务与路线来自小程序接口；里程和用时可以手动改，改完重新生成预览再开始。</p>
    {!task && <p className="limit-note">当前没有可用跑步任务。</p>}
    {task && routes.length > 1 && <label className="route-select">
      <span>跑步路线</span>
      <select value={route?.pointId || ''} onChange={selectRoute}>
        {routes.map(point => <option key={point.pointId} value={point.pointId}>{point.pointName}</option>)}
      </select>
    </label>}
    {task && <label className="route-select">
      <span>模拟机型</span>
      <select value={deviceId} onChange={selectDevice} disabled={busy}>
        <option value="">默认（按账号固定）</option>
        {REAL_DEVICE_PROFILES.map(profile => {
          const formatted = formatDeviceProfile(profile);
          return <option key={profile.id} value={profile.id}>{formatted.deviceModel}</option>;
        })}
      </select>
    </label>}
    {task && routes.length === 0 && <p className="limit-note" role="status">
      任务未配置固定路线，开始后使用内置路线 1 生成轨迹，并向上游提交空路线。
    </p>}
    {!queueReady && <p className="limit-note" role="status">正在恢复跑步队列…</p>}
    {queueReady && !preview && !result && queuedJobs.length === 0 && <button className="action-button" type="button" disabled={busy || !task} onClick={() => generatePreview()}>
      {operation === 'preview' ? '正在生成数据…' : '查看跑步数据'}
    </button>}
    {error && <p className="result-block error" role="alert">{error}</p>}
    {preview && <article className="run-preview result-block" aria-labelledby="run-preview-title">
      <div>
        <div>
          <p className="block-label">跑步数据预览</p>
          <strong id="run-preview-title">确认后才会开始跑步</strong>
        </div>
        <span className="preview-state">{dirty ? '修改未生成' : '10 分钟内有效'}</span>
      </div>
      <dl className="run-metrics">
        <div><dt>路线</dt><dd>{preview.track.routeName}</dd></div>
        <div><dt>里程（公里，两位小数）</dt><dd>
          <input className="metric-input" inputMode="decimal" value={km}
            onChange={event => setKm(sanitizeMileageInput(event.target.value))} aria-label="里程（公里）" placeholder="3.20" />
        </dd></div>
        <div><dt>用时（时:分:秒）</dt><dd>
          <input className="metric-input" value={usedTime} onChange={event => setUsedTime(event.target.value)} aria-label="用时" placeholder="00:20:00" />
        </dd></div>
        <div><dt>平均配速</dt><dd className="metric-value">{shown?.avgSpeed || '—'}</dd></div>
        <div><dt>步数</dt><dd className="metric-value">{shown?.steps || '—'}</dd></div>
        {preview.track.fitDegree != null && <div><dt>预估拟合度</dt><dd className="metric-value">{preview.track.fitDegree}</dd></div>}
        {preview.track.deviceModel && <div className="device-metric"><dt>模拟机型</dt><dd title={preview.track.deviceModel}>{preview.track.deviceModel}</dd></div>}
      </dl>
      {invalidInput && <p className="limit-note" role="status">里程需要在 0.2–50 公里之间，用时格式为 HH:MM:SS 或 MM:SS。</p>}
      {!invalidInput && dirty && <p className="limit-note" role="status">配速和步数已按新值重算；点“按修改重新生成”后预览才会生效。</p>}
      {(outsideWindow || belowMileage) && <p className="limit-note" role="status">
        {belowMileage && `低于任务要求 ${taskMileage} 公里，`}
        {outsideWindow && `超出任务时段 ${minutesMin}–${minutesMax} 分钟，`}
        上游可能不计成绩。
      </p>}
      <div className="run-preview-actions">
        <button className="action-button secondary" type="button" disabled={busy || !dirty} onClick={regenerate}>
          {operation === 'regenerate' ? '正在按修改生成…' : '按修改重新生成'}
        </button>
        <button className="action-button" type="button" disabled={busy || dirty} onClick={execute}>
          {operation === 'start' ? '正在跑步…' : dirty ? '先应用修改' : route ? '确认并开始跑步' : '确认并开始无固定路线跑步'}
        </button>
      </div>
      <button className="link-button" type="button" disabled={busy} onClick={() => generatePreview()}>
        重新随机生成
      </button>
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
      <button className="action-button secondary" type="button" disabled={busy} onClick={() => generatePreview()}>
        查看下一次跑步数据
      </button>
    </article>}
  </section>;
}
