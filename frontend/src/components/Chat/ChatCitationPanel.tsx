/**
 * @component ChatCitationPanel
 * @description 联网来源侧栏组件，负责展示搜索引用列表并支持高亮与跳转
 * @author gouxinjie
 * @created 2026-04-07
 * @updated 2026-04-08
 */
import React from 'react';
import { Search, X } from 'lucide-react';
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

/**
 * 提取来源站点首字母，用于生成简洁站点徽标。
 * @param domain - 来源域名
 * @returns 大写首字母，缺失时返回默认值
 */
const getSourceInitial = (domain: string): string => {
  const normalizedDomain = domain.trim();

  if (!normalizedDomain) {
    return 'W';
  }

  return normalizedDomain.charAt(0).toUpperCase();
};

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
            <h3 className={styles.title}>参考资料</h3>
            <p className={styles.subtitle}>
              {searchStatus || `共收录 ${citations.length} 条联网结果`}
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
          <div className={styles.citationList}>
            {citations.map((citation) => (
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
                <div className={styles.citationTitle}>{citation.title}</div>
                <div className={styles.citationSnippet}>{citation.snippet}</div>
                <div className={styles.citationFooter}>
                  <div className={styles.citationSource}>
                    <span className={styles.sourceBadge} aria-hidden="true">
                      {getSourceInitial(citation.domain)}
                    </span>
                    <span className={styles.citationDomain}>{citation.domain}</span>
                  </div>
                  <span className={styles.citationIndex}>{citation.id}</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>当前回答没有可展示的联网来源。</div>
        )}
      </div>
    </aside>
  );
};

export default ChatCitationPanel;
