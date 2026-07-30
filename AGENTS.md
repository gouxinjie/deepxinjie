# DeepXinjie 开发规范

本文档是 **DeepXinjie**（一个前后端分离的 AI 聊天应用）的核心开发约束，供开发团队与 AI 编码助手共同遵守。**所有生成的代码、注释、数据库设计必须遵循以下规则，注释必须使用中文。**

---

## 一、项目概览

- **项目定位**：前后端分离的 AI 聊天网站，产品形态参考企业级 AI 聊天产品（流式对话、深度思考、联网搜索等）。
- **前端**：`React 19 + TypeScript 5 + Vite 8 + React Router 7 + Axios + Zustand 5 + SCSS`，UI 组件基于 `Radix UI`（dialog / dropdown-menu / toast / tooltip），动画使用 `framer-motion`，图表使用 `mermaid`，Markdown 渲染使用 `react-markdown` + `remark-gfm` + `remark-math` + `rehype-highlight` + `rehype-katex`，图标使用 `lucide-react`，className 合并使用 `clsx` + `tailwind-merge` + `classnames`。
- **后端**：`FastAPI + Uvicorn + MySQL`，数据库驱动 `mysql-connector-python`，模型接入 `OpenAI Python SDK`（DeepSeek 兼容），配置读取 `python-dotenv`，鉴权 `pyjwt` + `passlib[bcrypt]`。
- **核心能力**：账号注册/登录、`Access Token + Refresh Token` 续期、`CSRF Token` 校验、会话管理（新建/列表/重命名/置顶/删除）、流式聊天与中断、深度思考、联网搜索与来源侧边栏、用户消息编辑后重新生成、基于上一轮继续生成、桌面端与移动端双端适配。
- **运行环境**：Node.js 20+ / Python 3.11+ / MySQL 8+。
- **启动方式**：根目录 `start.bat` 一键启动；或分别执行 `backend` 的 `uvicorn main:app` 与 `frontend` 的 `npm run dev`。

> 任何涉及接口、数据库、环境变量的需求，必须先查阅本仓库真实文件（`frontend/src/services/api.ts`、`backend/routers/*`、`backend/schema.sql`、`backend/*.py`、`README.md`），**禁止编造**。

---

## 二、目录结构规范（以本仓库实际为准）

### 2.1 仓库根目录

```text
.
├─ backend/                      # FastAPI 后端
│  ├─ main.py                    # 应用入口（含 CORS、路由挂载、健康检查）
│  ├─ db.py                      # MySQL 连接工具（参数化查询封装）
│  ├─ auth_utils.py              # JWT 签发/校验、密码哈希、CSRF 工具
│  ├─ init_db.py                 # 数据库初始化脚本
│  ├─ seed_user.py               # 演示用户初始化脚本
│  ├─ schema.sql                 # 数据库表结构
│  ├─ requirements.txt           # Python 依赖
│  ├─ routers/                   # 路由层
│  │  ├─ auth.py                 # 注册、登录、刷新、退出、当前用户接口
│  │  └─ chat.py                 # 会话、消息、流式聊天接口
│  └─ services/                  # 业务服务层
│     └─ search_service.py       # 联网搜索封装
├─ frontend/                     # React 前端
│  └─ src/
│     ├─ assets/                 # 静态资源（图片、SVG 等）
│     ├─ components/             # 组件目录
│     │  ├─ Chat/                # 聊天业务组件（按文件组织）
│     │  ├─ commons/             # 公共组件（按文件夹组织，含 index.tsx + index.scss）
│     │  ├─ Layout/              # 布局组件
│     │  └─ DeepXinjieLogo.tsx   # 独立组件
│     ├─ context/                # React Context（如主题、全局状态）
│     ├─ hooks/                  # 自定义 Hooks（如 useMobile）
│     ├─ pages/                  # 页面级组件（如 Login）
│     ├─ services/               # 接口请求封装（api.ts）
│     ├─ store/                  # Zustand 状态管理
│     │  ├─ authStore.ts         # 登录态、accessToken、用户信息
│     │  ├─ sessionStore.ts      # 会话列表、当前会话
│     │  └─ themeStore.ts        # 主题状态
│     ├─ styles/                 # 全局样式（variables.scss / mixins.scss / reset.scss / global.scss）
│     ├─ types/                  # TypeScript 类型定义（api.ts / chat.ts）
│     ├─ utils/                  # 工具函数（cn、格式化、校验等）
│     ├─ App.tsx / App.module.scss / App.css / index.scss / main.tsx
│     └─ ...
├─ start.bat                     # Windows 一键启动脚本
└─ README.md
```

### 2.2 约定

