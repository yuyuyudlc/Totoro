/**
 * 仪表盘页面
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { submitRun } from '../api';
import useStore from '../store/store';
import '../styles/pages.css';

function Dashboard() {
    const navigate = useNavigate();
    const { isLoggedIn, userInfo, getAuthData, logout } = useStore();
    const {
        submitting,
        submitResult,
        setSubmitting,
        setSubmitResult,
        clearSubmitResult
    } = useStore();

    // 自定义参数（可折叠）
    const [showCustom, setShowCustom] = useState(false);
    const [km, setKm] = useState('');
    const [minutes, setMinutes] = useState('');

    const [runDate, setRunDate] = useState('');
    const [runTime, setRunTime] = useState('');

    // 未登录跳转
    useEffect(() => {
        if (!isLoggedIn) {
            navigate('/');
        }
    }, [isLoggedIn, navigate]);

    // 提交跑步
    const handleSubmit = async () => {
        if (submitting) return;

        setSubmitting(true);
        clearSubmitResult();

        try {
            const options = {};
            if (km) options.km = parseFloat(km);
            if (minutes) options.usedTimeMinutes = parseInt(minutes);
            if (runDate) options.runDate = runDate;
            if (runTime) options.runTime = runTime + ':00';

            const result = await submitRun(getAuthData(), options);
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
            {/* 提示横幅 */}
            <div className="super-tu-banner">
                <div className="tu-text-wrapper">
                    <span className="tu-text">
                        🔥 点击跑步记录一键跑完36次 🔥
                    </span>
                </div>
                <div className="tu-sparkles">
                    <span>✨</span>
                    <span>💯</span>
                    <span>🎉</span>
                    <span>⚡</span>
                    <span>💥</span>
                </div>
            </div>

            {/* 用户信息栏 */}
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
                {/* 快速提交 */}
                <div className="section">
                    <h3 className="section-title">提交跑步</h3>

                    {/* 自定义参数折叠区域 */}
                    <button
                        className="btn btn-text"
                        onClick={() => setShowCustom(!showCustom)}
                        style={{ marginBottom: '12px', fontSize: '14px' }}
                    >
                        {showCustom ? '▼ 收起自定义参数' : '▶ 自定义参数（可选）'}
                    </button>

                    {showCustom && (
                        <div className="custom-params">
                            <div className="form-group">
                                <label className="form-label">里程 (公里)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="留空自动生成"
                                    value={km}
                                    onChange={(e) => setKm(e.target.value)}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">用时 (分钟)</label>
                                <input
                                    type="number"
                                    placeholder="留空自动生成"
                                    value={minutes}
                                    onChange={(e) => setMinutes(e.target.value)}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">跑步日期</label>
                                <input
                                    type="date"
                                    value={runDate}
                                    onChange={(e) => setRunDate(e.target.value)}
                                    className="form-input"
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">开始时间</label>
                                <input
                                    type="time"
                                    value={runTime}
                                    onChange={(e) => setRunTime(e.target.value)}
                                    className="form-input"
                                />
                            </div>
                        </div>
                    )}

                    <button
                        className={`btn btn-primary btn-large ${submitting ? 'loading' : ''
                            }`}
                        onClick={handleSubmit}
                        disabled={submitting}
                    >
                        {submitting ? '提交中...' : '一键提交跑步记录'}
                    </button>

                    {submitResult && (
                        <div
                            className={`result-card ${submitResult.success ? 'success' : 'error'
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
                                    <span>用时: {submitResult.data.usedTime}</span>
                                    {submitResult.data.avgSpeed && (
                                        <span>时速: {submitResult.data.avgSpeed} km/h</span>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* 导航链接 */}
                <div className="nav-links">
                    <Link to="/records" className="nav-link">
                        <span>跑步记录</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
