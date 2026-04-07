# my-deepseek

一个前后端分离的聊天项目，前端基于 `React + TypeScript + Vite`，后端基于 `FastAPI + MySQL`，支持手机号登录、微信扫码登录、会话管理和流式聊天。

## 目录结构

```text
.
├── backend/                 # FastAPI 后端
│   ├── main.py              # 后端入口
│   ├── db.py                # 数据库连接池
│   ├── auth_utils.py        # JWT 鉴权工具
│   ├── routers/
│   │   ├── auth.py          # 登录相关接口
│   │   └── chat.py          # 会话与聊天接口
│   ├── schema.sql           # 数据库结构
│   ├── init_db.py           # 数据库初始化脚本
│   └── requirements.txt     # Python 依赖
├── frontend/                # React 前端
│   ├── src/
│   │   ├── components/      # 组件目录
│   │   ├── pages/           # 页面目录
│   │   ├── services/        # 请求封装
│   │   └── types/           # TypeScript 类型定义
│   ├── package.json         # 前端依赖与脚本
│   └── vite.config.ts       # Vite 配置
├── start.bat                # 一键启动脚本
└── README.md                # 项目说明
```

## 环境要求

- Python 3.11+
- Node.js 20+
- MySQL 8+

## 环境变量

后端启动前请先配置环境变量，至少包含以下内容：

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=你的数据库密码
DB_NAME=chat_platform
JWT_SECRET=你的JWT密钥
DEEPSEEK_API_KEY=你的DeepSeek密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
WECHAT_APPID=你的微信APPID
WECHAT_SECRET=你的微信SECRET
```

说明：

- `DB_PASSWORD` 和 `JWT_SECRET` 为必填，代码中已移除默认值。
- 若未配置 `DEEPSEEK_API_KEY`，后端会返回本地兜底演示回复。
- 若未配置微信环境变量，二维码登录接口会返回错误提示，但手机号登录仍可使用。

## 启动步骤

### 1. 初始化数据库

进入 `backend` 目录并执行：

```powershell
python init_db.py
```

如需初始化演示用户，可继续执行：

```powershell
python seed_user.py
```

### 2. 启动后端

进入 `backend` 目录并执行：

```powershell
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

说明：

- 在部分 Windows 受限环境中，`--reload` 可能因系统权限失败。
- 若本机环境允许，可自行追加 `--reload` 开启热更新。

### 3. 启动前端

进入 `frontend` 目录并执行：

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

### 4. 访问地址

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`

## 当前已完成的关键修复

- 后端鉴权改为严格 `401`，不再回退到默认用户。
- 聊天相关接口统一接入 `user_id`，并校验 `session_id / message_id` 归属。
- `/api/chat/send` 已改为受鉴权保护的流式 `POST`。
- 移除了数据库密码和 JWT 密钥的默认值。
- 前端新增统一接口类型定义，移除了显式 `any`。
- 新增根目录 `.gitignore`，补齐项目级说明文档。

## 后续建议

- 补充前后端自动化测试，重点覆盖登录、会话 CRUD、消息编辑和流式聊天。
- 为生产环境补充日志分级、黑名单退出机制和更完善的错误监控。
- 将二维码登录状态缓存迁移到 Redis，避免多实例部署时状态不一致。
