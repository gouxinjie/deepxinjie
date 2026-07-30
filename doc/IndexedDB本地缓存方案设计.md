# 本地缓存与容灾设计（IndexedDB）

> 本文记录 DeepXinjie 前端引入 IndexedDB 本地缓存的需求背景、设计方案，以及本次需求改动中修复的两个真实问题。
> 涉及代码：`frontend/src/db/indexedDB.ts`、`frontend/src/services/localCache.ts`、`frontend/src/components/Chat/ChatMain.tsx`。

---

## 一、需求背景：为什么这次要引入本地缓存

在引入本地缓存之前，聊天界面所有数据都依赖服务端接口。这在以下场景会暴露明显短板：

1. **首屏白屏等待**：打开历史会话时，必须等服务端返回完整消息列表才能渲染，弱网下体验很差。
2. **刷新即丢草稿**：在输入框写了一半的内容，误触刷新或切换会话后直接消失。
3. **流式断点不可恢复**：AI 正在生成时，若用户刷新页面或网络抖动，已经“流”出来的部分内容无法恢复。
4. **离线不可用**：无网络时连历史会话都打不开，无法浏览。
5. **多账号串数据风险**：本地若随意缓存，A 账号可能看到 B 账号的历史。

本次需求的核心目标就是：**在不改变“服务端为唯一真相源”的前提下，用 IndexedDB 给前端加一层“加速 + 容灾”缓存，让界面在弱网/离线/刷新下依旧快、依旧不丢数据，且多账号不串数据。**

---

## 二、设计原则

| 原则 | 说明 |
| --- | --- |
| 真相源唯一 | 服务端数据始终权威；本地缓存只在“网络慢/失败”时兜底，并在拿到服务端数据后被覆盖。 |
| 加速 + 容灾 | 本地缓存定位为“秒开”与“断点恢复”，不是第二份真相。 |
| 统一封装 | 所有 IDB 读写必须经过 `db/indexedDB` 薄封装层，组件禁止直接 `indexedDB.open`。 |
| 故障隔离 | 本地读写异常绝不影响主流程，缓存层每个函数独立兜底。 |
| 隐私隔离 | 所有记录带 `user_id`，草稿按 `userId:sessionKey` 复合主键隔离。 |

---

## 三、数据模型设计

数据分三个 object store（仓库）：

| 仓库 | 主键 | 索引 | 用途 |
| --- | --- | --- | --- |
| `messages` | `id` | `by_session`、`by_user` | 消息本地缓存，支撑首屏秒开与流式断点恢复 |
| `sessions` | `id` | `by_user` | 会话列表本地缓存，支撑侧边栏离线可用 |
| `drafts` | `key`（复合：`userId:sessionKey`） | 无 | 草稿，防丢输入 |

建表逻辑（`frontend/src/db/indexedDB.ts` 的 `onupgradeneeded`）：

```ts
// frontend/src/db/indexedDB.ts:28-47
request.onupgradeneeded = () => {
  const db = request.result;

  if (!db.objectStoreNames.contains('messages')) {
    const store = db.createObjectStore('messages', { keyPath: 'id' });
    // 按会话查询消息列表
    store.createIndex('by_session', 'session_id', { unique: false });
    // 按用户隔离多账号数据
    store.createIndex('by_user', 'user_id', { unique: false });
  }

  if (!db.objectStoreNames.contains('sessions')) {
    const store = db.createObjectStore('sessions', { keyPath: 'id' });
    store.createIndex('by_user', 'user_id', { unique: false });
  }

  if (!db.objectStoreNames.contains('drafts')) {
    db.createObjectStore('drafts', { keyPath: 'key' });
  }
};
```

业务层为每个仓库定义了带命名空间字段的接口（`frontend/src/services/localCache.ts`）：

```ts
// frontend/src/services/localCache.ts:14-39
interface CachedMessage extends Message {
  session_id: number; // 用于索引查询
  user_id: number;    // 用于多账号隔离
}

interface CachedDraft {
  key: string;        // 复合主键：user_id:session_key
  user_id: number;
  session_key: string;
  content: string;
  updated_at: number;
}

const draftKey = (userId: number, sessionKey: string): string => `${userId}:${sessionKey}`;
```

