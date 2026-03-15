/**
 * 登录页面 - 微信扫码登录
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getQRCode, pollScanStatus, completeLogin } from '../api';
import useStore from '../store/store';
import '../styles/pages.css';

function Login() {
    const navigate = useNavigate();
    const { isLoggedIn, login } = useStore();

    const [qrcode, setQrcode] = useState(null);
    const [status, setStatus] = useState('loading');
    const [message, setMessage] = useState('');
    const [polling, setPolling] = useState(false);

    // 已登录直接跳转
    useEffect(() => {
        if (isLoggedIn) {
            navigate('/dashboard');
        }
    }, [isLoggedIn, navigate]);

    // 获取二维码
    const fetchQRCode = useCallback(async () => {
        setStatus('loading');
        setMessage('正在获取二维码...');

        try {
            const data = await getQRCode();
            setQrcode(data);
            setStatus('waiting');
            setMessage('请使用微信扫描二维码');
            setPolling(true);
        } catch (error) {
            setStatus('error');
            setMessage('获取二维码失败: ' + error.message);
        }
    }, []);

    useEffect(() => {
        fetchQRCode();
    }, [fetchQRCode]);

    // 轮询扫码状态
    useEffect(() => {
        if (!polling || !qrcode?.uuid) return;

        const pollInterval = setInterval(async () => {
            try {
                const result = await pollScanStatus(qrcode.uuid);

                if (result.status === 404) {
                    setStatus('scanned');
                    setMessage('已扫码，请在手机上确认');
                } else if (result.status === 405 && result.wx_code) {
                    setPolling(false);
                    setStatus('loading');
                    setMessage('正在登录...');

                    const loginResult = await completeLogin(result.wx_code);

                    if (loginResult.success) {
                        setStatus('success');
                        setMessage('登录成功！');
                        login(loginResult.data);
                        setTimeout(() => navigate('/dashboard'), 500);
                    } else {
                        setStatus('error');
                        setMessage('登录失败: ' + loginResult.message);
                    }
                } else if (result.status === 402 || result.status === 403) {
                    setPolling(false);
                    setStatus('error');
                    setMessage(result.message);
                }
            } catch (error) {
                console.error('轮询错误:', error);
            }
        }, 2000);

        return () => clearInterval(pollInterval);
    }, [polling, qrcode, login, navigate]);

    return (
        <div className="page login-page">
            <div className="login-container">
                <div className="login-header">
                    <h1 className="login-title">🏃 龙猫阳光跑</h1>
                    <p className="login-subtitle">微信扫码登录</p>
                </div>

                <div className="qrcode-container">
                    {status === 'loading' && (
                        <div className="qrcode-placeholder">
                            <div className="loading-spinner"></div>
                        </div>
                    )}

                    {(status === 'waiting' || status === 'scanned') &&
                        qrcode && (
                            <img
                                src={qrcode.qrcode_url}
                                alt="微信登录二维码"
                                className="qrcode-image"
                            />
                        )}

                    {status === 'success' && (
                        <div className="qrcode-placeholder success">
                            <span className="success-icon">✓</span>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="qrcode-placeholder error">
                            <span className="error-icon">✕</span>
                        </div>
                    )}
                </div>

                <p className={`status-message ${status}`}>{message}</p>

                {status === 'error' && (
                    <button className="btn btn-primary" onClick={fetchQRCode}>
                        重新获取二维码
                    </button>
                )}
            </div>
        </div>
    );
}

export default Login;
