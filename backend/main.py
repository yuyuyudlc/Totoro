"""
龙猫阳光跑 - FastAPI 后端
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes import login_router, sunrun_router

app = FastAPI(
    title="龙猫阳光跑 API",
    description="TotoroRun 阳光跑服务后端",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(login_router, prefix="/api/login", tags=["登录"])
app.include_router(sunrun_router, prefix="/api/sunrun", tags=["阳光跑"])


@app.get("/")
async def root():
    return {"message": "龙猫阳光跑 API", "version": "1.0.0"}


@app.get("/health")
async def health_check():
    return {"status": "ok"}
