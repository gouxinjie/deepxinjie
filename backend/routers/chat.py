import asyncio
import json
import os
from typing import Any, AsyncGenerator, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from auth_utils import get_current_user_id
from db import connection_pool, get_db

load_dotenv()

router = APIRouter(prefix="/api/chat", tags=["chat"])

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# DeepSeek 客户端仅在配置了 API Key 时初始化。
# 未配置时会自动走本地兜底回复，便于开发联调。
client = (
    AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    if DEEPSEEK_API_KEY
    else None
)


class SessionUpdate(BaseModel):
    """
    会话标题更新请求体。
    """

    title: str = Field(..., min_length=1, max_length=100)


class MessageUpdate(BaseModel):
    """
    消息编辑请求体。
    """

    content: str = Field(..., min_length=1)


class SendMessageRequest(BaseModel):
    """
    发送消息请求体。

    参数：
    - content: 用户消息内容。
    - is_deepthink: 是否启用深度思考模式。
    - is_search: 是否启用联网搜索模式。
    - session_id: 当前会话 ID，必须为当前用户所有。
    """

    content: str = Field(..., min_length=1)
    is_deepthink: bool = False
    is_search: bool = False
    session_id: int


def build_success_response(data: Any, message: str = "操作成功") -> dict[str, Any]:
    """
    构造统一成功响应。
    """
    return {
        "success": True,
        "code": 200,
        "message": message,
        "data": data,
    }


def build_error_response(code: int, message: str, data: Any = None) -> dict[str, Any]:
    """
    构造统一错误响应。
    """
    return {
        "success": False,
        "code": code,
        "message": message,
        "data": data,
    }


def require_owned_session(session_id: int, user_id: int, db: Any) -> dict[str, Any]:
    """
    校验会话是否归当前用户所有。

    返回：
    - 当前会话记录。

    异常：
    - 当会话不存在或不属于当前用户时抛出 404。
    """
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, user_id, title, status
            FROM chat_session
            WHERE id = %s AND user_id = %s AND status = 1
            """,
            (session_id, user_id),
        )
        session = cursor.fetchone()
    finally:
        cursor.close()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="会话不存在或无权访问",
        )
    return session


def require_owned_message(message_id: int, user_id: int, db: Any) -> dict[str, Any]:
    """
    校验消息是否归当前用户所有。

    返回：
    - 消息以及所属会话的必要信息。

    异常：
    - 当消息不存在或不属于当前用户时抛出 404。
    """
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT cm.id, cm.session_id, cm.role
            FROM chat_message cm
            INNER JOIN chat_session cs ON cs.id = cm.session_id
            WHERE cm.id = %s AND cs.user_id = %s AND cs.status = 1
            """,
            (message_id, user_id),
        )
        message = cursor.fetchone()
    finally:
        cursor.close()

    if not message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="消息不存在或无权访问",
        )
    return message


async def generate_mock_response(content: str, is_deepthink: bool) -> AsyncGenerator[str, None]:
    """
    当模型调用失败时输出开发用兜底内容。
    """
    if is_deepthink:
        reasoning_steps = [
            "正在分析用户问题。",
            "检测到模型服务当前不可用，切换到兜底模式。",
            "准备返回本地演示内容。",
        ]
        for step in reasoning_steps:
            yield f"data: {json.dumps({'reasoning': step + chr(10)}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.2)

    response_text = (
        "当前模型服务暂不可用，已切换为本地兜底回复。\n\n"
        f"你刚才发送的问题是：{content}\n"
        "请在配置正确的模型密钥后再进行真实对话。"
    )
    for char in response_text:
        yield f"data: {json.dumps({'content': char}, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0.01)


