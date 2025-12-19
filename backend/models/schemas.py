"""
Pydantic 模型 - API 请求/响应
"""
from typing import List, Optional
from pydantic import BaseModel


# ============================================================
# 登录相关
# ============================================================

class QRCodeResponse(BaseModel):
    """二维码响应"""
    qrcode_url: str
    uuid: str


class PollStatusResponse(BaseModel):
    """扫码状态响应"""
    status: int  # 408=等待扫码, 404=已扫码, 405=已授权, 403=取消, 402=过期
    message: str
    wx_code: Optional[str] = None


class LoginCompleteRequest(BaseModel):
    """完成登录请求"""
    wx_code: str
    longitude: str = "116.397428"
    latitude: str = "39.908823"


class LoginResponse(BaseModel):
    """登录响应"""
    success: bool
    message: str
    data: Optional[dict] = None


# ============================================================
# 阳光跑相关
# ============================================================

class TokenRequest(BaseModel):
    """需要 token 的基础请求"""
    token: str
    stu_number: str
    school_id: str
    campus_id: str


class RunTaskResponse(BaseModel):
    """跑步任务响应"""
    success: bool
    message: str
    data: Optional[dict] = None


class StartRunRequest(BaseModel):
    """开始跑步请求"""
    token: str
    stu_number: str
    school_id: str
    campus_id: str


class SubmitRunRequest(BaseModel):
    """提交跑步记录请求"""
    token: str
    stu_number: str
    school_id: str
    campus_id: str
    campus_name: str
    # 可选参数
    km: Optional[float] = None
    used_time_minutes: Optional[int] = None
    point_index: Optional[int] = None
    run_date: Optional[str] = None  # 跑步日期，格式 YYYY-MM-DD
    run_time: Optional[str] = None  # 跑步开始时间，格式 HH:MM:SS


class SubmitRunResponse(BaseModel):
    """提交跑步响应"""
    success: bool
    message: str
    scantron_id: Optional[str] = None
    data: Optional[dict] = None


class BulkRunRequest(BaseModel):
    """批量跑步请求"""
    token: str
    stu_number: str
    school_id: str
    campus_id: str
    campus_name: str
    count: int  # 需要补跑的次数


class BulkRunResponse(BaseModel):
    """批量跑步响应"""
    success: bool
    message: str
    total_submitted: int = 0
    results: List[dict] = []


class RunRecordsRequest(BaseModel):
    """获取跑步记录请求"""
    token: str
    stu_number: str
    school_id: str = ""
    campus_id: str = ""
    run_type: str = "0"
    month_id: str = ""
    page_number: str = "1"
    row_number: str = "100"


class RunRecordsResponse(BaseModel):
    """跑步记录响应"""
    success: bool
    message: str
    total: int = 0
    records: List[dict] = []
    task_info: Optional[dict] = None  # 任务信息，包含日期范围


# ============================================================
# 坐标相关
# ============================================================

class CoordinateModel(BaseModel):
    """坐标点"""
    longitude: str
    latitude: str


class RunPointModel(BaseModel):
    """打卡点"""
    task_id: str
    point_id: str
    point_name: str
    longitude: str
    latitude: str
    point_list: List[CoordinateModel] = []
