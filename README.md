# DeepXinjie

一个前后端分离的 AI 聊天项目，前端基于 `React 19 + TypeScript + Vite`，后端基于 `FastAPI + MySQL`。

当前版本已经完成以下核心能力：
- 账号密码注册与登录
- 基于 Access Token + Refresh Token 的会话续期
- 会话列表、重命名、置顶、删除
- 流式聊天输出
- 深度思考模式
- 联网搜索与来源展示
- 用户消息编辑后重新生成
- 基于上一轮消息继续生成

## 认证改造说明

当前仓库已经移除以下登录方式：
- 微信扫码登录
- 短信验证码登录
- 未注册手机号自动注册

当前仅支持标准账号体系：
- 登录：`手机号账号 + 密码`
- 注册：`手机号账号 + 用户名 + 密码`

同时保留了已有账号、会话和消息数据，不会因为这次改造被清理。

## 登录页说明

登录页已改成更接近 Claude / ChatGPT 的极简单卡片风格：
- 居中单卡片布局
- 登录 / 注册切换支持过渡动画
- 注册态用户名输入区使用折叠展开方式
- 小高度窗口下会自动收紧垂直间距，避免卡片底部超出窗口
- 主按钮已调整为项目主题蓝风格

## 技术栈

### 前端

- React 19
- TypeScript 5
- Vite 8
- React Router 7
- Axios
- Zustand
- Sass / SCSS
- `react-markdown`
- `remark-gfm`
- `rehype-highlight`
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

## 目录结构

```text
.
├─ backend/                      # FastAPI 后端
│  ├─ main.py                    # 应用入口
│  ├─ db.py                      # MySQL 连接池
│  ├─ auth_utils.py              # JWT 鉴权工具
│  ├─ init_db.py                 # 数据库初始化脚本
│  ├─ schema.sql                 # 数据库结构
│  ├─ seed_user.py               # 演示用户初始化脚本
│  ├─ routers/
│  │  ├─ auth.py                 # 注册、登录、刷新、退出接口
│  │  └─ chat.py                 # 会话、消息、流式聊天接口
│  └─ services/
│     └─ search_service.py       # 联网搜索封装
├─ frontend/                     # React 前端
│  ├─ src/
│  │  ├─ components/
│  │  ├─ pages/
│  │  ├─ services/
│  │  ├─ store/
│  │  ├─ styles/
│  │  └─ types/
│  ├─ package.json
│  └─ vite.config.ts
├─ start.bat                     # Windows 一键启动脚本
└─ README.md
```

## 运行环境

- Node.js 20+
- Python 3.11+
- MySQL 8+

## 环境变量

后端通过 `python-dotenv` 读取环境变量，建议在 `backend/.env` 中配置。

### 必填

```env
DB_PASSWORD=你的数据库密码
JWT_SECRET=你的JWT密钥
```

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

ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
```

说明：
- `DB_PASSWORD` 和 `JWT_SECRET` 缺失时，后端会在启动阶段直接报错。
- `ACCESS_TOKEN_EXPIRE_MINUTES` 控制短效 Access Token 时长。
- `REFRESH_TOKEN_EXPIRE_DAYS` 控制 Refresh Token 会话时长。
- `COOKIE_SECURE=true` 时要求 HTTPS 环境。

## 数据库初始化

首次启动前请先初始化数据库：

```powershell
cd backend
python init_db.py
```

如需插入演示用户，可执行：

```powershell
cd backend
python seed_user.py
```

当前核心表：
- `user`
- `user_session`
- `chat_session`
- `chat_message`
- `file_upload`

## 启动方式

### 方式一：分别启动前后端

#### 1. 启动后端

```powershell
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

或：

```powershell
cd backend
python main.py
```

#### 2. 启动前端

```powershell
cd frontend
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

### 方式二：使用一键启动脚本

```powershell
start.bat
```

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

## 认证与会话机制

当前登录态机制如下：

- 登录或注册成功后：
  - 后端返回短效 `accessToken`
  - 后端同时写入 `HttpOnly refresh_token Cookie`
  - 后端同时写入 `csrf_token Cookie`
- 前端将 `accessToken` 保存在 Zustand 内存状态中
- 页面刷新后，前端会自动调用 `/api/auth/refresh` 恢复登录态
- `refresh_token` 不暴露给前端 JavaScript，主要用于续期
- `csrf_token` 用于前端回填请求头，配合后端做 CSRF 校验

说明：
- 关闭标签页或刷新页面不会直接丢失登录态，只要 Refresh 会话未过期即可恢复。
- 是否在关闭浏览器后仍保留登录态，取决于 Cookie 生命周期和浏览器本身的会话策略；当前实现按 `max_age` 持久化 Refresh 会话。

## 后端接口概览

### 认证相关

- `POST /api/auth/register`
  - 账号注册
- `POST /api/auth/login`
  - 账号密码登录
- `POST /api/auth/refresh`
  - 刷新 Access Token
- `GET /api/auth/me`
  - 获取当前用户信息
- `POST /api/auth/logout`
  - 退出登录

### 聊天相关

- `POST /api/chat/send`
  - 鉴权保护的流式聊天接口
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
  - 删除某条消息之后的记录
- `POST /api/chat/messages/{message_id}/stop`
  - 停止生成

## 当前实现细节

### 前端

- 所有认证相关 API 统一封装在 `frontend/src/services/api.ts`
- 登录页与登录弹窗都已经切换为账号密码认证模式
- 流式聊天使用 `fetch + POST` 手动解析 SSE 分片
- 401 场景下会优先尝试自动刷新登录态

### 后端

- 所有认证响应统一为 `success / code / message / data` 结构
- 刷新会话保存在 `user_session` 表中
- Refresh Token 与 CSRF Token 在数据库中以哈希形式保存
- 登录不再自动注册，必须显式调用注册接口

## 已知说明

- 当前项目尚未补齐完整自动化测试
- 前端生产构建仍会出现较大 bundle 提示，但不影响本地开发与基础构建
- 文件上传表结构已存在，但完整上传链路尚未完全接入

## 最近验证

最近已验证通过：

```powershell
cd backend
python -m compileall backend
```

```powershell
cd frontend
npm run build
```

## License

本项目采用 `MIT License`，详见 [LICENSE](D:/MyProjects/deepxinjie/LICENSE)。
