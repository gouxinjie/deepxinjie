/**
 * UUID 生成工具
 * @description 生成符合 RFC4122 v4 的唯一标识。
 * 由于 crypto.randomUUID 仅在安全上下文（HTTPS / localhost）可用，
 * 纯 HTTP 部署（如 http://chat.gouxinjie.com）下浏览器会判定为非安全上下文，
 * 该 API 不存在，因此优先使用原生实现，不可用时降级到 Math.random 方案，避免运行时崩溃。
 */

/**
 * 生成唯一标识字符串。
 * @returns RFC4122 v4 格式的 UUID
 */
const generateUUID = (): string => {
  // 安全上下文内优先使用原生 crypto.randomUUID
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // 降级方案：基于 Math.random 的 RFC4122 v4 实现
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export default generateUUID;
