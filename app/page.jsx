'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCcw, ScanLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { completeLogin, getQRCode, pollScanStatus } from '../lib/api';
import useStore from '../lib/store';

export default function LoginPage() {
  const router = useRouter();
  const { hasHydrated, isLoggedIn, login } = useStore();
  const [qrcode, setQrcode] = useState(null);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [polling, setPolling] = useState(false);

  const fetchQRCode = useCallback(async () => {
    setStatus('loading');
    setMessage('正在生成登录二维码');
    setPolling(false);

    try {
      const data = await getQRCode();
      setQrcode(data);
      setStatus('waiting');
      setMessage('使用微信扫码登录');
      setPolling(true);
    } catch (error) {
      setStatus('error');
      setMessage(`二维码获取失败：${error.message}`);
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (isLoggedIn) {
      router.replace('/dashboard');
      return;
    }

    const timer = window.setTimeout(() => {
      fetchQRCode();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchQRCode, hasHydrated, isLoggedIn, router]);

  useEffect(() => {
    if (!polling || !qrcode?.uuid) return undefined;

    const pollInterval = setInterval(async () => {
      try {
        const result = await pollScanStatus(qrcode.uuid);

        if (result.status === 404) {
          setStatus('scanned');
          setMessage('已扫码，等待手机确认');
        } else if (result.status === 405 && result.wx_code) {
          setPolling(false);
          setStatus('loading');
          setMessage('正在完成登录');

          const loginResult = await completeLogin(result.wx_code);
          if (loginResult.success) {
            setStatus('success');
            setMessage('登录成功');
            login(loginResult.data);
            router.replace('/dashboard');
          } else {
            setStatus('error');
            setMessage(`登录失败：${loginResult.message}`);
          }
        } else if (result.status === 402 || result.status === 403) {
          setPolling(false);
          setStatus('error');
          setMessage(result.message);
        }
      } catch {
        setStatus('waiting');
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [login, polling, qrcode, router]);

  return (
    <main className="screen login-screen">
      <section className="login-shell" aria-label="微信扫码登录">
        <div className="brand-mark">
          <ScanLine size={28} strokeWidth={2.4} />
        </div>
        <p className="eyebrow">Totoro Sunrun</p>
        <h1 className="mega-title">阳光跑</h1>

        <div className={`qr-frame ${status}`}>
          {(status === 'waiting' || status === 'scanned') && qrcode ? (
            <img src={qrcode.qrcode_url} alt="微信登录二维码" className="qr-image" />
          ) : (
            <div className="qr-placeholder">
              {status === 'success' ? 'OK' : status === 'error' ? 'ERR' : '...'}
            </div>
          )}
        </div>

        <p className={`status-line ${status}`}>{message}</p>

        {status === 'error' && (
          <button className="action-button secondary" onClick={fetchQRCode} type="button">
            <RefreshCcw size={18} />
            重新获取
          </button>
        )}
      </section>
    </main>
  );
}
