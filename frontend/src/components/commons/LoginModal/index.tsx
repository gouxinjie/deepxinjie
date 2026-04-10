/**
 * @component LoginModal
 * @description 登录注册弹窗组件，只支持账号密码认证
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-10
 */
import React, { useEffect, useState } from 'react';
import { LockKeyhole, Smartphone, UserRound, X } from 'lucide-react';

import { authApi, extractApiErrorMessage, persistAuthSession } from '../../../services/api';
import styles from './index.module.scss';

type AuthMode = 'login' | 'register';

/**
 * 登录弹窗属性。
 */
interface LoginModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 关闭弹窗回调 */
  onClose: () => void;
  /** 登录成功回调 */
  onSuccess: () => void;
}

/**
 * 校验手机号格式。
 * @param phone - 手机号
 * @returns 是否合法
 */
const isValidPhone = (phone: string): boolean => /^1\d{10}$/.test(phone);

const LoginModal: React.FC<LoginModalProps> = ({ visible, onClose, onSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [phone, setPhone] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /**
   * 弹窗关闭时重置错误态。
   */
  useEffect(() => {
    if (!visible) {
      setLoading(false);
      setError('');
      setPassword('');
    }
  }, [visible]);

  /**
   * 切换模式。
   * @param nextMode - 目标模式
   */
  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError('');
  };

  /**
   * 提交认证请求。
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
      onSuccess();
    } catch (requestError) {
      setError(extractApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <button type="button" className={styles.closeButton} onClick={onClose}>
          <X size={18} />
        </button>

        <div className={styles.header}>
          <div className={styles.tabRow}>
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
          <h3 className={styles.title}>{mode === 'login' ? '登录你的账号' : '创建一个新账号'}</h3>
          <p className={styles.subtitle}>
            {mode === 'login'
              ? '仅支持手机号账号与密码登录'
              : '注册后会自动建立登录态，不影响历史会话数据'}
          </p>
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

          {mode === 'register' ? (
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
                />
              </div>
            </label>
          ) : null}

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

          {error ? <div className={styles.errorMessage}>{error}</div> : null}

          <button type="submit" className={styles.submitButton} disabled={loading}>
            {loading ? '处理中...' : mode === 'login' ? '登录' : '注册并登录'}
          </button>

          <p className={styles.footerText}>
            {mode === 'login' ? '没有账号可直接切换到注册。' : '注册账号后会自动写入登录态。'}
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginModal;
