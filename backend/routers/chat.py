"""
聊天相关接口。
"""

import asyncio
import json
import os
import uuid
from typing import Any, AsyncGenerator, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from auth_utils import get_current_user_id
from db import connection_pool, get_db
from services.search_service import SearchCitation, prepare_search_context

load_dotenv()

router = APIRouter(prefix="/api/chat", tags=["chat"])

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

ASSISTANT_METADATA_START = "<metadata>\n"
ASSISTANT_METADATA_END = "\n</metadata>\n"
ASSISTANT_REASONING_START = "<reasoning>\n"
ASSISTANT_REASONING_END = "\n</reasoning>\n"

MESSAGE_STATUS_STREAMING = "streaming"
MESSAGE_STATUS_STOPPED = "stopped"
MESSAGE_STATUS_COMPLETED = "completed"
MESSAGE_STATUS_FAILED = "failed"

CONTINUE_GENERATION_PROMPT = (
    "你需要基于上一条 assistant 未完成回答继续输出。\n"
    "1. 从已有内容的末尾自然续写。\n"
    "2. 不要重复已经输出过的句子。\n"
    "3. 不要重新从头回答。\n"
    "4. 保持与已有语气、结构和语言一致。"
)

client = (
    AsyncOpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    if DEEPSEEK_API_KEY
    else None
)


class SessionUpdate(BaseModel):
    """会话标题更新请求体。"""

    title: str = Field(..., min_length=1, max_length=100)


class MessageUpdate(BaseModel):
    """消息编辑请求体。"""

    content: str = Field(..., min_length=1)


class SendMessageRequest(BaseModel):
    """发送消息请求体。"""

    content: str = ""
    is_deepthink: bool = False
    is_search: bool = False
    session_id: int
    continue_from_message_id: Optional[int] = None


def build_success_response(data: Any, message: str = "操作成功") -> dict[str, Any]:
    return {"success": True, "code": 200, "message": message, "data": data}


def build_error_response(code: int, message: str, data: Any = None) -> dict[str, Any]:
    return {"success": False, "code": code, "message": message, "data": data}


