CREATE DATABASE IF NOT EXISTS chat_platform;
USE chat_platform;

-- 用户表：只保留账号密码注册登录所需字段
CREATE TABLE IF NOT EXISTS user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    phone VARCHAR(11) UNIQUE COMMENT '手机号账号',
    password_hash VARCHAR(255) COMMENT '密码哈希',
    nickname VARCHAR(50) DEFAULT '用户' COMMENT '用户名',
    avatar VARCHAR(255) DEFAULT '' COMMENT '头像地址',
    create_time DATETIME DEFAULT NOW() COMMENT '创建时间',
    update_time DATETIME DEFAULT NOW() ON UPDATE NOW() COMMENT '更新时间'
);

-- 会话表：保存用户创建的聊天会话
CREATE TABLE IF NOT EXISTS chat_session (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL COMMENT '用户 ID',
    title VARCHAR(100) NOT NULL COMMENT '会话标题',
    status TINYINT DEFAULT 1 COMMENT '会话状态',
    is_pinned TINYINT DEFAULT 0 COMMENT '是否置顶',
    create_time DATETIME DEFAULT NOW() COMMENT '创建时间',
    update_time DATETIME DEFAULT NOW() ON UPDATE NOW() COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES user(id)
);

-- 消息表：保存会话中的消息记录
CREATE TABLE IF NOT EXISTS chat_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    session_id BIGINT NOT NULL COMMENT '会话 ID',
    role VARCHAR(10) NOT NULL COMMENT '消息角色',
    content TEXT NOT NULL COMMENT '消息内容',
    status VARCHAR(20) NOT NULL DEFAULT 'completed' COMMENT '生成状态',
    generation_id VARCHAR(64) NOT NULL DEFAULT '' COMMENT '生成任务 ID',
    continue_from_message_id BIGINT NULL COMMENT '继续生成起点消息 ID',
    thinking_time INT DEFAULT 0 COMMENT '思考耗时',
    file_ids VARCHAR(255) DEFAULT '' COMMENT '关联文件 ID 列表',
    create_time DATETIME DEFAULT NOW() COMMENT '创建时间',
    FOREIGN KEY (session_id) REFERENCES chat_session(id)
);

-- 文件上传表：保存会话关联文件
CREATE TABLE IF NOT EXISTS file_upload (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL COMMENT '用户 ID',
    session_id BIGINT NOT NULL COMMENT '会话 ID',
    file_name VARCHAR(255) NOT NULL COMMENT '文件名',
    file_url VARCHAR(255) NOT NULL COMMENT '文件地址',
    file_size INT NOT NULL COMMENT '文件大小',
    file_type VARCHAR(20) NOT NULL COMMENT '文件类型',
    create_time DATETIME DEFAULT NOW() COMMENT '创建时间',
    FOREIGN KEY (user_id) REFERENCES user(id),
    FOREIGN KEY (session_id) REFERENCES chat_session(id)
);

-- 登录会话表：保存 Refresh Token、CSRF 与设备信息
CREATE TABLE IF NOT EXISTS user_session (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL COMMENT '用户 ID',
    refresh_token_hash VARCHAR(64) NOT NULL UNIQUE COMMENT 'Refresh Token 哈希',
    csrf_token_hash VARCHAR(64) NOT NULL DEFAULT '' COMMENT 'CSRF Token 哈希',
    status TINYINT DEFAULT 1 COMMENT '1-有效 0-失效',
    expire_time DATETIME NOT NULL COMMENT 'Refresh Token 过期时间',
    ip_address VARCHAR(64) DEFAULT '' COMMENT '最近登录 IP',
    user_agent VARCHAR(255) DEFAULT '' COMMENT '最近登录设备标识',
    last_active_time DATETIME DEFAULT NOW() COMMENT '最后活跃时间',
    create_time DATETIME DEFAULT NOW() COMMENT '创建时间',
    update_time DATETIME DEFAULT NOW() ON UPDATE NOW() COMMENT '更新时间',
    FOREIGN KEY (user_id) REFERENCES user(id)
);
