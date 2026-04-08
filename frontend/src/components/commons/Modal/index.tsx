/**
 * @component Modal
 * @description 通用确认弹窗组件，负责展示标题、内容与确认取消操作
 * @author gouxinjie
 * @created 2026-03-16
 * @updated 2026-04-08
 */
import React from 'react';
import styles from './index.module.scss';
import classNames from 'classnames';

interface ModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 弹窗标题 */
  title: string;
  /** 弹窗内容 */
  content: string;
  /** 确认按钮文字，默认 '确定' */
  confirmText?: string;
  /** 取消按钮文字，默认 '取消' */
  cancelText?: string;
  /** 是否为危险操作（如删除），默认为 false */
  danger?: boolean;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消/关闭回调 */
  onCancel: () => void;
}

const Modal: React.FC<ModalProps> = ({
  visible,
  title,
  content,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  if (!visible) return null;

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
        </div>
        <div className={styles.body}>
          <p className={styles.content}>{content}</p>
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onCancel}>
            {cancelText}
          </button>
          <button 
            className={classNames(styles.confirmBtn, { [styles.danger]: danger })} 
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;