- 公共组件统一放在 `components/commons/<ComponentName>/`，每个组件独立文件夹，包含 `index.tsx` 与 `index.scss`。
- 业务组件按域组织在 `components/Chat/`、`components/Layout/` 等目录。
- 所有接口请求集中在 `services/api.ts`，按模块导出函数，**禁止在组件中直接写请求地址**。
- 类型定义集中在 `types/`，前后端共享的数据结构需在 `types/api.ts` 与 `types/chat.ts` 中显式声明。

---

## 三、前端代码规范

### 3.1 类型安全

- 必须使用 TypeScript，**禁止使用 `any`**。
- 所有函数、变量、API 响应、组件 Props 必须定义明确类型。
- 严格遵循 `tsconfig`（开启 `strict`），不允许通过类型断言绕过检查。

### 3.2 代码风格

- 遵循 ESLint 配置（`typescript-eslint` + `react-hooks` + `react-refresh`），运行 `npm run lint` 必须零错误。
- **禁止使用 `eslint-disable`**。
- 使用函数组件 + Hooks，**禁止 class component**。

### 3.3 样式规范

- 优先使用 SCSS；组件级样式使用 **CSS Modules**（`*.module.scss`）。
- 全局变量（颜色、字体、间距等）必须定义在 `styles/variables.scss`，变量以 `$` 开头；通用混合宏放在 `styles/mixins.scss`。
- **禁止污染全局样式**：组件样式必须通过 CSS Modules 局部作用域，全局样式仅放在 `styles/`。
- 所有样式注释必须使用中文，关键布局（flex/grid 分区）需说明。

### 3.4 组件注释

每个组件文件**必须包含头部注释**：

```ts
/**
 * @component 组件名称
 * @description 组件描述
 * @author gouxinjie
 * @created 创建日期
 * @updated 最近更新日期
 */
```

组件 Props / 接口定义必须逐字段注释，说明：类型、含义、是否必填、默认值。

### 3.5 状态管理

- 局部状态使用 `useState` / `useReducer`。
- 跨组件或全局状态使用 **Zustand**（已有 `authStore` / `sessionStore` / `themeStore`），**禁止滥用全局状态**。
- 状态与 store 命名必须语义化，按职责拆分 store，不混用。

### 3.6 工具函数

- className 合并统一使用 `utils` 中的 `cn`（基于 `clsx` + `tailwind-merge`），**禁止手写字符串拼接 className**。

---

## 四、API 与请求规范

### 4.1 请求封装

- 所有 REST 请求通过 `services/api.ts` 中的 `axios` 实例发起，统一处理 `baseURL`、`Authorization` 注入、错误拦截。
- 每个接口函数**必须添加函数注释**（功能、参数、返回值、异常）。

### 4.2 鉴权与 CSRF

- 登录/注册成功后，后端返回短效 `accessToken`（前端存入 `authStore` 内存状态），并写入 `HttpOnly refresh_token Cookie` 与 `csrf_token Cookie`。
- 所有受保护请求在请求头携带 `Authorization: Bearer <accessToken>`。
- 所有会改变状态的请求（`POST` / `PUT` / `DELETE` 等）**必须携带 `X-CSRF-Token`**（从 cookie 读取后回填），后端校验通过才放行。
- 前端收到 `401` 时，优先调用 `/api/auth/refresh` 续期并重放原请求；刷新失败则跳转登录。

### 4.3 流式聊天

- 流式对话接口 `/api/chat/send` **使用 `fetch + POST` 手动解析 SSE 分片**（不通过 axios），逐块更新消息内容并支持中断。
- 流式请求同样需要 `Authorization` 与 `X-CSRF-Token`。
- 中断生成调用 `POST /api/chat/messages/{message_id}/stop`。

### 4.4 统一响应结构

后端统一返回：

```json
{
  "success": true,
  "code": 200,
  "message": "操作成功",
  "data": {}
}
```

