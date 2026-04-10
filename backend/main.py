from typing import Any

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from routers.auth import initialize_auth_schema, router as auth_router
from routers.chat import router as chat_router

app = FastAPI()

origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(auth_router)


def build_error_response(
    code: int | str,
    message: str,
    data: Any = None,
) -> dict[str, Any]:
    """
    构造统一错误响应。
    """
    return {
        "success": False,
        "code": code,
        "message": message,
        "data": data,
    }


@app.on_event("startup")
async def startup_event() -> None:
    """
    在应用启动阶段初始化认证相关数据结构。
    """
    initialize_auth_schema()


@app.exception_handler(HTTPException)
async def handle_http_exception(
    request: Request,
    exc: HTTPException,
) -> JSONResponse:
    """
    统一处理鉴权和业务异常，避免返回 FastAPI 默认 detail 结构。
    """
    return JSONResponse(
        status_code=exc.status_code,
        content=build_error_response(
            code=exc.status_code,
            message=str(exc.detail),
            data={"path": request.url.path},
        ),
    )


@app.exception_handler(RequestValidationError)
async def handle_validation_exception(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """
    统一处理请求参数校验异常。
    """
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=build_error_response(
            code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            message="请求参数校验失败",
            data={
                "path": request.url.path,
                "errors": exc.errors(),
            },
        ),
    )


@app.get("/api/hello")
async def root() -> dict[str, str]:
    """
    基础健康检查接口。
    """
    return {"message": "Hello from my-deepseek backend"}


if __name__ == "__main__":
    # 默认使用无热重载模式启动，避免在受限 Windows 环境下因权限导致失败。
    uvicorn.run("main:app", host="127.0.0.1", port=8000)
