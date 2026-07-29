# AI 自动生成会话标题功能实现

## 一、功能背景

当前项目已经具备完整的流式对话能力：用户发送消息后，后端通过 `POST /api/chat/send` 以 SSE 分片形式逐字返回模型回答，前端实时渲染。

但会话列表存在一个体验问题：

- 新建会话时标题默认是 `新对话`
- 用户连续开多个会话后，侧边栏全是 `新对话`，无法区分每个会话在聊什么
- 虽然支持手动「重命名」，但需要用户主动操作，大部分人不会去改

因此，我们希望在**会话首轮回复完成后，由大模型自动生成一句简短的会话标题**，让侧边栏一眼可辨，同时保留用户手动重命名的能力。

---

## 二、目标

本功能的目标如下：

- 仅在会话首条消息回复完成时，自动生成标题
- 标题简短（不超过 20 字），能概括本轮对话主题
- 不引入额外的网络请求，复用现有流式通道
- 生成失败时优雅兜底，不影响主对话
- 与已有「手动重命名」能力互不冲突

---

## 三、结论先行

### 3.1 是否实现了「自动生成标题」

已经实现，并且是**零额外接口**的方案。

核心做法是：

1. 后端在流式回复走到 `COMPLETED` 之后、`[DONE]` 之前，调用一次大模型生成标题
2. 后端直接用参数化 SQL 把新标题写入 `chat_session` 表
3. 后端在 SSE 流里追加一条 `title` chunk 推给前端
4. 前端 `onChunk` 收到后，更新 Zustand 内存状态，侧边栏自动刷新

也就是说，**前端并没有调用任何「更新标题」的 REST 接口**，标题更新是寄生在 `/api/chat/send` 这条流里的。

### 3.2 为什么不单独做一个接口

标题本就在流式回复结束的那一刻产生，顺手写库 + 推送，比「前端再单独发一个 PUT 请求」更及时、更原子，也少了一次网络往返。手动重命名才需要独立接口（见第六节）。

---

## 四、整体流程

```text
用户发送首条消息
      │
      ▼
POST /api/chat/send（SSE 流式）
      │
      ├── 逐字推送 content 分片
      │
      ├── 回复完成 → 推送 message_status=completed
      │
      ├── 后端调用大模型生成标题（deepseek-chat，非流式）
      │       │
      │       ├── 写库：UPDATE chat_session SET title=?
      │       └── 推送 title chunk：{"title": "...", "session_id": N}
      │
      └── 推送 [DONE]

前端 onChunk 收到 title chunk
      │
      ▼
updateSessionTitle(sessionId, title)   ← Zustand store 内存更新
      │
      ▼
侧边栏从 store 读取 → 标题自动刷新
```

---

## 五、后端实现

### 5.1 标题生成函数

新增 `generate_session_title`，复用项目已有的 `client`（OpenAI 兼容的 deepseek 客户端），使用 `deepseek-chat` **非流式**调用：

```python
async def generate_session_title(user_text: str, assistant_text: str) -> str | None:
    """
    调用大模型为会话生成简短标题。
    仅在会话首轮回复完成后触发，使用 deepseek-chat 非流式调用。
    失败时返回 None，由调用方决定是否兜底。
    """
    if client is None:
        return None

    system_prompt = (
        "你是一个对话标题生成器。请根据用户与助手的对话内容，"
        "生成一句简洁的会话标题，不超过 15 个字，不要使用引号或书名号，"
        "只输出标题本身。"
    )
    context = f"用户：{user_text}\n助手：{assistant_text[:500]}"

    try:
        response = await client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": context},
            ],
            temperature=0.3,
            max_tokens=32,
            stream=False,
        )
        title = response.choices[0].message.content or ""
        # 去除模型可能附带的引号、书名号等包装符号
        title = title.strip().strip('"\'（）【】《》').strip()
        if not title:
            return None
        return title[:20]
    except Exception as exc:
        # 记录失败原因便于排查，不影响主对话流程
        logging.warning("会话标题自动生成失败：%s", exc)
        return None
```

