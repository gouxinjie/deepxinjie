/**
 * @component ChatWelcome
 * @description 聊天欢迎区组件，负责展示品牌标识与首屏欢迎文案
 * @author gouxinjie
 * @created 2026-04-08
 * @updated 2026-07-30
 */
import React from "react";
import { motion } from "framer-motion";

import styles from "./ChatWelcome.module.scss";
import DeepXinjieLogo from "../DeepXinjieLogo";

const ChatWelcome: React.FC = () => {
  return (
    <div className={styles.container}>
      <motion.div
        className={styles.logoTitle}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <DeepXinjieLogo size={40} />
        <h1 className={styles.title}>我能帮你做什么？</h1>
      </motion.div>
      <motion.p
        className={styles.subtitle}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
      >
        智能对话，探索无限可能。
      </motion.p>
    </div>
  );
};

export default ChatWelcome;