错误时：

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "错误描述（中文）",
  "data": null
}
```

前端必须基于 `success` 字段判断，并处理 `loading` / `error` 状态，**不允许假设接口结构**。

---

## 五、后端规范

### 5.1 分层

- 路由层 `routers/`：只负责参数校验、鉴权依赖、调用服务、组装响应。
- 服务层 `services/`：业务逻辑（如联网搜索）。
- 工具层 `db.py` / `auth_utils.py`：数据库连接、JWT、密码与 CSRF 工具，供路由复用。

### 5.2 响应与鉴权

- 所有接口响应统一使用 `success / code / message / data` 结构。
- JWT 鉴权使用 `pyjwt`；`refresh_token` 与 `csrf_token` 在 `user_session` 表中以哈希形式保存，绝不明文存储或下发给前端 JS。
- 刷新会话持久化在 `user_session` 表，登录必须显式调用注册接口，不再自动注册。

### 5.3 配置

- 通过 `python-dotenv` 读取环境变量，禁止在代码中硬编码 API Key、数据库密码、JWT Secret 等敏感信息。
- 必填：`DB_PASSWORD`、`JWT_SECRET`；常用可选：`DB_HOST/DB_USER/DB_NAME`、`DEEPSEEK_API_KEY/DEEPSEEK_BASE_URL`、`SEARCH_PROVIDER/TAVILY_API_KEY/...`、`ACCESS_TOKEN_EXPIRE_MINUTES`、`REFRESH_TOKEN_EXPIRE_DAYS`、`COOKIE_SECURE`、`COOKIE_SAMESITE`。

### 5.4 数据库

- 使用 `mysql-connector-python`，**所有查询必须使用参数化查询，禁止拼接 SQL**。
- 表结构中必须有中文注释；核心表：`user`、`user_session`、`chat_session`、`chat_message`、`file_upload`（详见 `schema.sql`）。

---

## 六、安全规范

1. **敏感信息**：API Key、数据库密码、JWT Secret 等一律使用环境变量，禁止硬编码。
2. **SQL 注入**：所有数据库查询必须参数化。
3. **CSRF**：改变状态的请求必须携带并校验 `X-CSRF-Token`。
4. **XSS**：所有用户输入在渲染前必须转义；Markdown 渲染需启用安全配置，禁止执行危险脚本。
5. **Token 安全**：`refresh_token` 设为 `HttpOnly`，不暴露给前端 JavaScript；`accessToken` 仅存内存。

---

## 七、错误处理

- 后端异常统一以 `success:false` + 中文 `message` 返回，并打印服务端日志（不泄露敏感信息）。
- 前端所有请求必须处理 `loading` / `error`，API 失败必须打印错误信息（不含 token、密码）。
- **不允许省略错误处理**。

---

## 八、性能规范

- 避免不必要的重复渲染；列表必须使用 `key`；大组件必须拆分；使用 `useMemo` / `useCallback` 优化。
- 路由组件支持懒加载；图片资源必须优化（懒加载/压缩）。
- 流式渲染需增量更新且避免阻塞主线程。

---

## 九、AI 行为约束（核心）

AI 编码助手必须遵守：

1. **不允许编造接口**：接口以 `services/api.ts`、`backend/routers/*` 为准。
2. **不允许假设数据库结构**：以 `schema.sql`、`db.py` 为准。
3. **不允许跳过鉴权**：所有受保护接口必须处理 `Authorization` 与 `CSRF Token`。
4. **不允许省略错误处理**。
5. **不允许生成未使用代码**（未使用变量 / 函数 / import / 样式）。
6. **不允许修改无关文件**。
7. **不明确需求必须询问**。

---

## 十、开发工作流（必须执行）

### 10.1 新功能开发流程

1. 分析需求
2. 确认接口与类型（不明确必须询问）
3. 定义 TypeScript 类型（`types/`）
4. 编写组件结构
5. 编写样式（SCSS / CSS Modules）
6. 接入 API（`services/api.ts`）
7. 添加错误处理与鉴权/CSRF
8. 自检是否符合本规范

### 10.2 修改代码流程

1. 阅读原代码
2. 理解业务逻辑
3. 给出修改方案
4. 再进行修改
（禁止直接修改而不分析）

### 10.3 Debug 流程

1. 分析报错
2. 定位问题
3. 找到根因
4. 提供修复方案

---

## 十一、输出规范（强制）

1. 必须输出完整代码
2. 必须包含 `import`
3. 必须使用代码块
4. 禁止伪代码
5. 必须有中文注释
6. 修改代码必须说明变更点

---

## 十二、自检机制（必须执行）

输出前必须检查：

1. 是否使用 TypeScript 且无 `any`
2. 受保护请求是否齐备 `Authorization` 与 `X-CSRF-Token`
3. 是否有错误处理
4. 是否符合目录结构与命名规范
5. 是否有未使用代码
6. 是否通过 ESLint（`npm run lint`）
7. 是否有中文注释
8. 流式接口是否正确使用 `fetch + SSE` 解析

不符合必须自动修正。

---

## 十三、日志规范

- 错误必须记录日志
- API 请求失败必须打印错误信息（禁止输出 token、密码等敏感信息）
- 开发环境允许 `console`，生产环境必须移除

---

## 十四、附则

- 所有代码必须自动校验本规范
- 特殊情况必须说明原因
- 违反规范必须拒绝生成代码
- 没有允许不能主动生成 `.md` 文档
