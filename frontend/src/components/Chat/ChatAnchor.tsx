import React from "react";
import classNames from "classnames";
import styles from "./ChatAnchor.module.scss";

interface AnchorItem {
  id: string;
  title: string;
}

interface ChatAnchorProps {
  items: AnchorItem[];
  currentId: string;
  onAnchorClick: (id: string) => void;
}

const ChatAnchor: React.FC<ChatAnchorProps> = ({ items, currentId, onAnchorClick }) => {
  if (items.length <= 1) return null;

  return (
    <div className={styles.sessionAnchor}>
      <div className={styles.sessionAnchorRail}>
        {items.map((anchor, index) => {
          const isActive = currentId === anchor.id;
          const activeIndex = items.findIndex((a) => a.id === currentId);
          const distance = Math.abs(index - activeIndex);

          let dotClass = styles.sessionAnchorDot;
          if (isActive) {
            dotClass = classNames(styles.sessionAnchorDot, styles.active);
          } else if (distance === 1) {
            dotClass = classNames(styles.sessionAnchorDot, styles.nearActive);
          } else if (distance === 2) {
            dotClass = classNames(styles.sessionAnchorDot, styles.farActive);
          }

          return (
            <button
              key={anchor.id}
              className={dotClass}
              onClick={() => onAnchorClick(anchor.id)}
              title={anchor.title}
            />
          );
        })}
      </div>
      <div className={styles.sessionAnchorPanel}>
        {items.map((anchor, index) => {
          const isActive = currentId === anchor.id;
          const activeIndex = items.findIndex((a) => a.id === currentId);
          const distance = Math.abs(index - activeIndex);

          let textClass = styles.sessionAnchorText;
          if (isActive) {
            textClass = classNames(styles.sessionAnchorText, styles.activeText);
          } else if (distance === 1) {
            textClass = classNames(styles.sessionAnchorText, styles.nearActiveText);
          } else if (distance === 2) {
            textClass = classNames(styles.sessionAnchorText, styles.farActiveText);
          }

          return (
            <button
              key={anchor.id}
              className={classNames(styles.sessionAnchorItem, { [styles.active]: isActive })}
              onClick={() => onAnchorClick(anchor.id)}
            >
              <span className={textClass}>{anchor.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ChatAnchor;