---

## 四、核心实现

### 4.1 连接单例，避免重复 open

每次读写都 `indexedDB.open()` 会创建大量连接、引发并发事务冲突。改用惰性单例 `dbPromise`，全应用共享一条打开连接：

```ts
// frontend/src/db/indexedDB.ts:19-20,22-54
let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => { /* 建表/建索引 */ };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}
```

### 4.2 单事务批量写入，降低写放大

流式同步消息时，逐条 `put` 会产生大量事务与冲突。封装 `putRecords` 在一个事务里写完全部记录：

```ts
// frontend/src/db/indexedDB.ts:61-70
export async function putRecords(storeName: string, values: object[]): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    values.forEach((value) => store.put(value));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

### 4.3 业务层容错封装

`localCache` 在 `db` 层之上提供语义化 API，且**每个函数独立 try/catch 兜底**，本地异常只 `console.warn` 并返回空/静默失败，绝不抛出影响主流程：

```ts
// frontend/src/services/localCache.ts:47-79
export async function getCachedMessages(userId: number, sessionId: number): Promise<Message[]> {
  try {
    const list = await getAllByIndex<CachedMessage>('messages', 'by_session', sessionId);
    return list
      .filter((item) => item.user_id === userId)
      .map(({ session_id, user_id, ...rest }) => rest);
  } catch (error) {
    console.warn('读取本地消息缓存失败', error);
    return [];
  }
}

export async function cacheMessages(
  userId: number, sessionId: number, messages: Message[],
): Promise<void> {
  try {
    // 单连接单事务批量写入
    await putRecords('messages', messages.map((m) => ({ ...m, session_id: sessionId, user_id: userId })));
  } catch (error) {
    console.warn('写入本地消息缓存失败', error);
  }
}
```

---

## 五、关键流程

### 5.1 首屏：本地优先 + 服务端覆盖

打开会话时，先读本地缓存秒级渲染，再静默请求服务端；服务端返回后覆盖本地状态。只有“本地无缓存且服务端也失败”才清空：

```ts
// frontend/src/components/Chat/ChatMain.tsx:307-341（节选）
const loadMessages = async (id: number) => {
  // 1) 优先从本地缓存秒级渲染
  if (userId > 0) {
    try {
      const cached = await getCachedMessages(userId, id);
      if (cached.length > 0) {
        setMessages(cached); // 立即渲染，无需等待网络
      }
    } catch (cacheError) { console.warn('读取本地消息缓存失败', cacheError); }
  }

  // 2) 再静默同步服务端，成功后覆盖本地
  try {
    const response = await sessionApi.getMessages(id);
    if (response.data.success) {
      const messages = formatMessages(response.data.data.messages);
      setMessages(messages);            // 服务端为真相源，覆盖本地
      if (userId > 0) void cacheMessages(userId, id, messages);
      return;
    }
    if (!loadedFromCache) setMessages([]);
  } catch (error) { /* 网络失败：保留本地缓存兜底 */ }
};
```

### 5.2 流式增量落盘：节流 + 孤儿清理

流式过程中，AI 消息被**增量落盘**，但做了两道保护：

- **仅在拿到真实 id 后落盘**：流式首包会返回服务端 `message_id`，此前消息用的是客户端临时 `crypto.randomUUID()`。若提前落盘临时 UUID，会留下“幽灵记录”。因此用 `nextMessage.id !== aiMessageId` 判断（临时 id 与参数 `aiMessageId` 相同，说明还没切换）。
- **临时 → 真实 id 切换时清理孤儿**：切到真实 id 后，把之前的临时 id 记录删掉。
- **节流**：每个 chunk 都写 IDB 会抖主线程，故用 `CACHE_PERSIST_INTERVAL = 200ms` 节流，最终内容由 `finishStreamingMessage` 兜底。

```ts
// frontend/src/components/Chat/ChatMain.tsx:24-25
const CACHE_PERSIST_INTERVAL = 200; // 流式消息落盘节流间隔（毫秒）

