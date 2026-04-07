import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.auth import router as auth_router
from routers.chat import router as chat_router

load_dotenv()

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


@app.get("/api/hello")
async def root() -> dict[str, str]:
    """
    基础健康检查接口。
    """
    return {"message": "Hello from my-deepseek backend"}


if __name__ == "__main__":
    # 默认使用无热重载模式启动，避免在受限 Windows 环境下因权限导致失败。
    uvicorn.run("main:app", host="127.0.0.1", port=8000)
