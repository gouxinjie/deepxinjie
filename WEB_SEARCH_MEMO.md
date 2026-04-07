# 联网搜索功能实现备忘录 (Web Search Memo)

## 1. 功能概述
复刻 DeepSeek 官方“联网搜索”功能，实现“已阅读 X 个网页”的视觉效果及基于实时搜索结果的 AI 回答。

## 2. 核心技术痛点
- **API 限制**：当前使用的 `deepseek-chat` 和 `deepseek-reasoner` API 是纯模型接口，不具备内置联网能力。
- **解决方案**：采用 RAG (检索增强生成) 架构，手动集成第三方搜索服务。

## 3. 实现路线图

### 后端实现 (Python/FastAPI)
1. **集成搜索 API**：
   - 推荐服务：[Tavily AI](https://tavily.com/) (专为 LLM 优化) 或 [SerpApi](https://serpapi.com/)。
   - 申请 API Key 并配置到 `.env` 环境变量中。
2. **修改 `chat.py` 逻辑**：
   - 当 `is_search=true` 时，在调用模型前先执行搜索动作。
   - 编写 `web_search(query)` 函数，获取网页摘要和链接。
   - 将搜索到的内容作为 `Context` 拼接到 `messages` 的 `User` 消息前部。
3. **增强 SSE 流**：
   - 向前端发送 `search_status` 事件，告知当前正在搜索、正在阅读、已阅读网页数量等状态。

### 前端实现 (React/TypeScript)
1. **UI 组件开发**：
   - 在 `ChatMessage.tsx` 中新增 `SearchStatus` 子组件。
   - 模仿官方样式：展示搜索图标、动态更新“正在阅读...”到“已阅读 7 个网页”。
   - 实现悬浮或点击展示搜索来源列表。
2. **样式适配**：
   - 在 `ChatMessage.module.scss` 中增加搜索状态条的样式（淡灰色背景、小圆标图标等）。
3. **状态处理**：
   - 解析 SSE 返回的新事件类型，实时更新 UI 上的已阅读数量。

## 4. 待办清单 (TODO)
- [ ] 注册 Tavily AI 账号并获取 API Key。
- [ ] 后端新增搜索服务模块 `backend/services/search_service.py`。
- [ ] 调整后端 `generate_response` 函数支持搜索上下文注入。
- [ ] 前端 `ChatMessage` 增加搜索状态渲染逻辑。
- [ ] 前端一比一复刻搜索状态条样式。