// frontend/src/components/Chat/ChatMain.tsx:421-434（节选）
const ctx = cacheContextRef.current;
if (ctx && nextMessage.id !== aiMessageId) {           // 仅真实 id 才落盘
  if (prevStreamId && prevStreamId !== nextMessage.id) {
    void deleteCachedMessage(prevStreamId);            // 清理上一条临时 id 孤儿
  }
  const now = Date.now();
  if (now - lastCachePersistRef.current >= CACHE_PERSIST_INTERVAL) {
    lastCachePersistRef.current = now;
    void upsertMessage(ctx.userId, ctx.sessionId, nextMessage);
  }
}
```

### 5.3 草稿保存与恢复

切换会话 / 误刷新时，未发送的输入通过 `saveDraft` / `loadDraft` / `clearDraft` 保留与清除；发送成功后清草稿：

```ts
// frontend/src/services/localCache.ts:143-163（节选）
export async function saveDraft(userId: number, sessionKey: string, content: string): Promise<void> {
  try {
    if (!content) { await clearDraft(userId, sessionKey); return; } // 空内容即清除
    await putRecord<CachedDraft>('drafts', {
      key: draftKey(userId, sessionKey), user_id: userId, session_key: sessionKey,
      content, updated_at: Date.now(),
    });
  } catch (error) { console.warn('写入本地草稿失败', error); }
}
```

### 5.4 多账号隔离

所有记录都带 `user_id`，消息/会话通过 `by_user` 索引过滤，草稿通过 `userId:sessionKey` 复合主键隔离，A 账号无法读到 B 账号数据。

---

## 六、本次需求改动中修复的两个问题

代码评审期间发现并修复了两个真实缺陷（已提交）。

### 6.1 临时 UUID 孤儿记录（流式中断时）

`finishStreamingMessage` 在完成时统一落盘，但**原本缺少真实 id 守卫**：若流式在收到首个分片前就被中断/报错，`nextMessage.id` 仍是客户端临时 UUID，会被写入 IndexedDB 成为永久孤儿（存储泄漏，离线刷新还会显示幽灵消息）。

`applyStreamChunk` 有 `nextMessage.id !== aiMessageId` 守卫不会落盘临时记录，但 `finishStreamingMessage` 漏了。修复方式：仅在消息已获得真实（数字）id 时才落盘：

```ts
// frontend/src/components/Chat/ChatMain.tsx:483-488
// 仅当消息已获得真实（数字）ID 才写入，避免把临时 UUID 消息残留为孤儿记录
// （例如流式在收到首个分片前就被中断/报错时，nextMessage.id 仍是客户端临时串）。
const ctx = cacheContextRef.current;
if (ctx && /^\d+$/.test(nextMessage.id)) {
  void upsertMessage(ctx.userId, ctx.sessionId, nextMessage);
}
```

### 6.2 未使用的导入清理

评审发现第 11 行 `import { cn } from '../../utils/cn'` 导入后从未被调用，触发 lint 警告并违反“不允许未使用代码”规范，已移除，仅保留文件中实际使用的 `classNames`。

---

## 七、小结

本次 IndexedDB 需求改动解决的核心问题是：**让聊天界面在弱网/离线/刷新时依旧快、依旧不丢数据，且多账号不串数据。** 实现上采用“连接单例 + 单事务批量写入 + 业务层全链路容错”来保证这套机制本身的稳定，并通过“本地优先、服务端真相源覆盖”的策略正确定位本地缓存的角色。评审中补充的两处修复（临时 UUID 孤儿记录守卫、未使用导入清理）进一步保证了数据一致性与代码整洁。

后续可选增强：用户消息同样使用临时 UUID，正常完成会被服务端覆盖，仅残留少量孤儿记录，如需彻底消除可仿照 6.1 加数字 id 守卫（但会牺牲“首分片到达前刷新可恢复用户消息”的能力，需权衡）。
