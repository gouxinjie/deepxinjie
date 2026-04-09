# DeepXinjie

一个前后端分离的 AI 聊天项目，前端基于 `React 19 + TypeScript + Vite`，后端基于 `FastAPI + MySQL`。当前版本已经接通手机号登录、微信扫码登录、会话管理、流式对话、深度思考、联网搜索和来源侧栏展示。

## 项目现状

当前仓库可以完成以下核心流程：

- 手机号 + 密码登录
- 微信扫码登录
- 未注册手机号首次登录时自动注册
- 创建、重命名、置顶、删除会话
- 基于 SSE 的流式聊天输出
- 深度思考模式切换
- 联网搜索模式切换
- 搜索来源引用与右侧来源面板展示
- 用户消息编辑后重新发送
- 基于上一轮问题重新生成回答
- 明暗主题切换

当前仓库里已经移除了前端“分享”相关入口。

## 技术栈

### 前端

- React 19
- TypeScript 5
- Vite 8
- React Router 7
- Axios
- Zustand
- Sass / SCSS
- `react-markdown` + `remark-gfm` + `rehype-highlight`
- `lucide-react`

### 后端

- FastAPI
- Uvicorn
- MySQL
- `mysql-connector-python`
- OpenAI Python SDK
- `python-dotenv`
- `pyjwt`
- `passlib[bcrypt]`
- `requests`
- `xmltodict`

## 目录结构

```text
.
├── backend/                      # FastAPI 后端
│   ├── main.py                   # 应用入口
│   ├── db.py                     # MySQL 连接池
│   ├── auth_utils.py             # JWT 鉴权工具
│   ├── init_db.py                # 数据库初始化脚本
│   ├── schema.sql                # 数据库结构
│   ├── seed_user.py              # 演示用户初始化脚本
│   ├── routers/
│   │   ├── auth.py               # 登录与微信扫码相关接口
│   │   └── chat.py               # 会话、消息、流式聊天接口
│   └── services/
│       └── search_service.py     # Tavily 联网搜索封装
├── frontend/                     # React 前端
│   ├── src/
│   │   ├── components/           # 布局、聊天、通用组件
│   │   ├── pages/                # 页面组件
│   │   ├── services/             # API 封装
│   │   ├── store/                # Zustand 状态
│   │   ├── styles/               # 全局样式变量
│   │   └── types/                # TypeScript 类型定义
│   ├── package.json
│   └── vite.config.ts
├── start.bat                     # Windows 一键启动脚本
└── README.md
```

## 运行环境

- Node.js 20+
- Python 3.11+
- MySQL 8+

## 环境变量

后端通过 `python-dotenv` 读取环境变量。建议在 `backend/` 目录下创建 `.env` 文件。

### 必填

```env
DB_PASSWORD=你的数据库密码
JWT_SECRET=你的JWT密钥
```

说明：

- `DB_PASSWORD` 和 `JWT_SECRET` 缺失时，后端会在启动阶段直接报错。
- 这两个字段没有默认值。

### 常用可选项

```env
DB_HOST=localhost
DB_USER=root
DB_NAME=chat_platform

DEEPSEEK_API_KEY=你的DeepSeek密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com

SEARCH_PROVIDER=tavily
TAVILY_API_KEY=你的Tavily密钥
SEARCH_TIMEOUT_SECONDS=10
SEARCH_MAX_RESULTS=5
SEARCH_FETCH_PAGE_CONTENT=false
SEARCH_PAGE_TIMEOUT_SECONDS=6

WECHAT_APPID=你的微信APPID
WECHAT_SECRET=你的微信SECRET
```

说明：

- 未配置 `DEEPSEEK_API_KEY` 时，聊天接口会回退到本地兜底回复，方便开发联调。
- 联网搜索当前只支持 `Tavily`。
- 若未配置 `SEARCH_PROVIDER=tavily` 或 `TAVILY_API_KEY`，前端仍可开启“联网搜索”开关，但后端会回退为普通回答，并返回中文状态提示。
- 若未配置 `WECHAT_APPID` / `WECHAT_SECRET`，微信扫码登录接口会返回错误，手机号登录仍可正常使用。

## 数据库初始化

首次启动前，请先初始化数据库。

```powershell
cd backend
python init_db.py
```

如需插入演示用户，可继续执行：

```powershell
cd backend
python seed_user.py
```

当前数据库结构包含以下核心表：

- `user`
- `login_qrcode`
- `chat_session`
- `chat_message`
- `file_upload`
- `verify_code`

说明：

- 当前版本真正使用到的核心是 `user`、`login_qrcode`、`chat_session`、`chat_message`。
- `file_upload` 和 `verify_code` 表已存在于 `schema.sql`，但前端对应完整业务流程尚未接通。