def initialize_chat_schema() -> None:
    db = connection_pool.get_connection()
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_message (
                id BIGINT PRIMARY KEY AUTO_INCREMENT,
                session_id BIGINT NOT NULL,
                role VARCHAR(10) NOT NULL,
                content TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'completed',
                generation_id VARCHAR(64) NOT NULL DEFAULT '',
                continue_from_message_id BIGINT NULL,
                thinking_time INT DEFAULT 0,
                file_ids VARCHAR(255) DEFAULT '',
                create_time DATETIME DEFAULT NOW(),
                FOREIGN KEY (session_id) REFERENCES chat_session(id)
            )
            """
        )
        cursor.execute("SHOW COLUMNS FROM chat_message LIKE 'status'")
        if not cursor.fetchone():
            cursor.execute(
                """
                ALTER TABLE chat_message
                ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'completed'
                AFTER content
                """
            )
        cursor.execute("SHOW COLUMNS FROM chat_message LIKE 'generation_id'")
        if not cursor.fetchone():
            cursor.execute(
                """
                ALTER TABLE chat_message
                ADD COLUMN generation_id VARCHAR(64) NOT NULL DEFAULT ''
                AFTER status
                """
            )
        cursor.execute("SHOW COLUMNS FROM chat_message LIKE 'continue_from_message_id'")
        if not cursor.fetchone():
            cursor.execute(
                """
                ALTER TABLE chat_message
                ADD COLUMN continue_from_message_id BIGINT NULL
                AFTER generation_id
                """
            )
        cursor.execute("SHOW COLUMNS FROM chat_message LIKE 'thinking_time'")
        if not cursor.fetchone():
            cursor.execute(
                """
                ALTER TABLE chat_message
                ADD COLUMN thinking_time INT DEFAULT 0
                AFTER continue_from_message_id
                """
            )
        cursor.execute(
            """
            UPDATE chat_message
            SET status = %s
            WHERE status IS NULL OR status = ''
            """,
            (MESSAGE_STATUS_COMPLETED,),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()
        db.close()


def build_assistant_metadata(
    citations: list[SearchCitation],
    search_status: Optional[str],
) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    if citations:
        metadata["citations"] = [citation.to_dict() for citation in citations]
    if search_status:
        metadata["search_status"] = search_status
    return metadata


def encode_assistant_content(
    content: str,
    reasoning: str = "",
    metadata: Optional[dict[str, Any]] = None,
) -> str:
    parts: list[str] = []
    if metadata:
        parts.append(
            f"{ASSISTANT_METADATA_START}"
            f"{json.dumps(metadata, ensure_ascii=False)}"
            f"{ASSISTANT_METADATA_END}"
        )
    if reasoning:
        parts.append(f"{ASSISTANT_REASONING_START}{reasoning}{ASSISTANT_REASONING_END}")
    parts.append(content)
    return "".join(parts)


def decode_assistant_content(raw_content: str) -> dict[str, Any]:
    remaining_content = raw_content
    metadata: dict[str, Any] = {}
    reasoning = ""

    if remaining_content.startswith(ASSISTANT_METADATA_START):
        metadata_end_index = remaining_content.find(ASSISTANT_METADATA_END)
        if metadata_end_index != -1:
            metadata_raw = remaining_content[
                len(ASSISTANT_METADATA_START):metadata_end_index
            ]
            try:
                parsed_metadata = json.loads(metadata_raw)
                if isinstance(parsed_metadata, dict):
                    metadata = parsed_metadata
            except json.JSONDecodeError:
                metadata = {}
            remaining_content = remaining_content[
                metadata_end_index + len(ASSISTANT_METADATA_END):
            ]

    if remaining_content.startswith(ASSISTANT_REASONING_START):
        reasoning_end_index = remaining_content.find(ASSISTANT_REASONING_END)
        if reasoning_end_index != -1:
            reasoning = remaining_content[
                len(ASSISTANT_REASONING_START):reasoning_end_index
            ]
            remaining_content = remaining_content[
                reasoning_end_index + len(ASSISTANT_REASONING_END):
            ]

    citations = metadata.get("citations", [])
    search_status = metadata.get("search_status")
    return {
        "content": remaining_content,
        "reasoning": reasoning,
        "citations": citations if isinstance(citations, list) else [],
        "search_status": search_status if isinstance(search_status, str) else None,
    }


def parse_citations(raw_citations: list[dict[str, Any]]) -> list[SearchCitation]:
    citations: list[SearchCitation] = []
    for item in raw_citations:
        if not isinstance(item, dict):
            continue
        citation_id = item.get("id")
        title = item.get("title")
        url = item.get("url")
        domain = item.get("domain")
        snippet = item.get("snippet")
        if not isinstance(citation_id, int):
            continue
        if not all(isinstance(value, str) for value in [title, url, domain, snippet]):
            continue
        citations.append(
            SearchCitation(
                id=citation_id,
                title=title,
                url=url,
                domain=domain,
                snippet=snippet,
            )
        )
    return citations


def build_search_system_prompt(search_context: str) -> str:
    return (
        "你是一个联网搜索助手。"
        "回答时必须优先参考已提供的联网搜索结果。"
        "如果搜索结果不足以支撑结论，必须明确说明。"
        "当引用搜索结果时，请在对应结论后使用 [来源1] 这样的编号。"
        "不要编造搜索结果中不存在的信息。\n\n"
        f"联网搜索结果如下：\n{search_context}"
    )


def build_stored_search_context(citations: list[SearchCitation]) -> str:
    blocks: list[str] = []
    for citation in citations:
        blocks.append(
            "\n".join(
                [
                    f"[来源{citation.id}]",
                    f"标题：{citation.title}",
                    f"链接：{citation.url}",
                    f"站点：{citation.domain}",
                    f"摘要：{citation.snippet}",
                ]
            )
        )
    return "\n\n".join(blocks)


def require_owned_session(session_id: int, user_id: int, db: Any) -> dict[str, Any]:
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
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT
                cm.id,
                cm.session_id,
                cm.role,
                cm.content,
                cm.status,
                cm.generation_id,
                cm.continue_from_message_id,
                cm.thinking_time
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


def normalize_message_status(raw_status: Any) -> str:
    if isinstance(raw_status, str) and raw_status in {
        MESSAGE_STATUS_STREAMING,
        MESSAGE_STATUS_STOPPED,
        MESSAGE_STATUS_COMPLETED,
        MESSAGE_STATUS_FAILED,
    }:
        return raw_status
    return MESSAGE_STATUS_COMPLETED


def persist_assistant_message(
    db: Any,
    message_id: int,
    content: str,
    reasoning: str,
    citations: list[SearchCitation],
    search_status: Optional[str],
    thinking_time: int,
    message_status: str,
    touch_session: bool = False,
) -> None:
    cursor = db.cursor()
    try:
        assistant_content = encode_assistant_content(
            content=content,
            reasoning=reasoning,
            metadata=build_assistant_metadata(citations, search_status),
        )
        cursor.execute(
            """
            UPDATE chat_message
            SET content = %s, status = %s, thinking_time = %s
            WHERE id = %s
            """,
            (assistant_content, message_status, thinking_time, message_id),
        )
        if touch_session:
            cursor.execute(
                "UPDATE chat_session SET update_time = NOW() WHERE id = (SELECT session_id FROM chat_message WHERE id = %s)",
                (message_id,),
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()


def build_model_history(
    session_id: int,
    db: Any,
    before_message_id: Optional[int] = None,
) -> list[dict[str, str]]:
    cursor = db.cursor(dictionary=True)
    try:
        if before_message_id is None:
            cursor.execute(
                """
                SELECT id, role, content, status
                FROM chat_message
                WHERE session_id = %s AND status != %s
                ORDER BY id DESC
                LIMIT 30
                """,
                (session_id, MESSAGE_STATUS_FAILED),
            )
        else:
            cursor.execute(
                """
                SELECT id, role, content, status
                FROM chat_message
                WHERE session_id = %s AND id < %s AND status != %s
                ORDER BY id DESC
                LIMIT 30
                """,
                (session_id, before_message_id, MESSAGE_STATUS_FAILED),
            )
        history = cursor.fetchall()
    finally:
        cursor.close()

    history.reverse()
    messages: list[dict[str, str]] = []
    for item in history:
        role = str(item["role"])
        raw_content = str(item["content"] or "")
        normalized_status = normalize_message_status(item.get("status"))
        if role == "assistant":
            parsed_content = decode_assistant_content(raw_content)
            assistant_text = str(parsed_content["content"])
            if not assistant_text and normalized_status != MESSAGE_STATUS_COMPLETED:
                continue
            raw_content = assistant_text
        if not raw_content.strip():
            continue
        messages.append({"role": role, "content": raw_content})
    return messages


def create_streaming_records(
    session_id: int,
    content: str,
    db: Any,
) -> tuple[int, int, str]:
    generation_id = uuid.uuid4().hex
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO chat_message (session_id, role, content, status) VALUES (%s, %s, %s, %s)",
            (session_id, "user", content, MESSAGE_STATUS_COMPLETED),
        )
        user_message_id = int(cursor.lastrowid)
        cursor.execute(
            """
            INSERT INTO chat_message (
                session_id,
                role,
                content,
                status,
                generation_id
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                session_id,
                "assistant",
                "",
                MESSAGE_STATUS_STREAMING,
                generation_id,
            ),
        )
        assistant_message_id = int(cursor.lastrowid)
        cursor.execute(
            "UPDATE chat_session SET update_time = NOW() WHERE id = %s",
            (session_id,),
        )
        db.commit()
        return user_message_id, assistant_message_id, generation_id
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()