设计要点：

- **非流式**：标题只要一句话，没必要流式，反而更简单
- **截断到 20 字**：防止模型偶尔输出过长内容
- **失败返回 `None`**：不抛异常，由调用方兜底保留原标题
- **`client is None` 直接返回**：未配置 `DEEPSEEK_API_KEY` 时不报错

### 5.2 挂载到流式响应

在 `generate_response` 中，标题生成被安排在 `message_status=completed` 推送之后、`[DONE]` 之前：

```python
# 首轮回复完成后，自动生成会话标题（仅当标题仍为自动生成值）
if payload.continue_from_message_id is None:
    current_title = None
    title_cursor = db.cursor(dictionary=True)
    try:
        title_cursor.execute(
            "SELECT title FROM chat_session WHERE id = %s",
            (payload.session_id,),
        )
        title_row = title_cursor.fetchone()
        if title_row:
            current_title = title_row["title"]
    finally:
        title_cursor.close()

    first_msg = (payload.content or "").strip()
    expected_auto_title = first_msg[:20] + ("..." if len(first_msg) > 20 else "")
    is_auto_title = current_title in ("新对话", expected_auto_title)

    if is_auto_title and first_msg:
        generated_title = await generate_session_title(first_msg, full_content)
        if generated_title:
            update_session_title(db, payload.session_id, generated_title)
            yield (
                f"data: {json.dumps({'title': generated_title, 'session_id': payload.session_id}, ensure_ascii=False)}\n\n"
            )

yield "data: [DONE]\n\n"
```

### 5.3 触发条件

标题生成有明确的两个前置判断：

1. **必须是首轮**：`payload.continue_from_message_id is None`
   - 续写（`continue_from_message_id` 不为空）说明不是新话题，不重新生成标题
2. **标题仍是自动值**：`current_title in ("新对话", expected_auto_title)`
   - `expected_auto_title` 是首条消息前 20 字 + 省略号，与前端创建会话时截断规则一致
   - 如果用户已经手动改过标题（不再是自动值），就不再覆盖

这样既保证「新会话自动起名」，又保证「用户手动命名不被覆盖」。

### 5.4 数据库更新（参数化防注入）

标题写库复用统一的 `update_session_title`，使用参数化查询，符合项目安全规范：

```python
def update_session_title(db: Any, session_id: int, title: str) -> None:
    """直接更新会话标题（供标题自动生成与手动重命名复用）。"""
    cursor = db.cursor()
    try:
        cursor.execute(
            "UPDATE chat_session SET title = %s WHERE id = %s",
            (title, session_id),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()
```

---

## 六、前端实现

### 6.1 流式接收 `title` chunk

前端在 `ChatMain` 的 `onChunk` 回调里解析 `title` 字段，调用 store 更新：

```typescript
onChunk: (chunk) => {
  if (typeof chunk.message_id === 'number') {
    activeMessageId = chunk.message_id.toString();
  }
  // 收到后端推送的标题分片，更新会话标题
  if (typeof chunk.title === 'string' && typeof chunk.session_id === 'number') {
    updateSessionTitle(chunk.session_id, chunk.title);
  }
  applyStreamChunk(aiMessageId, chunk);
},
```

对应的 `ChatStreamChunk` 类型也扩展了字段：

```typescript
interface ChatStreamChunk {
  message_id?: number;
  content?: string;
  reasoning?: string;
  title?: string;       // 新增：自动生成的会话标题
  session_id?: number;  // 新增：对应会话 ID
  message_status?: string;
}
```

### 6.2 Zustand store 更新

标题更新走的是内存状态，而不是 HTTP 请求：

```typescript
updateSessionTitle: (sessionId: number, title: string) => set((state) => ({
  sessions: state.sessions.map((s) =>
    s.id === sessionId ? { ...s, title } : s
  ),
})),
```

