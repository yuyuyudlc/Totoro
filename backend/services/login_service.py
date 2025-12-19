"""
登录服务
处理微信扫码登录逻辑
"""
import re
import asyncio
from typing import Optional, Tuple

import httpx

from core.config import BASE_URL, WECHAT_APPID, WECHAT_BUNDLE_ID, COMMON_HEADERS, WECHAT_HEADERS
from core.crypto import rsa_encrypt
from models.domain import LoginInfo, QRCodeInfo


class LoginService:
    """登录服务"""
    
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """关闭客户端"""
        await self.client.aclose()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def get_qrcode(self) -> QRCodeInfo:
        """
        获取微信登录二维码
        
        Returns:
            QRCodeInfo: 包含二维码图片URL和UUID
        """
        url = (
            f"https://open.weixin.qq.com/connect/app/qrconnect"
            f"?appid={WECHAT_APPID}"
            f"&bundleid={WECHAT_BUNDLE_ID}"
            f"&scope=snsapi_userinfo"
            f"&state="
        )
        
        response = await self.client.get(url, headers=WECHAT_HEADERS)
        response.raise_for_status()
        
        html = response.text
        
        uuid_match = re.search(r'uuid\s*=\s*["\']([^"\']+)["\']', html)
        if not uuid_match:
            uuid_match = re.search(r'/qrcode/([a-zA-Z0-9_-]+)', html)
        
        if not uuid_match:
            raise ValueError("无法从页面中提取 UUID")
        
        uuid = uuid_match.group(1)
        qrcode_url = f"https://open.weixin.qq.com/connect/qrcode/{uuid}"
        
        return QRCodeInfo(qrcode_url=qrcode_url, uuid=uuid)
    
    async def poll_scan_status(self, uuid: str) -> Tuple[int, str, Optional[str]]:
        """
        轮询一次扫码状态
        
        Args:
            uuid: 二维码 UUID
            
        Returns:
            (状态码, 状态消息, 微信授权码或None)
            状态码: 408=等待扫码, 404=已扫码, 405=已授权, 403=取消, 402=过期
        """
        poll_url = f"https://long.open.weixin.qq.com/connect/l/qrconnect?uuid={uuid}&f=json"
        
        try:
            response = await self.client.get(poll_url, headers=WECHAT_HEADERS, timeout=30.0)
            response.raise_for_status()
            
            data = response.json()
            wx_errcode = data.get("wx_errcode", 408)
            wx_code = data.get("wx_code", "")
            
            status_messages = {
                408: "等待扫码",
                404: "已扫码，请在手机上确认",
                405: "授权成功",
                403: "用户取消授权",
                402: "二维码已过期"
            }
            
            message = status_messages.get(wx_errcode, f"未知状态: {wx_errcode}")
            
            return wx_errcode, message, wx_code if wx_code else None
            
        except httpx.RequestError as e:
            return 408, f"请求错误: {str(e)}", None
    
    async def get_server_token(self, wechat_code: str) -> str:
        """
        使用微信授权码获取服务器 token
        
        Args:
            wechat_code: 微信授权码
            
        Returns:
            服务器 token
        """
        url = f"{BASE_URL}/app/platform/serverlist/getLesseeServer"
        
        data = {"code": wechat_code}
        encrypted_body = rsa_encrypt(data)
        
        response = await self.client.post(
            url,
            content=encrypted_body,
            headers=COMMON_HEADERS
        )
        response.raise_for_status()
        
        result = response.json()
        
        if result.get("code") != "0":
            raise ValueError(f"获取服务器token失败: {result.get('message', '未知错误')}")
        
        return result.get("token", "")
    
    async def login(
        self, 
        wechat_code: str, 
        server_token: str,
        longitude: str = "116.397428",
        latitude: str = "39.908823"
    ) -> LoginInfo:
        """
        执行登录
        
        Args:
            wechat_code: 微信授权码
            server_token: 服务器 token
            longitude: 经度（可选）
            latitude: 纬度（可选）
            
        Returns:
            LoginInfo: 登录信息
        """
        url = f"{BASE_URL}/app/platform/login/login"
        
        data = {
            "loginWay": "1",
            "phoneNumber": "",
            "password": "",
            "code": wechat_code,
            "longitude": longitude,
            "latitude": latitude,
            "token": server_token
        }
        
        encrypted_body = rsa_encrypt(data)
        
        response = await self.client.post(
            url,
            content=encrypted_body,
            headers=COMMON_HEADERS
        )
        response.raise_for_status()
        
        result = response.json()
        
        return LoginInfo.from_dict(result, server_token=server_token)
    
    async def complete_login(
        self,
        wx_code: str,
        longitude: str = "116.397428",
        latitude: str = "39.908823"
    ) -> LoginInfo:
        """
        完成登录（获取token + 登录）
        
        Args:
            wx_code: 微信授权码
            longitude: 经度
            latitude: 纬度
            
        Returns:
            LoginInfo: 登录信息
        """
        # 1. 获取服务器 token
        server_token = await self.get_server_token(wx_code)
        
        # 2. 执行登录
        login_info = await self.login(wx_code, server_token, longitude, latitude)
        
        return login_info


# 单例服务实例
_login_service: Optional[LoginService] = None


async def get_login_service() -> LoginService:
    """获取登录服务单例"""
    global _login_service
    if _login_service is None:
        _login_service = LoginService()
    return _login_service
