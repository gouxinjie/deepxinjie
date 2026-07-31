/**
 * @component LoginPage
 * @description 登录页组件，只支持账号密码登录与注册；采用左右分屏布局，左侧品牌区随主题主色变化
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-07-29
 */
import React, { useState } from 'react';
import { Check, LockKeyhole, Smartphone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import DeepXinjieLogo from '../../components/DeepXinjieLogo';
import { authApi, extractApiErrorMessage, persistAuthSession } from '../../services/api';
import styles from './index.module.scss';
import { cn } from '../../utils/cn';

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
  // 体验用户默认值：手机号 13113183859，密码 123456，来访即可免注册直接登录
  const [phone, setPhone] = useState('13113183859');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // 是否已阅读并同意用户协议与隐私政策；未勾选时禁用登录/注册按钮
  const [agreed, setAgreed] = useState(true);

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

    // 未同意协议时拦截提交
    if (!agreed) {
      setError('请先阅读并同意《用户协议》与《隐私政策》');
      return;
    }

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
      {/* 左侧品牌展示区：背景渐变随主色方案与明暗主题变化 */}
      <aside className={styles.brandPanel}>
        <div className={styles.brandOrnaments} aria-hidden="true">
          <span className={`${styles.orb} ${styles.orb1}`} />
          <span className={`${styles.orb} ${styles.orb2}`} />
        </div>

        <div className={styles.brandTop}>
          <div className={styles.brandBadge}>
            <DeepXinjieLogo size={26} />
            <span className={styles.brandName}>DeepXinjie</span>
          </div>
        </div>

        <div className={styles.brandBody}>
          <h1 className={styles.brandTitle}>
            你的专属<br />AI 智能助手
          </h1>
          <p className={styles.brandDesc}>
            支持深度思考与联网搜索，一个更懂你的全能对话伙伴。
          </p>

          <ul className={styles.featureList}>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <Check size={15} strokeWidth={2.5} />
              </span>
              <span>深度思考 + 联网搜索，回答更准确更全面</span>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <Check size={15} strokeWidth={2.5} />
              </span>
              <span>多轮对话记忆，上下文无缝衔接，越聊越懂你</span>
            </li>
            <li className={styles.featureItem}>
              <span className={styles.featureIcon}>
                <Check size={15} strokeWidth={2.5} />
              </span>
              <span>隐私安全有保障，你的每一次对话都值得信赖</span>
            </li>
          </ul>
        </div>

        <div className={styles.brandFooter}>© 2026 DeepXinjie · 与 AI 对话，从这里开始</div>
      </aside>

      {/* 右侧登录区 */}
      <main className={styles.main}>
        <section className={styles.card}>
          <header className={styles.cardHeader}>
            <div className={styles.cardLogo}>
              <DeepXinjieLogo size={32} />
            </div>
            <h2 className={styles.cardTitle}>
              {mode === 'login' ? '欢迎回来' : '创建你的账号'}
            </h2>
            <p className={styles.cardSubtitle}>
              {mode === 'login'
                ? '登录你的账号，继续上一次的对话。'
                : '创建账号即可开始与 AI 对话，体验智能助手。'}
            </p>
          </header>

          {/* 演示账号提示：登录模式下展示体验账号信息，来访即可免注册直接登录体验 */}
          {mode === 'login' ? (
            <div className={styles.demoHint} role="note">
              <span className={styles.demoHintLabel}>演示账号</span>
              <span className={styles.demoHintText}>
                账号 <strong>13113183859</strong> · 密码 <strong>123456</strong>，可直接登录体验
              </span>
            </div>
          ) : (
            <div className={styles.demoHintPlaceholder}></div>
          )}

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

            {/* 协议同意勾选区：未勾选时禁用提交按钮 */}
            <div className={styles.agreement}>
              <label className={styles.agreementCheck}>
                <input
                  type="checkbox"
                  className={styles.agreementInput}
                  checked={agreed}
                  onChange={(event) => setAgreed(event.target.checked)}
                />
                <span
                  className={cn(styles.checkbox, agreed ? styles.checkboxChecked : '')}
                  aria-hidden="true"
                >
                  {agreed ? <Check size={14} strokeWidth={3} /> : null}
                </span>
                <span className={styles.agreementText}>我已阅读并同意</span>
              </label>
              <span className={styles.agreementLinks}>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => navigate('/agreement?type=user')}
                >
                  《用户协议》
                </button>
                <span className={styles.agreementAnd}>与</span>
                <button
                  type="button"
                  className={styles.link}
                  onClick={() => navigate('/agreement?type=privacy')}
                >
                  《隐私政策》
                </button>
              </span>
            </div>

            <button type="submit" className={styles.submitButton} disabled={loading || !agreed}>
              {loading ? '处理中...' : mode === 'login' ? '继续' : '注册并继续'}
            </button>
          </form>
        </section>

        <p className={styles.mainFooter}>
          <button type="button" className={styles.link} onClick={() => navigate('/agreement?type=user')}>
            用户协议
          </button>
          <span className={styles.sep}>·</span>
          <button type="button" className={styles.link} onClick={() => navigate('/agreement?type=privacy')}>
            隐私政策
          </button>
          <span className={styles.sep}>·</span>
          <span>沪ICP备2026024942号</span>
        </p>
      </main>
    </div>
  );
};

export default LoginPage;