async def generate_response(
    content: str,
    is_deepthink: bool,
    session_id: int,
    is_search: bool,
) -> AsyncGenerator[str, None]:
    """
    调用大模型并以 SSE 形式流式输出内容。

    说明：
    - 当前仅保留 is_search 参数以兼容前端设置。
    - 实际联网搜索能力尚未接入模型工具链，后续可在这里扩展。
    """
    model = "deepseek-reasoner" if is_deepthink else "deepseek-chat"
    messages: list[dict[str, str]] = []

    # 读取最近的历史消息，为模型提供上下文。
    db = connection_pool.get_connection()
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT role, content
            FROM chat_message
            WHERE session_id = %s
            ORDER BY id DESC
            LIMIT 30
            """,
            (session_id,),
        )
        history = cursor.fetchall()
    finally:
        cursor.close()
        db.close()

    history.reverse()
    for item in history:
        raw_content = str(item["content"])
        if item["role"] == "assistant" and "<reasoning>" in raw_content:
            parts = raw_content.split("</reasoning>\n", maxsplit=1)
            raw_content = parts[1] if len(parts) == 2 else raw_content.replace("<reasoning>", "").replace("</reasoning>", "")
        messages.append({"role": str(item["role"]), "content": raw_content})

    messages.append({"role": "user", "content": content})

    # 当前暂未接入搜索能力，仅保留参数避免前后端协议断裂。
    _ = is_search

    full_content = ""
    full_reasoning = ""
    start_time = asyncio.get_running_loop().time()
    reasoning_end_time: Optional[float] = None

    try:
        if client is None:
            raise RuntimeError("未配置 DEEPSEEK_API_KEY")

        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )

        async for chunk in response:
            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta
            reasoning_content = getattr(delta, "reasoning_content", None)
            content_delta = getattr(delta, "content", None)

            if reasoning_content:
                full_reasoning += reasoning_content
                yield f"data: {json.dumps({'reasoning': reasoning_content}, ensure_ascii=False)}\n\n"

            if content_delta:
                if full_reasoning and reasoning_end_time is None:
                    reasoning_end_time = asyncio.get_running_loop().time()
                    thinking_time = int(reasoning_end_time - start_time)
                    yield f"data: {json.dumps({'thinking_time': thinking_time}, ensure_ascii=False)}\n\n"

                full_content += content_delta
                yield f"data: {json.dumps({'content': content_delta}, ensure_ascii=False)}\n\n"
    except Exception:
        async for chunk in generate_mock_response(content, is_deepthink):
            if '"reasoning"' in chunk or '"content"' in chunk:
                payload = json.loads(chunk.replace("data: ", "").strip())
                if "reasoning" in payload:
                    full_reasoning += str(payload["reasoning"])
                if "content" in payload:
                    if full_reasoning and reasoning_end_time is None:
                        reasoning_end_time = asyncio.get_running_loop().time()
                        thinking_time = int(reasoning_end_time - start_time)
                        yield f"data: {json.dumps({'thinking_time': thinking_time}, ensure_ascii=False)}\n\n"
                    full_content += str(payload["content"])
            yield chunk

    final_thinking_time = 0
    if full_reasoning:
        if reasoning_end_time is None:
            reasoning_end_time = asyncio.get_running_loop().time()
        final_thinking_time = int(reasoning_end_time - start_time)

    db = connection_pool.get_connection()
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO chat_message (session_id, role, content) VALUES (%s, %s, %s)",
            (session_id, "user", content),
        )

        assistant_content = full_content
        if full_reasoning:
            assistant_content = f"<reasoning>\n{full_reasoning}\n</reasoning>\n{full_content}"

        cursor.execute(
            """
            INSERT INTO chat_message (session_id, role, content, thinking_time)
            VALUES (%s, %s, %s, %s)
            """,
            (session_id, "assistant", assistant_content, final_thinking_time),
        )
        cursor.execute(
            "UPDATE chat_session SET update_time = NOW() WHERE id = %s",
            (session_id,),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()
        db.close()

    yield "data: [DONE]\n\n"


@router.post("/send")
async def send_message(
    payload: SendMessageRequest,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> StreamingResponse:
    """
    发送消息并返回流式响应。

    安全约束：
    - 必须登录。
    - session_id 必须属于当前用户。
    - 改为 POST，避免将用户输入暴露到 URL 查询串。
    """
    require_owned_session(payload.session_id, user_id, db)
    return StreamingResponse(
        generate_response(
            content=payload.content,
            is_deepthink=payload.is_deepthink,
            session_id=payload.session_id,
            is_search=payload.is_search,
        ),
        media_type="text/event-stream",
    )


@router.get("/sessions")
async def get_sessions(
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    """
    获取当前用户的会话列表。
    """
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT *
            FROM chat_session
            WHERE user_id = %s AND status = 1
            ORDER BY is_pinned DESC, update_time DESC
            """,
            (user_id,),
        )
        sessions = cursor.fetchall()
        return build_success_response({"sessions": sessions}, "获取成功")
    except Exception as exc:
        return build_error_response(500, f"获取失败：{exc}")
    finally:
        cursor.close()


@router.post("/sessions")
async def create_session(
    title: str = "新对话",
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    """
    为当前用户创建会话。
    """
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO chat_session (user_id, title) VALUES (%s, %s)",
            (user_id, title),
        )
        db.commit()
        return build_success_response({"session_id": int(cursor.lastrowid)}, "创建成功")
    except Exception as exc:
        db.rollback()
        return build_error_response(500, f"创建失败：{exc}")
    finally:
        cursor.close()