def mark_message_as_stopped(message_id: int, db: Any) -> None:
    cursor = db.cursor()
    try:
        cursor.execute(
            """
            UPDATE chat_message
            SET status = %s
            WHERE id = %s AND role = 'assistant'
            """,
            (MESSAGE_STATUS_STOPPED, message_id),
        )
        cursor.execute(
            "UPDATE chat_session SET update_time = NOW() WHERE id = (SELECT session_id FROM chat_message WHERE id = %s)",
            (message_id,),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()


def is_message_generation_active(
    db: Any,
    message_id: int,
    generation_id: str,
) -> bool:
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT status, generation_id
            FROM chat_message
            WHERE id = %s
            """,
            (message_id,),
        )
        message = cursor.fetchone()
    finally:
        cursor.close()

    if not message:
        return False

    return (
        normalize_message_status(message.get("status")) == MESSAGE_STATUS_STREAMING
        and str(message.get("generation_id") or "") == generation_id
    )


def prepare_continue_generation(
    payload: SendMessageRequest,
    user_id: int,
    db: Any,
) -> dict[str, Any]:
    if payload.continue_from_message_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="缺少继续生成目标消息",
        )

    target_message = require_owned_message(payload.continue_from_message_id, user_id, db)
    if str(target_message["role"]) != "assistant":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="继续生成仅支持助手消息",
        )
    if int(target_message["session_id"]) != payload.session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="继续生成目标消息与当前会话不匹配",
        )

    message_status = normalize_message_status(target_message.get("status"))
    if message_status not in {
        MESSAGE_STATUS_STOPPED,
        MESSAGE_STATUS_FAILED,
        MESSAGE_STATUS_STREAMING,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前消息状态不支持继续生成",
        )

    parsed_content = decode_assistant_content(str(target_message.get("content") or ""))
    existing_content = str(parsed_content["content"])
    existing_reasoning = str(parsed_content["reasoning"])
    existing_citations = parse_citations(parsed_content["citations"])
    existing_search_status = parsed_content["search_status"]
    existing_thinking_time = int(target_message.get("thinking_time") or 0)

    if existing_reasoning.strip() or existing_thinking_time > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="深度思考消息不支持继续生成",
        )

    history_messages = build_model_history(
        session_id=payload.session_id,
        db=db,
        before_message_id=int(target_message["id"]),
    )
    if existing_citations:
        search_context = build_stored_search_context(existing_citations)
        if search_context:
            history_messages.insert(
                0,
                {
                    "role": "system",
                    "content": build_search_system_prompt(search_context),
                },
            )
    if existing_content:
        history_messages.append({"role": "assistant", "content": existing_content})
    history_messages.append({"role": "user", "content": CONTINUE_GENERATION_PROMPT})

    return {
        "assistant_message_id": int(target_message["id"]),
        "generation_id": uuid.uuid4().hex,
        "messages": history_messages,
        "existing_content": existing_content,
        "existing_reasoning": existing_reasoning,
        "citations": existing_citations,
        "search_status": existing_search_status,
        "thinking_time": existing_thinking_time,
    }


async def generate_mock_response(
    content: str,
    is_deepthink: bool,
    allow_reasoning: bool = True,
) -> AsyncGenerator[str, None]:
    if is_deepthink and allow_reasoning:
        reasoning_steps = [
            "正在分析用户问题。\n",
            "检测到模型服务当前不可用，切换到兜底模式。\n",
            "准备返回本地演示内容。\n",
        ]
        for step in reasoning_steps:
            yield f"data: {json.dumps({'reasoning': step}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.2)

    response_text = (
        "当前模型服务暂不可用，已切换为本地兜底回复。\n\n"
        f"你刚才发送的问题是：{content or '继续生成上一条回答'}\n"
        "请在配置正确的模型密钥后再进行真实对话。"
    )
    for char in response_text:
        yield f"data: {json.dumps({'content': char}, ensure_ascii=False)}\n\n"
        await asyncio.sleep(0.01)


async def generate_response(
    payload: SendMessageRequest,
    user_id: int,
) -> AsyncGenerator[str, None]:
    db = connection_pool.get_connection()

    try:
        continue_as_content_only = False
        if payload.continue_from_message_id is not None:
            continue_context = prepare_continue_generation(payload, user_id, db)
            assistant_message_id = int(continue_context["assistant_message_id"])
            generation_id = str(continue_context["generation_id"])
            messages = list(continue_context["messages"])
            full_content = str(continue_context["existing_content"])
            full_reasoning = str(continue_context["existing_reasoning"])
            citations = list(continue_context["citations"])
            search_status = continue_context["search_status"]
            final_thinking_time = int(continue_context["thinking_time"])
            continue_as_content_only = bool(full_content.strip())

            cursor = db.cursor()
            try:
                cursor.execute(
                    """
                    UPDATE chat_message
                    SET status = %s, generation_id = %s
                    WHERE id = %s
                    """,
                    (
                        MESSAGE_STATUS_STREAMING,
                        generation_id,
                        assistant_message_id,
                    ),
                )
                cursor.execute(
                    "UPDATE chat_session SET update_time = NOW() WHERE id = %s",
                    (payload.session_id,),
                )
                db.commit()
            except Exception:
                db.rollback()
                raise
            finally:
                cursor.close()
        else:
            next_content = payload.content.strip()
            if not next_content:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="消息内容不能为空",
                )
            messages = build_model_history(payload.session_id, db)
            messages.append({"role": "user", "content": next_content})
            _, assistant_message_id, generation_id = create_streaming_records(
                session_id=payload.session_id,
                content=next_content,
                db=db,
            )
            full_content = ""
            full_reasoning = ""
            citations: list[SearchCitation] = []
            search_status: Optional[str] = None
            final_thinking_time = 0

        allow_reasoning = payload.is_deepthink and not continue_as_content_only
        model = "deepseek-reasoner" if allow_reasoning else "deepseek-chat"

        yield (
            f"data: {json.dumps({'message_id': assistant_message_id, 'message_status': MESSAGE_STATUS_STREAMING}, ensure_ascii=False)}\n\n"
        )

        start_time = asyncio.get_running_loop().time()
        reasoning_end_time: Optional[float] = None

        if payload.continue_from_message_id is None and payload.is_search:
            search_query = payload.content.strip()
            citations, search_context, search_status = await prepare_search_context(search_query)
            if search_context:
                if not is_message_generation_active(db, assistant_message_id, generation_id):
                    return
                messages.insert(
                    0,
                    {"role": "system", "content": build_search_system_prompt(search_context)},
                )
                persist_assistant_message(
                    db=db,
                    message_id=assistant_message_id,
                    content=full_content,
                    reasoning=full_reasoning,
                    citations=citations,
                    search_status=search_status,
                    thinking_time=final_thinking_time,
                    message_status=MESSAGE_STATUS_STREAMING,
                )
                yield (
                    f"data: {json.dumps({'citations': [citation.to_dict() for citation in citations], 'search_status': search_status}, ensure_ascii=False)}\n\n"
                )
            elif search_status:
                if not is_message_generation_active(db, assistant_message_id, generation_id):
                    return
                persist_assistant_message(
                    db=db,
                    message_id=assistant_message_id,
                    content=full_content,
                    reasoning=full_reasoning,
                    citations=citations,
                    search_status=search_status,
                    thinking_time=final_thinking_time,
                    message_status=MESSAGE_STATUS_STREAMING,
                )
                yield (
                    f"data: {json.dumps({'search_status': search_status}, ensure_ascii=False)}\n\n"
                )

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
                    reasoning_text = str(reasoning_content)
                    if not is_message_generation_active(db, assistant_message_id, generation_id):
                        return
                    if allow_reasoning:
                        full_reasoning += reasoning_text
                        persist_assistant_message(
                            db=db,
                            message_id=assistant_message_id,
                            content=full_content,
                            reasoning=full_reasoning,
                            citations=citations,
                            search_status=search_status,
                            thinking_time=final_thinking_time,
                            message_status=MESSAGE_STATUS_STREAMING,
                        )
                        yield (
                            f"data: {json.dumps({'reasoning': reasoning_text}, ensure_ascii=False)}\n\n"
                        )
                    else:
                        full_content += reasoning_text
                        persist_assistant_message(
                            db=db,
                            message_id=assistant_message_id,
                            content=full_content,
                            reasoning=full_reasoning,
                            citations=citations,
                            search_status=search_status,
                            thinking_time=final_thinking_time,
                            message_status=MESSAGE_STATUS_STREAMING,
                        )
                        yield (
                            f"data: {json.dumps({'content': reasoning_text}, ensure_ascii=False)}\n\n"
                        )

                if content_delta:
                    if not is_message_generation_active(db, assistant_message_id, generation_id):
                        return
                    if full_reasoning and reasoning_end_time is None:
                        reasoning_end_time = asyncio.get_running_loop().time()
                        final_thinking_time = int(reasoning_end_time - start_time)
                        yield (
                            f"data: {json.dumps({'thinking_time': final_thinking_time}, ensure_ascii=False)}\n\n"
                        )

                    full_content += str(content_delta)
                    persist_assistant_message(
                        db=db,
                        message_id=assistant_message_id,
                        content=full_content,
                        reasoning=full_reasoning,
                        citations=citations,
                        search_status=search_status,
                        thinking_time=final_thinking_time,
                        message_status=MESSAGE_STATUS_STREAMING,
                    )
                    yield (
                        f"data: {json.dumps({'content': content_delta}, ensure_ascii=False)}\n\n"
                    )
        except asyncio.CancelledError:
            if is_message_generation_active(db, assistant_message_id, generation_id):
                persist_assistant_message(
                    db=db,
                    message_id=assistant_message_id,
                    content=full_content,
                    reasoning=full_reasoning,
                    citations=citations,
                    search_status=search_status,
                    thinking_time=final_thinking_time,
                    message_status=MESSAGE_STATUS_STOPPED,
                    touch_session=True,
                )
            return
        except Exception:
            async for chunk in generate_mock_response(
                payload.content.strip(),
                payload.is_deepthink,
                allow_reasoning=allow_reasoning,
            ):
                if not is_message_generation_active(db, assistant_message_id, generation_id):
                    return
                if '"reasoning"' in chunk or '"content"' in chunk:
                    payload_data = json.loads(chunk.replace("data: ", "").strip())
                    if "reasoning" in payload_data:
                        full_reasoning += str(payload_data["reasoning"])
                        persist_assistant_message(
                            db=db,
                            message_id=assistant_message_id,
                            content=full_content,
                            reasoning=full_reasoning,
                            citations=citations,
                            search_status=search_status,
                            thinking_time=final_thinking_time,
                            message_status=MESSAGE_STATUS_STREAMING,
                        )
                    if "content" in payload_data:
                        if full_reasoning and reasoning_end_time is None:
                            reasoning_end_time = asyncio.get_running_loop().time()
                            final_thinking_time = int(reasoning_end_time - start_time)
                            yield (
                                f"data: {json.dumps({'thinking_time': final_thinking_time}, ensure_ascii=False)}\n\n"
                            )
                        full_content += str(payload_data["content"])
                        persist_assistant_message(
                            db=db,
                            message_id=assistant_message_id,
                            content=full_content,
                            reasoning=full_reasoning,
                            citations=citations,
                            search_status=search_status,
                            thinking_time=final_thinking_time,
                            message_status=MESSAGE_STATUS_STREAMING,
                        )
                yield chunk

        if full_reasoning and reasoning_end_time is None:
            reasoning_end_time = asyncio.get_running_loop().time()
            final_thinking_time = int(reasoning_end_time - start_time)

        if not is_message_generation_active(db, assistant_message_id, generation_id):
            return

        persist_assistant_message(
            db=db,
            message_id=assistant_message_id,
            content=full_content,
            reasoning=full_reasoning,
            citations=citations,
            search_status=search_status,
            thinking_time=final_thinking_time,
            message_status=MESSAGE_STATUS_COMPLETED,
            touch_session=True,
        )
        yield (
            f"data: {json.dumps({'message_id': assistant_message_id, 'message_status': MESSAGE_STATUS_COMPLETED}, ensure_ascii=False)}\n\n"
        )
        yield "data: [DONE]\n\n"
    finally:
        db.close()


@router.post("/send")
async def send_message(
    payload: SendMessageRequest,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> StreamingResponse:
    require_owned_session(payload.session_id, user_id, db)
    if payload.continue_from_message_id is None and not payload.content.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="消息内容不能为空",
        )

    return StreamingResponse(
        generate_response(payload=payload, user_id=user_id),
        media_type="text/event-stream",
    )


@router.post("/messages/{message_id}/stop")
async def stop_message_generation(
    message_id: int,
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    message = require_owned_message(message_id, user_id, db)
    if str(message["role"]) != "assistant":
        return build_error_response(400, "仅支持停止助手消息生成")

    current_status = normalize_message_status(message.get("status"))
    if current_status == MESSAGE_STATUS_COMPLETED:
        return build_success_response(None, "消息已生成完成")
    if current_status == MESSAGE_STATUS_STOPPED:
        return build_success_response(None, "消息已停止生成")

    mark_message_as_stopped(message_id, db)
    return build_success_response(None, "已停止生成")


@router.get("/sessions")
async def get_sessions(
    user_id: int = Depends(get_current_user_id),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
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
    require_owned_session(session_id, user_id, db)
    cursor = db.cursor()
    try:
        cursor.execute("DELETE FROM chat_message WHERE session_id = %s", (session_id,))
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
    require_owned_session(session_id, user_id, db)
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            UPDATE chat_message
            SET status = %s
            WHERE session_id = %s AND role = 'assistant' AND status = %s
            """,
            (MESSAGE_STATUS_STOPPED, session_id, MESSAGE_STATUS_STREAMING),
        )
        db.commit()
        cursor.execute(
            "SELECT * FROM chat_message WHERE session_id = %s ORDER BY id ASC",
            (session_id,),
        )
        messages = cursor.fetchall()

        for message in messages:
            message["status"] = normalize_message_status(message.get("status"))
            if message["role"] == "assistant":
                parsed_content = decode_assistant_content(str(message["content"]))
                message["reasoning"] = parsed_content["reasoning"]
                message["citations"] = parsed_content["citations"]
                message["search_status"] = parsed_content["search_status"]
                message["content"] = parsed_content["content"]
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
    require_owned_session(session_id, user_id, db)
    cursor = db.cursor()
    try:
        if after_id is None:
            cursor.execute("DELETE FROM chat_message WHERE session_id = %s", (session_id,))
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
