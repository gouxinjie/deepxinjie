import React from "react";
import styles from "./ChatWelcome.module.scss";
import DeepXinjieLogo from "../DeepXinjieLogo";

const ChatWelcome: React.FC = () => {
  return (
    <div className={styles.container}>
      <div className={styles.logoTitle}>
        <DeepXinjieLogo style={{marginTop:5}} size={40} />
        <h1 className={styles.title}>今天有什么可以帮到你？</h1>
      </div>
    </div>
  );
};

export default ChatWelcome;
