'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, LogOut, ListChecks, Send } from 'lucide-react';
import RunNoticeDialog from '../../components/RunNoticeDialog';
import { submitRun } from '../../lib/api';
import useStore from '../../lib/store';

export default function DashboardPage() {
  const router = useRouter();
  const {
    hasHydrated,
    isLoggedIn,
    userInfo,
    getAuthData,
    logout,
    submitting,
    submitResult,
    setSubmitting,
    setSubmitResult,
    clearSubmitResult,
  } = useStore();

  const [showCustom, setShowCustom] = useState(false);
  const [km, setKm] = useState('');
  const [minutes, setMinutes] = useState('');
  const [runDate, setRunDate] = useState('');
  const [runTime, setRunTime] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);

  useEffect(() => {
    if (hasHydrated && !isLoggedIn) {
      router.replace('/');
    }
  }, [hasHydrated, isLoggedIn, router]);

  const handleSubmit = () => {
    if (submitting) return;
    setNoticeOpen(true);
  };

  const runSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);
    clearSubmitResult();

    try {
      const options = {};
      if (km) options.km = Number.parseFloat(km);
      if (minutes) options.usedTimeMinutes = Number.parseInt(minutes, 10);
      if (runDate) options.runDate = runDate;
      if (runTime) options.runTime = `${runTime}:00`;

      const result = await submitRun(getAuthData(), options);
      setSubmitResult(result);
    } catch (error) {
      setSubmitResult({ success: false, message: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  if (!hasHydrated || !isLoggedIn) {
    return <main className="screen">Loading</main>;
  }

  return (
    <main className="screen app-screen">
      <header className="top-strip">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h1 className="page-heading">一次提交</h1>
        </div>
        <button className="icon-text-button" onClick={handleLogout} type="button">
          <LogOut size={18} />
          退出
        </button>
      </header>

      <section className="identity-block">
        <div>
          <p className="block-label">当前账号</p>
          <h2>{userInfo?.stuName || '用户'}</h2>
        </div>
        <p>
          {userInfo?.stuNumber || '-'} / {userInfo?.schoolName || '-'}
        </p>
      </section>

      <section className="command-panel">
        <div className="panel-copy">
          <p className="block-label">Run Command</p>
          <h2>提交跑步记录</h2>
        </div>

        <button
          className="text-toggle"
          onClick={() => setShowCustom((value) => !value)}
          type="button"
        >
          {showCustom ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          自定义参数
        </button>

        {showCustom && (
          <div className="form-grid">
            <label>
              <span>里程 / 公里</span>
              <input
                type="number"
                step="0.01"
                placeholder="自动生成"
                value={km}
                onChange={(event) => setKm(event.target.value)}
              />
            </label>
            <label>
              <span>用时 / 分钟</span>
              <input
                type="number"
                placeholder="自动生成"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
            </label>
            <label>
              <span>跑步日期</span>
              <input
                type="date"
                value={runDate}
                onChange={(event) => setRunDate(event.target.value)}
              />
            </label>
            <label>
              <span>开始时间</span>
              <input
                type="time"
                value={runTime}
                onChange={(event) => setRunTime(event.target.value)}
              />
            </label>
          </div>
        )}

        <button
          className="primary-command"
          onClick={handleSubmit}
          disabled={submitting}
          type="button"
        >
          <Send size={24} />
          {submitting ? '提交中' : '一键提交'}
        </button>

        {submitResult && (
          <div className={`result-block ${submitResult.success ? 'success' : 'error'}`}>
            <strong>{submitResult.success ? '提交成功' : '提交失败'}</strong>
            <span>{submitResult.message}</span>
            {submitResult.data && (
              <div className="inline-stats">
                <span>{submitResult.data.km} km</span>
                <span>{submitResult.data.usedTime}</span>
                {submitResult.data.avgSpeed && <span>{submitResult.data.avgSpeed} km/h</span>}
              </div>
            )}
          </div>
        )}
      </section>

      <Link href="/records" className="wide-link">
        <ListChecks size={22} />
        跑步记录
      </Link>

      <RunNoticeDialog
        open={noticeOpen}
        onClose={() => setNoticeOpen(false)}
        onConfirm={() => {
          setNoticeOpen(false);
          runSubmit();
        }}
      />
    </main>
  );
}