## 启动方式

### 方式一：分别启动前后端

#### 1. 启动后端

```powershell
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

也可以直接运行：

```powershell
cd backend
python main.py
```

说明：

- 当前默认按无热重载模式启动，主要是为了兼容部分受限 Windows 环境。
- 如果你的本机环境允许，可以自行追加 `--reload`。

#### 2. 启动前端

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

### 方式二：使用一键启动脚本

仓库根目录提供了 Windows 脚本：

```powershell
start.bat
```

该脚本会分别打开两个终端窗口并执行：

- 后端：`python -m uvicorn main:app --host 127.0.0.1 --port 8000`
- 前端：`npm run dev -- --host 127.0.0.1 --port 5173`

## 访问地址

- 前端开发地址：`http://127.0.0.1:5173`
- 后端开发地址：`http://127.0.0.1:8000`
- 后端健康检查：`http://127.0.0.1:8000/api/hello`

## 前端脚本

```powershell
cd frontend
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

## 后端接口概览

### 鉴权相关

- `POST /api/auth/login`
  - 手机号密码登录
  - 用户不存在时自动注册
- `GET /api/auth/qrcode`
  - 获取微信扫码登录二维码
- `GET /api/auth/qrcode/status`
  - 轮询二维码登录状态
- `POST /api/auth/wechat/callback`
  - 微信扫码回调
- `POST /api/auth/logout`
  - 退出登录

### 聊天相关

- `POST /api/chat/send`
  - 受鉴权保护的流式聊天接口
  - 支持 `is_deepthink`、`is_search`、`session_id`
- `GET /api/chat/sessions`
  - 获取当前用户会话列表
- `POST /api/chat/sessions`
  - 创建会话
- `PUT /api/chat/sessions/{session_id}`
  - 重命名会话
- `PUT /api/chat/sessions/{session_id}/pin`
  - 切换置顶状态
- `DELETE /api/chat/sessions/{session_id}`
  - 删除会话
- `GET /api/chat/sessions/{session_id}/messages`
  - 获取会话消息列表
- `PUT /api/chat/messages/{message_id}`
  - 编辑用户消息
- `DELETE /api/chat/sessions/{session_id}/messages`
  - 删除会话内消息，可通过 `after_id` 删除某条消息之后的记录

## 当前实现细节

### 登录与鉴权

- 前端通过 `localStorage` 持久化 `token` 和 `user`
- 所有 axios 请求会自动附带 `Authorization: Bearer <token>`
- 流式聊天因为需要 `POST + Authorization`，使用 `fetch` 手动解析 SSE 数据
- 未登录访问非 `/login` 页面时，前端会自动跳转到登录页
- 后端鉴权严格依赖 JWT，不再回退到默认用户

### 聊天能力

- 普通模式使用 `deepseek-chat`
- 深度思考模式使用 `deepseek-reasoner`
- 联网搜索开启后，会在调用模型前先执行 Tavily 检索
- 搜索结果会以引用列表形式返回，并在前端右侧来源面板展示
- 助手消息会在数据库中编码保存正文、推理内容和搜索元数据
- 模型不可用或未配置密钥时，会自动回退到本地兜底回答

### 会话行为

- 新对话首次发送消息时自动创建会话
- 会话标题默认取用户首条问题摘要
- 支持会话重命名、置顶、删除
- 支持基于上一轮用户消息重新生成 AI 回答
- 支持编辑用户消息后重新发送

## 已知限制

- 微信扫码登录依赖真实可访问的微信回调环境，本地开发一般只能验证二维码生成与轮询流程
- 微信 Access Token 当前使用进程内缓存，适合开发期，生产环境更适合迁移到 Redis
- 项目当前未补齐自动化测试
- 前端生产构建目前会出现 Vite 的大包体积告警，但不影响本地开发和基础构建
- 文件上传相关表结构已存在，但完整上传链路尚未接通

## 开发建议

- 后端新增接口时，继续沿用统一响应结构：`success / code / message / data`
- 涉及会话和消息的接口，保持当前“按用户归属校验”的策略
- 前端新增 API 时，优先在 `frontend/src/services/api.ts` 中集中封装
- 若继续增强联网搜索，建议补充结果缓存、超时监控和失败重试策略
- 若准备部署生产环境，建议补充日志分级、Redis、反向代理和 HTTPS 配置

## 当前构建状态

最近一次前端已可正常执行：

```powershell
cd frontend
npm run build
```

如果你只是想快速启动当前项目，最短路径是：

1. 配置后端 `.env`
2. 初始化 MySQL 数据库
3. 启动后端
4. 启动前端
5. 打开 `http://127.0.0.1:5173`
