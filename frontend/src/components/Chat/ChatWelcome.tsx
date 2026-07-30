/**
 * @component ChatWelcome
 * @description 聊天欢迎区组件，负责展示品牌标识与首屏欢迎文案
 * @author gouxinjie
 * @created 2026-04-08
 * @updated 2026-07-29
 */
import React from "react";
import styles from "./ChatWelcome.module.scss";
import DeepXinjieLogo from "../DeepXinjieLogo";

const ChatWelcome: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.logoTitle}>
        <DeepXinjieLogo size={40} />
        <h1 className={styles.title}>我能帮你做什么？</h1>
      </div>
    </div>
  );
};

export default ChatWelcome;