@router.put("/sessions/{session_id}")
async def rename_session(
    session_id: int,
    update: SessionUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    """
    重命名当前用户的会话。
    """
    require_owned_session(session_id, user_id, db)

    cursor = db.cursor()
    try:
        cursor.execute(
            "UPDATE chat_session SET title = %s, update_time = NOW() WHERE id = %s AND user_id = %s",
            (update.title, session_id, user_id),
        )
        db.commit()
        return build_success_response(None, "重命名成功")
    except Exception as exc:
        db.rollback()
        return build_error_response(500, f"重命名失败：{exc}")
    finally:
        cursor.close()


@router.put("/sessions/{session_id}/pin")
async def toggle_pin_session(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    """
    切换当前用户会话的置顶状态。
    """
    cursor = db.cursor()
    try:
        cursor.execute(
            "SELECT is_pinned FROM chat_session WHERE id = %s AND user_id = %s AND status = 1",
            (session_id, user_id),
        )
        row = cursor.fetchone()
        if not row:
            return build_error_response(404, "会话不存在或无权访问")

        new_status = 0 if int(row[0]) == 1 else 1
        cursor.execute(
            "UPDATE chat_session SET is_pinned = %s WHERE id = %s AND user_id = %s",
            (new_status, session_id, user_id),
        )
        db.commit()
        return build_success_response({"is_pinned": new_status}, "操作成功")
    except Exception as exc:
        db.rollback()
        return build_error_response(500, f"操作失败：{exc}")
    finally:
        cursor.close()


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    """
    删除当前用户的会话及其消息。
    """
    require_owned_session(session_id, user_id, db)

    cursor = db.cursor()
    try:
        cursor.execute(
            "DELETE FROM chat_message WHERE session_id = %s",
            (session_id,),
        )
        cursor.execute(
            "DELETE FROM chat_session WHERE id = %s AND user_id = %s",
            (session_id, user_id),
        )
        db.commit()
        return build_success_response(None, "删除成功")
    except Exception as exc:
        db.rollback()
        return build_error_response(500, f"删除失败：{exc}")
    finally:
        cursor.close()


@router.get("/sessions/{session_id}/messages")
async def get_messages(
    session_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    """
    获取当前用户某个会话下的消息列表。
    """
    require_owned_session(session_id, user_id, db)

    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM chat_message WHERE session_id = %s ORDER BY id ASC",
            (session_id,),
        )
        messages = cursor.fetchall()

        for message in messages:
            if message["role"] == "assistant" and "<reasoning>" in str(message["content"]):
                parts = str(message["content"]).split("</reasoning>\n", maxsplit=1)
                if len(parts) == 2:
                    message["reasoning"] = parts[0].replace("<reasoning>\n", "")
                    message["content"] = parts[1]
                else:
                    message["reasoning"] = str(message["content"]).replace("<reasoning>\n", "").replace("</reasoning>", "")
                    message["content"] = ""

            if "thinking_time" not in message or message["thinking_time"] is None:
                message["thinking_time"] = 0

        return build_success_response({"messages": messages}, "获取成功")
    except Exception as exc:
        return build_error_response(500, f"获取失败：{exc}")
    finally:
        cursor.close()


@router.put("/messages/{message_id}")
async def update_message(
    message_id: int,
    update: MessageUpdate,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    """
    编辑当前用户自己的消息内容。

    约束：
    - 当前只允许编辑用户消息，不允许直接改写模型回复。
    """
    message = require_owned_message(message_id, user_id, db)
    if str(message["role"]) != "user":
        return build_error_response(400, "当前仅支持编辑用户消息")

    cursor = db.cursor()
    try:
        cursor.execute(
            "UPDATE chat_message SET content = %s WHERE id = %s",
            (update.content, message_id),
        )
        cursor.execute(
            "UPDATE chat_session SET update_time = NOW() WHERE id = %s",
            (int(message["session_id"]),),
        )
        db.commit()
        return build_success_response(None, "更新成功")
    except Exception as exc:
        db.rollback()
        return build_error_response(500, f"更新失败：{exc}")
    finally:
        cursor.close()


@router.delete("/sessions/{session_id}/messages")
async def delete_messages(
    session_id: int,
    after_id: Optional[int] = None,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    """
    删除当前用户某个会话内的消息。

    参数：
    - after_id: 若提供，则仅删除该消息之后的内容。
    """
    require_owned_session(session_id, user_id, db)

    cursor = db.cursor()
    try:
        if after_id is None:
            cursor.execute(
                "DELETE FROM chat_message WHERE session_id = %s",
                (session_id,),
            )
        else:
            cursor.execute(
                "DELETE FROM chat_message WHERE session_id = %s AND id > %s",
                (session_id, after_id),
            )
        deleted_count = cursor.rowcount

        cursor.execute(
            "UPDATE chat_session SET update_time = NOW() WHERE id = %s AND user_id = %s",
            (session_id, user_id),
        )
        db.commit()
        return build_success_response({"deleted_count": deleted_count}, "删除成功")
    except Exception as exc:
        db.rollback()
        return build_error_response(500, f"删除失败：{exc}")
    finally:
        cursor.close()
