# 联网搜索实现方案

## 1. 目标

本项目的“联网搜索”不是模型原生能力，而是通过后端先调用搜索服务，再把搜索结果作为上下文注入大模型，实现类似 DeepSeek 联网回答的效果。

当前项目已经落地的方案是：

- 搜索服务：`Tavily`
- 后端框架：`FastAPI`
- 前端框架：`React + TypeScript`
- 流式协议：`SSE`
- 引用展示：回答内 `[来源1]` + 右侧来源侧边栏

---

## 2. 整体架构

完整链路如下：

1. 前端发送聊天请求到 `POST /api/chat/send`
2. 请求体中带上 `is_search=true`
3. 后端在真正调用模型前，先执行联网搜索
4. 后端把搜索结果整理成：
   - `citations`：给前端展示的来源列表
   - `search_context`：给模型使用的上下文文本
   - `search_status`：给前端展示的搜索状态提示
5. 后端把 `search_context` 作为一条 `system` 消息插入模型上下文
6. 模型基于搜索结果继续流式生成回答
7. 后端通过 SSE 持续推送：
   - `citations`
   - `search_status`
   - `reasoning`
   - `content`
   - `thinking_time`
8. 前端一边接收流式内容，一边更新回答、来源和搜索状态
9. 回答完成后，后端把最终回答、推理内容、来源元数据一起落库

---

## 3. 环境变量

当前联网搜索仅支持 Tavily，相关配置如下：

```env
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=你的Tavily密钥
SEARCH_TIMEOUT_SECONDS=10
SEARCH_MAX_RESULTS=5
SEARCH_FETCH_PAGE_CONTENT=false
SEARCH_PAGE_TIMEOUT_SECONDS=6
```

说明：

- `SEARCH_PROVIDER` 当前必须为 `tavily`
- `TAVILY_API_KEY` 未配置时，系统会自动回退为普通回答
- `SEARCH_MAX_RESULTS` 在代码中被限制为 `1~8`
- `SEARCH_FETCH_PAGE_CONTENT=true` 时，如果搜索摘要过短，会额外抓取网页正文并截断生成摘要

---

## 4. 后端实现

### 4.1 核心文件

- `backend/services/search_service.py`
- `backend/routers/chat.py`

### 4.2 搜索服务职责

`backend/services/search_service.py` 负责：

- 构建搜索关键词
- 调用 Tavily 搜索接口
- 清洗搜索结果文本
- 去重 URL
- 生成引用对象 `SearchCitation`
- 生成模型上下文 `search_context`
- 返回前端展示文案 `search_status`

核心入口函数：

```python
async def prepare_search_context(user_question: str) -> tuple[list[SearchCitation], str, str]:
```

返回值说明：

- 第一个值：来源数组 `citations`
- 第二个值：给模型使用的搜索上下文 `search_context`
- 第三个值：给前端展示的状态文案 `search_status`

### 4.3 搜索结果结构

后端内部使用 `SearchCitation`：

```python
@dataclass
class SearchCitation:
    id: int
    title: str
    url: str
    domain: str
    snippet: str
```

字段说明：

- `id`：来源编号，用于回答里的 `[来源1]`
- `title`：网页标题
- `url`：原始网页链接
- `domain`：来源域名
- `snippet`：摘要内容

### 4.4 聊天接口接入点

`backend/routers/chat.py` 中的 `generate_response(...)` 是联网搜索接入主入口。

处理逻辑：

1. 前端传入 `is_search`
2. 若为 `true`，调用 `prepare_search_context(content)`
3. 若搜索成功：
   - 把 `citations` 和 `search_status` 先通过 SSE 推给前端
   - 把 `search_context` 注入到模型上下文中
4. 若搜索失败或未配置：
   - 只推送降级提示 `search_status`
   - 模型继续按普通对话回答

### 4.5 模型上下文注入方式

后端会在消息列表前插入一条 `system` 消息，要求模型：

- 优先参考联网搜索结果
- 不要编造搜索结果中不存在的信息
- 引用时使用 `[来源1]` 这种编号形式

这样模型输出时会自然生成类似：

```text
根据公开资料，Tavily 主要面向 LLM 检索场景优化。[来源1]
```

### 4.6 流式返回内容

后端通过 SSE 返回 JSON 分片，当前会推送这些字段：

```json
{
  "citations": [],
  "search_status": "已完成联网搜索，共引用 5 条来源。",
  "reasoning": "正在分析问题",
  "content": "这是回答正文",
  "thinking_time": 3
}
```

其中：

- `citations` 和 `search_status` 通常会先到
- `reasoning` 和 `content` 随模型流式输出逐步到达
- `thinking_time` 在推理阶段结束后补发

### 4.7 落库策略

为了保证会话刷新后还能恢复来源信息，后端没有单独建引用表，而是把以下内容编码进 assistant 消息正文里：

- `metadata`
- `reasoning`
- `content`

对应函数：

