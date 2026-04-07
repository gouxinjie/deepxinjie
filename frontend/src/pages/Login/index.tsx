/**
 * @component LoginPage
 * @description 登录页面，支持手机号登录和微信扫码登录
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-07
 */
import React, { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import styles from './index.module.scss';
import DeepXinjieLogo from '../../components/DeepXinjieLogo';
import { authApi, extractApiErrorMessage, persistAuthSession } from '../../services/api';

const LoginPage: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const pollTimer = useRef<number | null>(null);
  const navigate = useNavigate();

  /**
   * 页面初始化时加载微信二维码。
   */
  useEffect(() => {
    void fetchQrCode();
    return () => stopPolling();
  }, []);

  /**
   * 获取微信登录二维码。
   */
  const fetchQrCode = async () => {
    setQrLoading(true);
    setError('');

    try {
      const response = await authApi.getQrCode();
      if (!response.data.success) {
        setError(response.data.message);
        return;
      }

      setQrUrl(response.data.data.qr_url);
      startPolling(response.data.data.scene_str);
    } catch (requestError) {
      setError(extractApiErrorMessage(requestError));
    } finally {
      setQrLoading(false);
    }
  };

  /**
   * 轮询微信扫码状态。
   * @param scene - 二维码场景值
   */
  const startPolling = (scene: string) => {
    stopPolling();

    pollTimer.current = window.setInterval(async () => {
      try {
        const response = await authApi.checkStatus(scene);
        if (!response.data.success || response.data.code !== 200) {
          return;
        }

        const { token, user } = response.data.data;
        if (!token || !user) {
          return;
        }

        persistAuthSession(token, user);
        stopPolling();
        navigate('/');
      } catch (requestError) {
        setError(extractApiErrorMessage(requestError));
      }
    }, 2000);
  };

  /**
   * 停止轮询。
   */
  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  /**
   * 执行手机号登录。
   * @param event - 表单提交事件
   */
  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!phone.trim() || !password.trim()) {
      setError('请输入手机号和密码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await authApi.login({
        phone: phone.trim(),
        password: password.trim(),
      });

      if (!response.data.success) {
        setError(response.data.message);
        return;
      }

      persistAuthSession(response.data.data.token, response.data.data.user);
      navigate('/');
    } catch (requestError) {
      setError(extractApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.logoWrapper}>
        <DeepXinjieLogo size={32} />
        <span className={styles.logoText}>deepxinjie</span>
      </div>

      <div className={styles.loginBox}>
        <div className={styles.content}>
          <div className={styles.left}>
            <form className={styles.form} onSubmit={handleLogin}>
              <div className={styles.inputGroup}>
                <span className={styles.prefix}>+86</span>
                <input
                  type="tel"
                  placeholder="请输入手机号"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </div>

              <div className={styles.inputGroup}>
                <input
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <span className={styles.sendCode}>短信验证码</span>
              </div>

              <div className={styles.agreement}>
                注册登录即代表已阅读并同意我们的 <a>用户协议</a> 与 <a>隐私政策</a>。
                <br />
                未注册的手机号将自动完成注册
              </div>

              {error && <div className={styles.errorMessage}>{error}</div>}

              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? '正在登录...' : '登录'}
              </button>

              <div className={styles.otherMethods}>
                <div className={styles.divider}></div>
                <div className={styles.icons}>
                  <div className={styles.iconBtn}>
                    <Lock size={18} />
                  </div>
                  <div className={styles.iconBtn}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C4.37 16.92 4.14 11.08 6.94 9.17c1.45-1 3-1.09 4.19-.11.45.37.9.37 1.34 0 1.25-.94 2.92-.91 4.3.11.83.6 1.48 1.5 1.83 2.53-1.8.84-1.74 3.42.06 4.36-.35 1.05-.88 2.1-1.61 3.22zM12 8.6c-.1-2.22 1.6-4.14 3.74-4.22.1 2.44-2.15 4.34-3.74 4.22z" />
                    </svg>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <div className={styles.dividerVertical}></div>

          <div className={styles.right}>
            <div className={styles.qrCard}>
              <div className={styles.qrContainer}>
                {qrLoading ? (
                  <div className={styles.qrPlaceholder}>正在加载...</div>
                ) : (
                  <img src={qrUrl} alt="微信扫码登录" className={styles.qrCode} />
                )}
              </div>
            </div>

            <div className={styles.qrTip}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--color-success)">
                <path d="M8.22 13.41c0-.4.32-.73.73-.73s.73.33.73.73c0 .4-.33.73-.73.73s-.73-.33-.73-.73zm4.61 0c0-.4.33-.73.73-.73s.73.33.73.73c0 .4-.33.73-.73.73s-.73-.33-.73-.73zm6.31-5.18C15.68 5.76 11.4 5.76 7.94 8.23c-3.66 2.62-3.83 6.84-1.04 9.68l.21.21-.49 1.48 1.83-.81.33.15c1.07.49 2.22.75 3.39.75.54 0 1.07-.06 1.6-.17-.18-.38-.28-.8-.28-1.24 0-2.42 2.22-4.38 4.95-4.38.25 0 .5.02.75.05.01-.24.01-.48.01-.72zm-8.62-2.1c0-.4.32-.73.73-.73s.73.33.73.73c0 .4-.33.73-.73.73s-.73-.33-.73-.73zm4.61 0c0-.4.33-.73.73-.73s.73.33.73.73c0 .4-.33.73-.73.73s-.73-.33-.73-.73zm7.64 8.16c0-1.92-1.76-3.48-3.92-3.48s-3.92 1.56-3.92 3.48c0 1.92 1.76 3.48 3.92 3.48.45 0 .89-.07 1.3-.2l1.45.64-.39-1.18c.95-.67 1.56-1.74 1.56-2.74z" />
              </svg>
              <span>微信扫码登录</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
