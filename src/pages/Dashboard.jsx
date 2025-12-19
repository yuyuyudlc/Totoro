/**
 * 仪表盘页面
 */
import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getRunTask, submitRun } from '../api';
import useAuthStore from '../store/useAuthStore';
import useRunStore from '../store/useRunStore';
import '../styles/pages.css';

function Dashboard() {
    const navigate = useNavigate();
    const { isLoggedIn, userInfo, getAuthData, logout } = useAuthStore();
    const {
        task,
        taskLoading,
        taskError,
        setTask,
        setTaskLoading,
        setTaskError,
        submitting,
        submitResult,
        setSubmitting,
        setSubmitResult,
        clearSubmitResult
    } = useRunStore();

    // 未登录跳转
    useEffect(() => {
        if (!isLoggedIn) {
            navigate('/');
        }
    }, [isLoggedIn, navigate]);

    // 获取任务
    useEffect(() => {
        if (!isLoggedIn) return;

        const fetchTask = async () => {
            setTaskLoading(true);
            try {
                const result = await getRunTask(getAuthData());
                if (result.success) {
                    setTask(result.data);
                } else {
                    setTaskError(result.message);
                }
            } catch (error) {
                setTaskError(error.message);
            } finally {
                setTaskLoading(false);
            }
        };

        fetchTask();
    }, [isLoggedIn, getAuthData, setTask, setTaskLoading, setTaskError]);

    // 快速提交
    const handleQuickSubmit = async () => {
        if (submitting) return;

        setSubmitting(true);
        clearSubmitResult();

        try {
            const result = await submitRun(getAuthData());
            setSubmitResult(result);
        } catch (error) {
            setSubmitResult({ success: false, message: error.message });
        } finally {
            setSubmitting(false);
        }
    };

    // 登出
    const handleLogout = () => {
        logout();
        navigate('/');
    };

    if (!isLoggedIn) return null;

    return (
        <div className="page dashboard-page">
            {/* 用户顶部信息栏 */}
            <div className="user-card">
                <div className="user-info">
                    <h2 className="user-name">{userInfo?.stuName || '用户'}</h2>
                    <p className="user-detail">
                        {userInfo?.stuNumber} | {userInfo?.schoolName}
                    </p>
                </div>
                <button className="btn btn-text" onClick={handleLogout}>
                    退出
                </button>
            </div>

            <div className="dashboard-main">
                {/* 任务信息 */}
                <div className="section">
                    <h3 className="section-title">本学期任务概览</h3>

                    {taskLoading && (
                        <div className="loading-card">
                            <div className="loading-spinner"></div>
                            <span>加载中...</span>
                        </div>
                    )}

                    {taskError && (
                        <div className="error-card">
                            <p>{taskError}</p>
                        </div>
                    )}

                    {task && !taskLoading && (
                        <div className="task-card">
                            <div className="task-col">
                                <span className="task-value highlight">
                                    {task.mileage}
                                </span>
                                <span className="task-label">目标公里</span>
                            </div>
                            <div className="task-col">
                                <span className="task-value">
                                    {task.ifHasRun === '1' ? '已完成' : '未跑'}
                                </span>
                                <span className="task-label">今日状态</span>
                            </div>
                            <div className="task-col">
                                <span className="task-value">
                                    {task.minTime}-{task.maxTime}
                                </span>
                                <span className="task-label">单次时长(分)</span>
                            </div>
                            <div className="task-col">
                                <span
                                    className="task-value"
                                    style={{
                                        fontSize: '16px',
                                        lineHeight: '36px'
                                    }}
                                >
                                    {task.startTime}-{task.endTime}
                                </span>
                                <span className="task-label">有效时段</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* 快速提交 */}
                <div className="section">
                    <h3 className="section-title">快速提交</h3>

                    <button
                        className={`btn btn-primary btn-large ${
                            submitting ? 'loading' : ''
                        }`}
                        onClick={handleQuickSubmit}
                        disabled={submitting}
                    >
                        {submitting ? '提交中...' : '一键提交跑步记录'}
                    </button>

                    {submitResult && (
                        <div
                            className={`result-card ${
                                submitResult.success ? 'success' : 'error'
                            }`}
                        >
                            <p className="result-title">
                                {submitResult.success ? '提交成功' : '提交失败'}
                            </p>
                            <p className="result-message">
                                {submitResult.message}
                            </p>
                            {submitResult.data && (
                                <div className="result-data">
                                    <span>里程: {submitResult.data.km} km</span>
                                    <span>
                                        用时: {submitResult.data.usedTime}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 导航链接 */}
                <div className="nav-links">
                    <Link to="/submit" className="nav-link">
                        <span>自定义提交</span>
                    </Link>
                    <Link to="/records" className="nav-link">
                        <span>跑步记录</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
