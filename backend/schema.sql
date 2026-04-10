CREATE DATABASE IF NOT EXISTS chat_platform;
USE chat_platform;

CREATE TABLE IF NOT EXISTS user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    phone VARCHAR(11) UNIQUE,
    password_hash VARCHAR(255),
    openid VARCHAR(64) UNIQUE COMMENT '微信OpenID',
    unionid VARCHAR(64) UNIQUE COMMENT '微信UnionID',
    nickname VARCHAR(50) DEFAULT '用户',
    avatar VARCHAR(255) DEFAULT '',
    create_time DATETIME DEFAULT NOW(),
    update_time DATETIME DEFAULT NOW() ON UPDATE NOW()
);

-- 登录二维码状态表
CREATE TABLE IF NOT EXISTS login_qrcode (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    scene_str VARCHAR(64) UNIQUE NOT NULL COMMENT '场景值/唯一标识',
    openid VARCHAR(64) COMMENT '扫码后的OpenID',
    status TINYINT DEFAULT 0 COMMENT '0-未扫码 1-已扫码 2-已过期',
    create_time DATETIME DEFAULT NOW(),
    expire_time DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_session (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    title VARCHAR(100) NOT NULL,
    status TINYINT DEFAULT 1,
    is_pinned TINYINT DEFAULT 0,
    create_time DATETIME DEFAULT NOW(),
    update_time DATETIME DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (user_id) REFERENCES user(id)
);

CREATE TABLE IF NOT EXISTS chat_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL,
    role VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    thinking_time INT DEFAULT 0,
    file_ids VARCHAR(255) DEFAULT '',
    create_time DATETIME DEFAULT NOW(),
    FOREIGN KEY (session_id) REFERENCES chat_session(id)
);

CREATE TABLE IF NOT EXISTS file_upload (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    session_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(255) NOT NULL,
    file_size INT NOT NULL,
    file_type VARCHAR(20) NOT NULL,
    create_time DATETIME DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (session_id) REFERENCES chat_session(id)
);

CREATE TABLE IF NOT EXISTS verify_code (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    phone VARCHAR(11) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expire_time DATETIME NOT NULL,
    create_time DATETIME DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_session (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    refresh_token_hash VARCHAR(64) NOT NULL UNIQUE COMMENT 'Refresh Token 哈希值',
    csrf_token_hash VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CSRF Token 哈希值',
    status TINYINT DEFAULT 1 COMMENT '1-有效 0-失效',
    expire_time DATETIME NOT NULL COMMENT 'Refresh Token 过期时间',
    ip_address VARCHAR(64) DEFAULT '' COMMENT '最近登录 IP',
    user_agent VARCHAR(255) DEFAULT '' COMMENT '最近登录设备标识',
    last_active_time DATETIME DEFAULT NOW() COMMENT '最后活跃时间',
    create_time DATETIME DEFAULT NOW() COMMENT '创建时间',
    update_time DATETIME DEFAULT NOW() ON UPDATE NOW() COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES user(id)
);
