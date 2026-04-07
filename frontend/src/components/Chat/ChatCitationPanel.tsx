/**
 * @component ChatCitationPanel
 * @description 聊天来源侧栏，负责展示联网搜索引用列表并支持右侧滑入展开
 * @author gouxinjie
 * @created 2026-04-07
 * @updated 2026-04-07
 */
import React from 'react';
import { ExternalLink, Search, X } from 'lucide-react';
import classNames from 'classnames';

import styles from './ChatCitationPanel.module.scss';
import type { SearchCitation } from '../../types/api';

interface ChatCitationPanelProps {
  /** 侧栏是否展开 */
  visible: boolean;
  /** 来源列表 */
  citations: SearchCitation[];
  /** 搜索状态提示 */
  searchStatus?: string;
  /** 当前高亮来源编号 */
  activeCitationId?: number | null;
  /** 关闭侧栏回调 */
  onClose: () => void;
}

const ChatCitationPanel: React.FC<ChatCitationPanelProps> = ({
  visible,
  citations,
  searchStatus,
  activeCitationId,
  onClose,
}) => {
  return (
    <aside
      className={classNames(styles.panel, { [styles.visible]: visible })}
      aria-hidden={!visible}
    >
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.headerIcon}>
            <Search size={16} strokeWidth={1.8} />
          </div>
          <div>
            <h3 className={styles.title}>网页来源</h3>
            <p className={styles.subtitle}>
              {searchStatus || `共收录 ${citations.length} 条搜索结果`}
            </p>
          </div>
        </div>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          title="关闭来源侧栏"
        >
          <X size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className={styles.body}>
        {citations.length > 0 ? (
          citations.map((citation) => (
            <a
              key={citation.id}
              className={classNames(styles.citationItem, {
                [styles.active]: activeCitationId === citation.id,
              })}
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              title={citation.url}
            >
              <div className={styles.citationMeta}>
                <span className={styles.citationIndex}>来源 {citation.id}</span>
                <ExternalLink size={14} strokeWidth={1.8} />
              </div>
              <div className={styles.citationTitle}>{citation.title}</div>
              <div className={styles.citationDomain}>{citation.domain}</div>
              <div className={styles.citationSnippet}>{citation.snippet}</div>
            </a>
          ))
        ) : (
          <div className={styles.emptyState}>当前回答没有可展示的联网来源。</div>
        )}
      </div>
    </aside>
  );
};

export default ChatCitationPanel;
