/**
 * @component LoginPage
 * @description 登录页组件，只支持账号密码登录与注册
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-10
 */
import React, { useState } from 'react';
import { LockKeyhole, Smartphone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import DeepXinjieLogo from '../../components/DeepXinjieLogo';
import { authApi, extractApiErrorMessage, persistAuthSession } from '../../services/api';
import styles from './index.module.scss';

type AuthMode = 'login' | 'register';

/**
 * 校验手机号格式。
 * @param phone - 手机号
 * @returns 是否为合法手机号
 */
const isValidPhone = (phone: string): boolean => /^1\d{10}$/.test(phone);

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [phone, setPhone] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * 切换认证模式。
   * @param nextMode - 目标模式
   */
  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
  };

  /**
   * 提交登录或注册。
   * @param event - 表单提交事件
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedPhone = phone.trim();
    const normalizedNickname = nickname.trim();

    if (!isValidPhone(normalizedPhone)) {
      setError('请输入正确的 11 位手机号');
      return;
    }

    if (!password) {
      setError('请输入密码');
      return;
    }

    if (mode === 'register') {
      if (normalizedNickname.length < 2 || normalizedNickname.length > 50) {
        setError('用户名长度需在 2-50 个字符之间');
        return;
      }

      if (password.length < 6 || password.length > 32) {
        setError('密码长度需在 6-32 位之间');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const response =
        mode === 'login'
          ? await authApi.login({
              phone: normalizedPhone,
              password,
            })
          : await authApi.register({
              phone: normalizedPhone,
              nickname: normalizedNickname,
              password,
            });

      if (!response.data.success) {
        setError(response.data.message);
        return;
      }

      persistAuthSession(response.data.data);
      navigate('/');
    } catch (requestError) {
      setError(extractApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroMark}>
            <DeepXinjieLogo size={44} />
          </div>

          <div key={mode} className={styles.heroCopy}>
            <h1 className={styles.title}>{mode === 'login' ? '欢迎回来' : '创建你的账号'}</h1>
            <p className={styles.subtitle}>
              {mode === 'login'
                ? '使用手机号账号和密码继续你的会话。'
                : '注册后会自动登录，已有会话与账号数据继续保留。'}
            </p>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tabButton} ${mode === 'login' ? styles.tabButtonActive : ''}`}
              onClick={() => switchMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={`${styles.tabButton} ${mode === 'register' ? styles.tabButtonActive : ''}`}
              onClick={() => switchMode('register')}
            >
              注册
            </button>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>账号</span>
              <div className={styles.inputWrapper}>
                <Smartphone size={18} />
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="请输入手机号账号"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  maxLength={11}
                />
              </div>
            </label>

            <div
              className={`${styles.expandField} ${mode === 'register' ? styles.expandFieldVisible : ''}`}
              aria-hidden={mode !== 'register'}
            >
              <label className={styles.field}>
                <span className={styles.fieldLabel}>用户名</span>
                <div className={styles.inputWrapper}>
                  <UserRound size={18} />
                  <input
                    type="text"
                    placeholder="请输入用户名"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                    maxLength={50}
                    tabIndex={mode === 'register' ? 0 : -1}
                  />
                </div>
              </label>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>密码</span>
              <div className={styles.inputWrapper}>
                <LockKeyhole size={18} />
                <input
                  type="password"
                  placeholder={mode === 'login' ? '请输入密码' : '请设置 6-32 位密码'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  maxLength={32}
                />
              </div>
            </label>

            {error ? (
              <div className={styles.errorMessage}>{error}</div>
            ) : (
              <div className={styles.errorPlaceholder}></div>
            )}

            <button type="submit" className={styles.submitButton} disabled={loading}>
              {loading ? '处理中...' : mode === 'login' ? '继续' : '注册并继续'}
            </button>

            <div className={styles.footer}>
              <p key={mode} className={styles.footerText}>
                {mode === 'login'
                  ? '没有账号？切换到注册即可创建新账号。'
                  : '注册即表示你同意平台的基础使用条款与隐私约定。'}
              </p>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
};

export default LoginPage;
