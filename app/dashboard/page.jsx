"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, RefreshCcw } from 'lucide-react';
import { getRunTasks } from '../../lib/client/api';
import StartRunPanel from '../../components/sunrun/StartRunPanel';
import MorningSignPanel from '../../components/morning-sign/MorningSignPanel';
import DiscussionComments from '../../components/common/DiscussionComments';
import useStore from '../../lib/client/store';

export default function DashboardPage() {
  const router = useRouter();
  const { hasHydrated, isLoggedIn, userInfo, getAuthData, logout } = useStore();
  const [tasks, setTasks] = useState([]);
  const [taskId, setTaskId] = useState('');
  const [taskError, setTaskError] = useState('');
  const [tasksLoading, setTasksLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [activeTaskType, setActiveTaskType] = useState('run');
  const task = tasks.find(item => item.taskId === taskId) || tasks[0];

  useEffect(() => {
    if (!hasHydrated || !isLoggedIn) return;
    let active = true;
    getRunTasks(getAuthData()).then(result => {
      if (!result.success) throw new Error(result.message || '获取任务失败');
      if (active) {
        setTasks(result.tasks);
        setTaskError('');
      }
    }).catch(error => {
      if (active) {
        setTasks([]);
        setTaskError(error.message);
      }
    }).finally(() => { if (active) setTasksLoading(false); });
    return () => { active = false; };
  }, [hasHydrated, isLoggedIn, getAuthData, revision]);

  useEffect(() => {
    if (hasHydrated && !isLoggedIn) router.replace('/');
  }, [hasHydrated, isLoggedIn, router]);

  function selectTaskType(nextTaskType) {
    setActiveTaskType(nextTaskType);
  }

  function handleTaskTabKeyDown(event) {
    const taskTypes = ['run', 'morning'];
    const currentIndex = taskTypes.indexOf(event.currentTarget.dataset.taskType);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % taskTypes.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + taskTypes.length) % taskTypes.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = taskTypes.length - 1;
    if (nextIndex === currentIndex) return;
    event.preventDefault();
    const nextTaskType = taskTypes[nextIndex];
    selectTaskType(nextTaskType);
    document.getElementById(`${nextTaskType}-task-tab`)?.focus();
  }

  if (!hasHydrated || !isLoggedIn) return <main className="screen">加载中</main>;

  return (
    <main className="screen app-screen">
      <header className="top-strip">
        <div><p className="eyebrow">Sunrun / Morning Sign</p><h1 className="page-heading">运动打卡</h1></div>
        <button className="icon-text-button" onClick={() => { logout(); router.replace('/'); }} type="button">
          <LogOut size={18} />退出
        </button>
      </header>
      <section className="identity-block">
        <div><p className="block-label">当前账号</p><h2>{userInfo?.stuName || '用户'}</h2></div>
        <p>{userInfo?.stuNumber || '-'} / {userInfo?.schoolName || '-'}</p>
      </section>
      <div className="task-tabs" role="tablist" aria-label="任务类型">
        <button id="run-task-tab" className="task-tab" type="button" role="tab"
          aria-selected={activeTaskType === 'run'} aria-controls="run-task-panel"
          tabIndex={activeTaskType === 'run' ? 0 : -1} data-task-type="run"
          onKeyDown={handleTaskTabKeyDown} onClick={() => selectTaskType('run')}>跑步任务</button>
        <button id="morning-task-tab" className="task-tab" type="button" role="tab"
          aria-selected={activeTaskType === 'morning'} aria-controls="morning-task-panel"
          tabIndex={activeTaskType === 'morning' ? 0 : -1} data-task-type="morning"
          onKeyDown={handleTaskTabKeyDown} onClick={() => selectTaskType('morning')}>早操任务</button>
      </div>
      {activeTaskType === 'run' ? <section id="run-task-panel" className="command-panel" role="tabpanel" aria-labelledby="run-task-tab">
        <div className="top-strip">
          <div className="panel-copy"><p className="block-label">Task & Route</p><h2>任务与路线</h2></div>
          <button className="icon-button" type="button" aria-label="刷新任务" disabled={tasksLoading}
            onClick={() => { setTasksLoading(true); setRevision(value => value + 1); }}><RefreshCcw size={20} /></button>
        </div>
        {tasksLoading && <p role="status">正在加载跑步任务…</p>}
        {taskError && <p className="result-block error" role="alert">{taskError}</p>}
        {!tasksLoading && !taskError && !task && <p>当前没有可用跑步任务</p>}
        {task && (
          <div className="form-grid">
            <label><span>跑步任务</span>
              <select value={task.taskId} onChange={event => setTaskId(event.target.value)}>
                {tasks.map(item => <option key={item.taskId} value={item.taskId}>{item.name}</option>)}
              </select>
            </label>
            <p className="limit-note">{task.mileage} 公里 · {task.minTime}–{task.maxTime} 分钟 · {task.runPointList.length} 条路线<br />
              {task.startDate} 至 {task.endDate}<br />
              {task.runTimeRuleList.map(rule => `${rule.startTime}–${rule.endTime}`).join(' / ')}
            </p>
          </div>
        )}
        {!tasksLoading && <StartRunPanel key={task?.taskId || ''} task={task} />}
      </section> : <section id="morning-task-panel" role="tabpanel" aria-labelledby="morning-task-tab">
        <MorningSignPanel />
      </section>}
      <DiscussionComments />
    </main>
  );
}
