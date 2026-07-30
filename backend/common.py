"""
公共工具模块。
说明：
- 提供跨模块复用的基础工具函数，避免在各文件中重复定义。
"""

import os


def get_required_env(name: str) -> str:
    """
    获取必填环境变量。

    说明：
    - 数据库密码、JWT 密钥等敏感信息禁止在代码中提供默认值。
    - 若未配置则在启动阶段直接报错，避免误连到错误环境或泄露默认凭证。

    @param name - 环境变量名称
    @returns 环境变量值（非空字符串）
    @throws RuntimeError 当环境变量缺失或为空时抛出异常
    """
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"缺少必填环境变量：{name}")
    return value
