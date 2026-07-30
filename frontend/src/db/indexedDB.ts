/**
 * @module db/indexedDB
 * @description 本地 IndexedDB 薄封装，提供连接、事务与基础 CRUD。
 *              所有缓存读写统一经此模块，禁止组件中直接操作 IDB。
 * @author gouxinjie
 * @created 2026-07-30
 * @updated 2026-07-30
 */

/** 数据库名称 */
const DB_NAME = 'deepxinjie_cache';
/** 数据库版本号，表结构变更时递增 */
const DB_VERSION = 1;

/**
 * 获取（惰性创建）数据库连接，按版本号自动迁移表结构。
 * @returns 已打开的 IDBDatabase 实例
 */
/** 数据库连接单例，避免每次读写都重新 open 连接造成资源浪费与并发问题 */
let dbPromise: Promise<IDBDatabase> | null = null;

export function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      // 版本升级时创建对象仓储与索引
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

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

/**
 * 单事务批量写入（覆盖更新多条记录），用于会话/消息列表整体落盘。
 * @param storeName - 对象仓储名称
 * @param values - 待写入对象数组
 */
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

/**
 * 泛型写入（覆盖更新单条记录）。
 * @param storeName - 对象仓储名称
 * @param value - 待写入对象（需包含 keyPath 字段）
 */
export async function putRecord<T extends object>(storeName: string, value: T): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value as object);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 按索引批量读取记录。
 * @param storeName - 对象仓储名称
 * @param indexName - 索引名称
 * @param value - 索引查询值
 * @returns 匹配的记录数组
 */
export async function getAllByIndex<T>(
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const db = await getDB();
  return new Promise<T[]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    const request = index.getAll(value);
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 按主键读取单条记录。
 * @param storeName - 对象仓储名称
 * @param key - 主键
 * @returns 记录或 undefined
 */
export async function getByKey<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await getDB();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 按主键删除记录。
 * @param storeName - 对象仓储名称
 * @param key - 主键
 */
export async function deleteByKey(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
