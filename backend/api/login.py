"""
登录 API 路由
"""
from fastapi import APIRouter, HTTPException

from models.schemas import (
    QRCodeResponse,
    PollStatusResponse,
    LoginCompleteRequest,
    LoginResponse
)
from services.login_service import get_login_service

router = APIRouter()


@router.get("/qrcode", response_model=QRCodeResponse)
async def get_qrcode():
    """
    获取微信登录二维码
    
    返回二维码图片URL和UUID，客户端使用UUID轮询扫码状态
    """
    try:
        service = await get_login_service()
        qr_info = await service.get_qrcode()
        return QRCodeResponse(
            qrcode_url=qr_info.qrcode_url,
            uuid=qr_info.uuid
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取二维码失败: {str(e)}")


@router.get("/poll/{uuid}", response_model=PollStatusResponse)
async def poll_scan_status(uuid: str):
    """
    轮询扫码状态
    
    客户端使用二维码UUID定期调用此接口，获取用户扫码状态。
    
    状态码说明：
    - 408: 等待扫码
    - 404: 已扫码，等待用户确认
    - 405: 授权成功，返回 wx_code
    - 403: 用户取消授权
    - 402: 二维码已过期
    """
    try:
        service = await get_login_service()
        status, message, wx_code = await service.poll_scan_status(uuid)
        return PollStatusResponse(
            status=status,
            message=message,
            wx_code=wx_code
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"轮询失败: {str(e)}")


@router.post("/complete", response_model=LoginResponse)
async def complete_login(request: LoginCompleteRequest):
    """
    完成登录
    
    使用扫码成功后返回的 wx_code 完成登录流程，
    返回用户信息和 token。
    """
    try:
        service = await get_login_service()
        login_info = await service.complete_login(
            wx_code=request.wx_code,
            longitude=request.longitude,
            latitude=request.latitude
        )
        
        if not login_info.is_success:
            return LoginResponse(
                success=False,
                message=login_info.message,
                data=None
            )
        
        return LoginResponse(
            success=True,
            message="登录成功",
            data=login_info.to_dict()
        )
    except ValueError as e:
        return LoginResponse(
            success=False,
            message=str(e),
            data=None
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"登录失败: {str(e)}")
