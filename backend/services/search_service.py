"""
联网搜索服务。
说明：
- 当前仅提供 Tavily 搜索后端。
- 若未配置搜索服务，则返回空结果并由上层优雅降级。
"""

import asyncio
import os
import re
from dataclasses import dataclass
from html import unescape
from typing import Any
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

load_dotenv()


SEARCH_PROVIDER = os.getenv("SEARCH_PROVIDER", "").strip().lower()
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "").strip()
SEARCH_TIMEOUT_SECONDS = int(os.getenv("SEARCH_TIMEOUT_SECONDS", "10"))
SEARCH_MAX_RESULTS = max(1, min(int(os.getenv("SEARCH_MAX_RESULTS", "5")), 8))
SEARCH_FETCH_PAGE_CONTENT = os.getenv("SEARCH_FETCH_PAGE_CONTENT", "false").strip().lower() == "true"
SEARCH_PAGE_TIMEOUT_SECONDS = int(os.getenv("SEARCH_PAGE_TIMEOUT_SECONDS", "6"))
MAX_SNIPPET_LENGTH = 900


@dataclass
class SearchCitation:
    """
    搜索引用信息。
    """

    id: int
    title: str
    url: str
    domain: str
    snippet: str

    def to_dict(self) -> dict[str, Any]:
        """
        将引用对象转换为可序列化字典。
        """
        return {
            "id": self.id,
            "title": self.title,
            "url": self.url,
            "domain": self.domain,
            "snippet": self.snippet,
        }


def _clean_text(raw_text: str) -> str:
    """
    清洗网页或搜索结果文本，压缩多余空白并去除 HTML 标签。
    """
    no_html = re.sub(r"<[^>]+>", " ", raw_text)
    normalized = re.sub(r"\s+", " ", unescape(no_html)).strip()
    return normalized


def _normalize_url(url: str) -> str:
    """
    规范化链接用于去重。
    """
    parsed = urlparse(url.strip())
    normalized_path = parsed.path.rstrip("/")
    return f"{parsed.scheme}://{parsed.netloc}{normalized_path}"


def _extract_domain(url: str) -> str:
    """
    提取链接域名。
    """
    return urlparse(url).netloc.replace("www.", "")


def _build_queries(user_question: str) -> list[str]:
    """
    生成搜索查询词。
    """
    normalized_question = re.sub(r"\s+", " ", user_question).strip()
    if not normalized_question:
        return []

    stripped_question = re.sub(r"[\"'“”‘’]+", "", normalized_question)
    queries = [normalized_question]
    if stripped_question != normalized_question:
        queries.append(stripped_question)

    unique_queries: list[str] = []
    seen_queries: set[str] = set()
    for query in queries:
        next_query = query[:120].strip()
        if next_query and next_query not in seen_queries:
            seen_queries.add(next_query)
            unique_queries.append(next_query)
    return unique_queries[:2]


def _search_with_tavily(query: str) -> list[dict[str, str]]:
    """
    调用 Tavily 搜索接口。
    """
    if not TAVILY_API_KEY:
        return []

    response = requests.post(
        "https://api.tavily.com/search",
        json={
            "api_key": TAVILY_API_KEY,
            "query": query,
            "search_depth": "advanced",
            "include_answer": False,
            "include_raw_content": False,
            "max_results": SEARCH_MAX_RESULTS,
        },
        timeout=SEARCH_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    results = payload.get("results", [])

    normalized_results: list[dict[str, str]] = []
    for item in results:
        url = str(item.get("url") or "").strip()
        if not url:
            continue

        snippet_source = str(item.get("content") or item.get("snippet") or "").strip()
        normalized_results.append(
            {
                "title": str(item.get("title") or url),
                "url": url,
                "snippet": _clean_text(snippet_source),
            }
        )
    return normalized_results


def _fetch_page_summary(url: str) -> str:
    """
    拉取网页正文并截取摘要。
    """
    response = requests.get(
        url,
        timeout=SEARCH_PAGE_TIMEOUT_SECONDS,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"
            )
        },
    )
    response.raise_for_status()

    raw_html = response.text
    stripped_html = re.sub(r"(?is)<script.*?>.*?</script>", " ", raw_html)
    stripped_html = re.sub(r"(?is)<style.*?>.*?</style>", " ", stripped_html)
    cleaned_text = _clean_text(stripped_html)
    return cleaned_text[:MAX_SNIPPET_LENGTH]


async def _search_single_query(query: str) -> list[dict[str, str]]:
    """
    异步执行单条搜索查询。
    """
    if SEARCH_PROVIDER == "tavily":
        return await asyncio.to_thread(_search_with_tavily, query)
    return []


async def prepare_search_context(user_question: str) -> tuple[list[SearchCitation], str, str]:
    """
    获取搜索引用与模型上下文。

    返回：
    - citations: 搜索引用数组
    - search_context: 供模型消费的搜索上下文
    - search_status: 搜索状态中文提示
    """
    queries = _build_queries(user_question)
    if not queries:
        return [], "", "当前问题为空，无法执行联网搜索。"

    if SEARCH_PROVIDER != "tavily":
        return [], "", "未配置 Tavily 联网搜索服务，已回退为普通回答。"

    if not TAVILY_API_KEY:
        return [], "", "缺少 TAVILY_API_KEY，已回退为普通回答。"

    raw_results: list[dict[str, str]] = []
    for query in queries:
        try:
            query_results = await _search_single_query(query)
        except requests.RequestException:
            continue
        raw_results.extend(query_results)

    if not raw_results:
        return [], "", "未检索到可用网页结果，已回退为普通回答。"

    deduplicated_results: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    for item in raw_results:
        normalized_url = _normalize_url(item["url"])
        if normalized_url in seen_urls:
            continue
        seen_urls.add(normalized_url)
        deduplicated_results.append(item)
        if len(deduplicated_results) >= SEARCH_MAX_RESULTS:
            break

    citations: list[SearchCitation] = []
    context_blocks: list[str] = []

    for index, item in enumerate(deduplicated_results, start=1):
        snippet = item["snippet"][:MAX_SNIPPET_LENGTH]
        if SEARCH_FETCH_PAGE_CONTENT and len(snippet) < 180:
            try:
                page_summary = await asyncio.to_thread(_fetch_page_summary, item["url"])
                if page_summary:
                    snippet = page_summary
            except requests.RequestException:
                pass

        if not snippet:
            snippet = "该搜索结果未返回可用摘要。"

        citation = SearchCitation(
            id=index,
            title=item["title"][:120],
            url=item["url"],
            domain=_extract_domain(item["url"]),
            snippet=snippet[:MAX_SNIPPET_LENGTH],
        )
        citations.append(citation)
        context_blocks.append(
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

    if not citations:
        return [], "", "未检索到可用网页结果，已回退为普通回答。"

    search_context = "\n\n".join(context_blocks)
    return citations, search_context, f"已完成联网搜索，共引用 {len(citations)} 条来源。"