侧边栏 `ChatSidebar` 的会话列表直接从 `useSessionStore` 读取，store 一变，UI 自动刷新。

### 6.3 与「手动重命名」的对比

手动重命名是**真正走接口**的，用于对照理解：

```typescript
// ChatSidebar.tsx
const handleRename = async (id: number) => {
  const nextTitle = editTitle.trim();
  if (!nextTitle) {
    showToast('标题不能为空', 'error');
    return;
  }
  const response = await sessionApi.rename(id, nextTitle); // PUT /api/chat/sessions/{id}
  if (response.data.success) {
    setEditingId(null);
    showToast('重命名成功', 'success');
  }
};
```

后端对应：

```python
@router.put("/sessions/{session_id}")
async def rename_session(session_id: int, update: SessionUpdate, ...):
    ...
```

可以这样理解两者的分工：

| 场景 | 触发方式 | 是否调接口 | 后端落库位置 |
| --- | --- | --- | --- |
| AI 自动生成 | SSE 流内 push `title` chunk | 否 | 流式响应内部直接写 |
| 手动重命名 | 用户点「重命名」保存 | 是（`PUT /sessions/{id}`） | 接口内写 |

两者最终都调用同一个 `update_session_title(db, ...)`，只是入口不同。

---

## 七、为什么不在前端直接调接口更新

有读者会问：为什么不前端收到 `title` 后自己发一个 `PUT` 去更新？

原因有三：

1. **省一次往返**：标题在流结束那一刻已经算好，后端紧接着写库并推 chunk，前端无需再发请求
2. **原子性更好**：写库和推送在同一个生成链路里完成，不会出现「库更新了但前端没刷新」或反之的割裂
3. **复用通道**：SSE 本来就是要逐事件推送的，`title` 只是流里的最后一个业务事件，语义自然

这并非偷懒，而是一种更贴合流式架构的设计取舍。

---

## 八、边界与兜底

| 情况 | 行为 |
| --- | --- |
| 未配置 `DEEPSEEK_API_KEY` | `client is None`，直接返回 `None`，保留原标题 |
| 模型调用异常 | `except` 兜底返回 `None`，并记录 `logging.warning` |
| 生成标题为空 | 返回 `None`，保留原标题 |
| 非首轮消息（`continue_from_message_id` 不为空） | 不触发生成 |
| 用户已手动改名 | `current_title` 不再是自动值，不覆盖 |
| 标题过长 | 截断到 20 字 |

关键点：**任何生成失败都不会影响主对话**，最坏情况只是标题停留在「首条消息截断」或「新对话」。

---

## 九、调试与验证

### 9.1 在哪里能看到标题更新

打开浏览器 DevTools → **Network** → 找到 `POST /api/chat/send` 请求 → 看 **Response / Event Stream**，在 `content` 分片和 `message_status=completed` 之后，会看到一条：

```text
data: {"title": "如何配置 Python 虚拟环境", "session_id": 123}
```

这就是标题更新事件，它寄生在这条流里，所以你不会在网络面板里看到「额外的标题接口」。

### 9.2 后端日志

若生成失败，后端会打印：

```text
WARNING 会话标题自动生成失败：<异常信息>
```

可用它快速判断是 API Key、网络还是模型返回异常。

---

## 十、小结

AI 自动生成会话标题是一个小而美的增强能力，落地要点是：

- **复用流式通道**：标题作为 SSE 的最后一个业务事件推送，不新增接口
- **后端直接落库**：在生成链路内完成写库，原子且及时
- **前端只更新内存**：收到 `title` chunk 后更新 Zustand，侧边栏自动刷新
- **明确的触发边界**：仅首轮、仅当标题仍为自动值时生成，用户手动命名不被覆盖
- **全程兜底**：生成失败不影响主对话，最坏保留原标题

它和「手动重命名」互补：自动生成负责「开箱即用」，手动重命名负责「精确控制」，二者共用同一套标题存储逻辑。
