/**
 * @component LoginModal
 * @description 微信扫码登录弹窗，负责拉取二维码、轮询状态并回写登录态
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-07
 */
import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import styles from './index.module.scss';
import { authApi, extractApiErrorMessage, persistAuthSession } from '../../../services/api';
import type { AuthUser } from '../../../types/api';

interface LoginModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 登录成功回调 */
  onSuccess: (user: AuthUser) => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ visible, onClose, onSuccess }) => {
  const [qrUrl, setQrUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollTimer = useRef<number | null>(null);

  /**
   * 打开弹窗时拉取二维码，关闭时停止轮询。
   */
  useEffect(() => {
    if (visible) {
      void fetchQrCode();
    } else {
      stopPolling();
    }

    return () => stopPolling();
  }, [visible]);

  /**
   * 拉取二维码并启动轮询。
   */
  const fetchQrCode = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  /**
   * 按固定间隔轮询二维码登录状态。
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
        onSuccess(user);
      } catch (requestError) {
        setError(extractApiErrorMessage(requestError));
      }
    }, 2000);
  };

  /**
   * 停止轮询任务。
   */
  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <button className={styles.closeBtn} onClick={onClose}>
          <X size={20} />
        </button>

        <div className={styles.header}>
          <h3 className={styles.title}>微信扫码登录</h3>
          <p className={styles.subtitle}>请使用微信扫描下方二维码登录</p>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.loading}>二维码加载中...</div>
          ) : error ? (
            <div className={styles.error}>
              <p>{error}</p>
              <button onClick={() => void fetchQrCode()} className={styles.retryBtn}>
                重试
              </button>
            </div>
          ) : (
            <div className={styles.qrContainer}>
              <img src={qrUrl} alt="微信扫码登录" className={styles.qrCode} />
              <div className={styles.statusTip}>
                <div className={styles.dot}></div>
                <span>等待扫码</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <p className={styles.tip}>未注册用户扫码后将自动完成注册</p>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
