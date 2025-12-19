/**
 * 自定义提交页面
 */
import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getRunTask, submitRun } from '../api';
import useAuthStore from '../store/useAuthStore';
import useRunStore from '../store/useRunStore';
import '../styles/pages.css';

function SubmitRun() {
    const navigate = useNavigate();
    const { isLoggedIn, getAuthData } = useAuthStore();
    const { task, setTask, setTaskLoading, setTaskError } = useRunStore();

    const [km, setKm] = useState('');
    const [minutes, setMinutes] = useState('');
    const [pointIndex, setPointIndex] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    // 未登录跳转
    useEffect(() => {
        if (!isLoggedIn) {
            navigate('/');
        }
    }, [isLoggedIn, navigate]);

    // 获取任务（如果没有）
    useEffect(() => {
        if (!isLoggedIn || task) return;

        const fetchTask = async () => {
            setTaskLoading(true);
            try {
                const result = await getRunTask(getAuthData());
                if (result.success) {
                    setTask(result.data);
                    console.log(result.data);
                }
            } catch (error) {
                setTaskError(error.message);
            } finally {
                setTaskLoading(false);
            }
        };

        fetchTask();
    }, [isLoggedIn, task, getAuthData, setTask, setTaskLoading, setTaskError]);

    // 提交
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitting) return;

        setSubmitting(true);
        setResult(null);

        try {
            const options = {};
            if (km) options.km = parseFloat(km);
            if (minutes) options.usedTimeMinutes = parseInt(minutes);
            if (pointIndex !== '') options.pointIndex = parseInt(pointIndex);

            const res = await submitRun(getAuthData(), options);
            setResult(res);
        } catch (error) {
            setResult({ success: false, message: error.message });
        } finally {
            setSubmitting(false);
        }
    };

    if (!isLoggedIn) return null;

    return (
        <div className="page submit-page">
            <div className="page-header">
                <Link to="/dashboard" className="back-link">
                    ← 返回
                </Link>
                <h1 className="page-title">自定义提交</h1>
            </div>

            <form className="submit-form" onSubmit={handleSubmit}>
                <div className="form-group">
                    <label className="form-label">里程 (公里)</label>
                    <input
                        type="number"
                        step="0.01"
                        placeholder={
                            task ? `建议: ${task.mileage}+` : '留空自动生成'
                        }
                        value={km}
                        onChange={(e) => setKm(e.target.value)}
                        className="form-input"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">用时 (分钟)</label>
                    <input
                        type="number"
                        placeholder={
                            task
                                ? `范围: ${task.minTime}-${task.maxTime}`
                                : '留空自动生成'
                        }
                        value={minutes}
                        onChange={(e) => setMinutes(e.target.value)}
                        className="form-input"
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">打卡点</label>
                    <select
                        value={pointIndex}
                        onChange={(e) => setPointIndex(e.target.value)}
                        className="form-input"
                    >
                        <option value="">自动选择</option>
                        {task?.runPointList?.map((point, index) => (
                            <option key={index} value={index}>
                                {point.pointName}
                            </option>
                        ))}
                    </select>
                </div>

                <button
                    type="submit"
                    className={`btn btn-primary btn-large ${
                        submitting ? 'loading' : ''
                    }`}
                    disabled={submitting}
                >
                    {submitting ? '提交中...' : '提交跑步记录'}
                </button>
            </form>

            {result && (
                <div
                    className={`result-card ${
                        result.success ? 'success' : 'error'
                    }`}
                >
                    <p className="result-title">
                        {result.success ? '提交成功' : '提交失败'}
                    </p>
                    <p className="result-message">{result.message}</p>
                    {result.data && (
                        <div className="result-details">
                            <p>里程: {result.data.km} km</p>
                            <p>用时: {result.data.usedTime}</p>
                            <p>时速: {result.data.avgSpeed} km/h</p>
                            <p>步数: {result.data.steps}</p>
                            <p>打卡点: {result.data.selectedPoint}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default SubmitRun;
