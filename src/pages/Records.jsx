/**
 * 跑步记录页面
 */
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getRunRecords, bulkRun } from '../api';
import useStore from '../store/store';
import '../styles/pages.css';

function Records() {
    const navigate = useNavigate();
    const { isLoggedIn, getAuthData } = useStore();
    const { records, recordsLoading, setRecords, setRecordsLoading } = useStore();
    const [taskInfo, setTaskInfo] = useState(null);
    const [bulkRunning, setBulkRunning] = useState(false);
    const [bulkProgress, setBulkProgress] = useState(null);

    // 未登录跳转
    useEffect(() => {
        if (!isLoggedIn) {
            navigate('/');
        }
    }, [isLoggedIn, navigate]);

    // 获取记录
    const fetchRecords = async () => {
        setRecordsLoading(true);
        try {
            const result = await getRunRecords(getAuthData());
            if (result.success) {
                // 去重：一天只保留一条记录
                const seenDays = new Set();
                const uniqueRecords = result.records.filter((record) => {
                    if (seenDays.has(record.day)) {
                        return false;
                    }
                    seenDays.add(record.day);
                    return true;
                });
                setRecords(uniqueRecords);
                setTaskInfo(result.task_info);
            }
        } catch (error) {
            console.error('获取记录失败:', error);
        } finally {
            setRecordsLoading(false);
        }
    };

    useEffect(() => {
        if (!isLoggedIn) return;
        fetchRecords();
    }, [isLoggedIn]);

    // 一键跑完36次
    const handleBulkRun = async () => {
        const remainingCount = 36 - records.length;
        if (remainingCount <= 0) {
            alert('已完成36次跑步，无需补跑！');
            return;
        }

        if (
            !confirm(
                `确定要一键补跑 ${remainingCount} 次吗？\n这将在任务日期范围内随机选择未跑的日期进行提交。`
            )
        ) {
            return;
        }

        setBulkRunning(true);
        setBulkProgress({
            submitted: 0,
            total: remainingCount,
            message: '正在提交...'
        });

        try {
            const result = await bulkRun(getAuthData(), remainingCount);

            if (result.success) {
                setBulkProgress({
                    submitted: result.total_submitted,
                    total: remainingCount,
                    message: result.message
                });
                await fetchRecords();
                alert(`${result.message}\n\n详细结果请查看控制台。`);
                console.log('批量跑步结果:', result.results);
            } else {
                alert(`批量跑步失败: ${result.message}`);
            }
        } catch (error) {
            console.error('批量跑步失败:', error);
            alert(`批量跑步失败: ${error.message}`);
        } finally {
            setBulkRunning(false);
            setBulkProgress(null);
        }
    };

    if (!isLoggedIn) return null;

    const remainingCount = 36 - records.length;

    return (
        <div className="page records-page">
            <div className="page-header">
                <Link to="/dashboard" className="back-link">
                    ← 返回
                </Link>
                <h1 className="page-title">跑步记录</h1>
            </div>

            {/* 任务日期范围信息 */}
            {taskInfo && (
                <div className="task-info-card">
                    <div className="task-info-label">当前任务周期</div>
                    <div className="task-info-dates">
                        {taskInfo.startDate} ~ {taskInfo.endDate}
                    </div>
                    <div className="task-info-count">
                        已完成 {records.length} / 36 次跑步
                        {remainingCount > 0 && (
                            <span className="remaining-count">
                                （还需 {remainingCount} 次）
                            </span>
                        )}
                    </div>

                    {remainingCount > 0 && !recordsLoading && (
                        <button
                            className="bulk-run-btn"
                            onClick={handleBulkRun}
                            disabled={bulkRunning}
                        >
                            {bulkRunning ? (
                                <>
                                    <span className="btn-spinner"></span>
                                    {bulkProgress
                                        ? `${bulkProgress.message}`
                                        : '提交中...'}
                                </>
                            ) : (
                                `一键跑完 ${remainingCount} 次`
                            )}
                        </button>
                    )}

                    {remainingCount <= 0 && (
                        <div className="completed-badge">
                            已完成本周期所有跑步任务
                        </div>
                    )}
                </div>
            )}

            {recordsLoading && (
                <div className="loading-card">
                    <div className="loading-spinner"></div>
                    <span>加载中...</span>
                </div>
            )}

            {!recordsLoading && records.length === 0 && (
                <div className="empty-card">
                    <p>暂无跑步记录</p>
                </div>
            )}

            <div className="records-list">
                {records.map((record, index) => (
                    <div key={index} className="record-card">
                        <div className="record-header">
                            <span className="record-date">{record.day}</span>
                            <span
                                className={`record-status ${
                                    record.status === '1' ? 'success' : ''
                                }`}
                            >
                                {record.status === '1' ? '有效' : '待审核'}
                            </span>
                        </div>
                        <div className="record-body">
                            <div className="record-stat">
                                <span className="stat-value">
                                    {record.runTime}
                                </span>
                                <span className="stat-label">开始时间</span>
                            </div>
                            <div className="record-stat">
                                <span className="stat-value">
                                    {record.usedTime}
                                </span>
                                <span className="stat-label">用时</span>
                            </div>
                            <div className="record-stat">
                                <span className="stat-value">
                                    {record.mileage}
                                </span>
                                <span className="stat-label">公里</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Records;