- `encode_assistant_content(...)`
- `decode_assistant_content(...)`
- `build_assistant_metadata(...)`

其中 `metadata` 内包含：

- `citations`
- `search_status`

这样历史消息重新加载时，前端仍然能拿到来源列表和搜索状态。

---

## 5. 前端实现

### 5.1 核心文件

- `frontend/src/services/api.ts`
- `frontend/src/types/api.ts`
- `frontend/src/types/chat.ts`
- `frontend/src/components/Chat/ChatMain.tsx`
- `frontend/src/components/Chat/ChatMessage.tsx`
- `frontend/src/components/Chat/ChatCitationPanel.tsx`

### 5.2 请求发送

前端通过 `sendChatStream(...)` 使用 `fetch + POST` 调用：

```ts
/api/chat/send
```

请求体结构：

```ts
export interface SendMessagePayload {
  content: string;
  is_deepthink: boolean;
  is_search: boolean;
  session_id: number;
}
```

说明：

- `is_search` 决定是否开启联网搜索
- 因为接口需要带鉴权头和 `POST` 请求体，所以前端没有用原生 `EventSource`，而是手动解析 SSE 文本流

### 5.3 前端类型

前端定义了搜索引用类型：

```ts
export interface SearchCitation {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}
```

流式分片类型：

```ts
export interface ChatStreamChunk {
  content?: string;
  reasoning?: string;
  citations?: SearchCitation[];
  search_status?: string;
  thinking_time?: number;
}
```

消息展示类型：

```ts
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  citations?: SearchCitation[];
  searchStatus?: string;
  thinkingTime?: number;
  isThinking?: boolean;
  isLoading?: boolean;
}
```

### 5.4 消息渲染

`ChatMain.tsx` 负责：

- 接收流式分片
- 将 `citations`、`search_status`、`thinking_time` 合并到当前 AI 消息
- 在重新进入历史会话时恢复来源数据
- 控制来源侧边栏打开和关闭

### 5.5 回答中的来源跳转

`ChatMessage.tsx` 会把回答中的：

```text
[来源1]
```

替换成可点击入口。点击后不会跳到页面锚点，而是直接打开右侧来源侧边栏，并高亮对应来源项。

### 5.6 来源侧边栏

`ChatCitationPanel.tsx` 负责来源展示：

- 桌面端：从右侧滑入
- 移动端：从底部弹层滑出
- 支持高亮当前点击的来源编号
- 支持关闭动画
- 支持 `Esc` 关闭

来源展示字段：

- 来源编号
- 标题
- 域名
- 摘要
- 外链跳转

---

## 6. 当前交互效果

当前已实现的联网搜索体验包括：

- 输入问题时可开启“联网搜索”
- 回答顶部展示搜索状态文案
- 回答正文可输出 `[来源1]`
- 点击 `[来源1]` 可打开右侧来源栏
- 回答操作区可点击“查看来源”
- 来源数据会随会话持久化，刷新后仍可查看

---

## 7. 降级策略

为了避免搜索服务异常导致整个聊天不可用，当前做了这些降级：

- 未配置 `SEARCH_PROVIDER=tavily` 时，回退普通回答
- 未配置 `TAVILY_API_KEY` 时，回退普通回答
- Tavily 请求失败时，回退普通回答
- 搜索无结果时，回退普通回答
- 模型不可用时，回退本地 mock 回答

前端仍然会收到对应的 `search_status`，用于告知用户当前是降级状态。

---

## 8. 当前方案优点

- 实现成本低，接入简单
- 不依赖模型原生联网能力
- 搜索结果可控，可做引用展示
- 支持来源持久化
- 支持流式体验
- 方便后续替换搜索提供商

---

## 9. 当前方案限制

- 搜索质量依赖 Tavily 返回结果
- 摘要质量不一定稳定
- `search_context` 是纯文本拼接，不是结构化检索增强
- 目前没有多轮搜索规划能力
- 没有做来源可信度排序
- 没有做站点白名单/黑名单控制
- 没有做缓存，重复问题会重复搜索

---

## 10. 后续可优化方向

建议后续按下面顺序继续增强：

1. 增加搜索结果缓存，减少重复请求成本
2. 增加来源可信度评分和排序
3. 对不同问题类型做查询改写
4. 增加站点白名单和黑名单
5. 对搜索结果做更强的正文抽取
6. 增加多轮搜索和二次检索
7. 增加“已阅读 X 个网页”的更细粒度状态反馈
8. 增加搜索日志，便于排查联网结果质量

---

## 11. 最终结论

本项目当前的联网搜索方案，本质上是：

```text
前端开关 -> 后端调用 Tavily -> 结果整理为 citations/search_context ->
system 注入模型 -> SSE 流式返回 -> 前端侧边栏展示来源 -> 元数据持久化
```

这套方案已经可以稳定支撑“带来源的联网回答”能力，并且和当前项目前后端结构是兼容的。
