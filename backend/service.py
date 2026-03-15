"""
业务服务
合并登录服务和阳光跑服务
"""
import re
from typing import Optional, Tuple

import httpx

from core.config import BASE_URL, WECHAT_APPID, WECHAT_BUNDLE_ID, COMMON_HEADERS, WECHAT_HEADERS
from core.crypto import rsa_encrypt
from models import LoginInfo, QRCodeInfo, RunTask
from utils import generate_run_data


# ============================================================
# 登录服务
# ============================================================

class LoginService:
    """微信扫码登录服务"""

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def get_qrcode(self) -> QRCodeInfo:
        """获取微信登录二维码"""
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
        """使用微信授权码获取服务器 token"""
        url = f"{BASE_URL}/app/platform/serverlist/getLesseeServer"

        data = {"code": wechat_code}
        encrypted_body = rsa_encrypt(data)

        response = await self.client.post(
            url, content=encrypted_body, headers=COMMON_HEADERS
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
        """执行登录"""
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
            url, content=encrypted_body, headers=COMMON_HEADERS
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
        """完成登录（获取token + 登录）"""
        server_token = await self.get_server_token(wx_code)
        login_info = await self.login(wx_code, server_token, longitude, latitude)
        return login_info


# 单例
_login_service: Optional[LoginService] = None


async def get_login_service() -> LoginService:
    """获取登录服务单例"""
    global _login_service
    if _login_service is None:
        _login_service = LoginService()
    return _login_service


# ============================================================
# 阳光跑服务
# ============================================================

class SunRunService:
    """阳光跑服务"""

    def __init__(self, token: str, stu_number: str, school_id: str, campus_id: str):
        self.token = token
        self.stu_number = stu_number
        self.school_id = school_id
        self.campus_id = campus_id
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def _post(self, endpoint: str, data: dict, encrypt: bool = True) -> dict:
        """发送 POST 请求"""
        url = f"{BASE_URL}{endpoint}"
        data["token"] = self.token

        if encrypt:
            encrypted_body = rsa_encrypt(data)
            response = await self.client.post(url, content=encrypted_body, headers=COMMON_HEADERS)
        else:
            response = await self.client.post(url, json=data, headers=COMMON_HEADERS)

        response.raise_for_status()
        return response.json()

    async def get_sunrun_task(self) -> RunTask:
        """获取阳光跑任务"""
        data = {
            "stuNumber": self.stu_number,
            "schoolId": self.school_id,
            "campusId": self.campus_id,
        }
        result = await self._post("/app/sunrun/getSunrunPaper", data)
        return RunTask.from_dict(result)

    async def start_run(self) -> dict:
        """开始跑步（必须在提交记录前调用）"""
        data = {
            "stuNumber": self.stu_number,
            "schoolId": self.school_id,
            "campusId": self.campus_id,
        }
        return await self._post("/app/sunrun/getRunBegin", data)

    async def get_sunrun_sport(
        self,
        run_type: str = "0",
        month_id: str = "",
        page_number: str = "1",
        row_number: str = "100"
    ) -> dict:
        """获取跑步记录列表"""
        data = {
            "stuNumber": self.stu_number,
            "runType": run_type,
            "monthId": month_id,
            "pageNumber": page_number,
            "rowNumber": row_number,
        }
        return await self._post("/app/sunrun/getSunrunSport", data)

    async def submit_run_record(self, run_data: dict) -> dict:
        """提交跑步基础记录"""
        return await self._post("/app/platform/recrecord/sunRunExercises", run_data)

    async def submit_run_detail(self, scantron_id: str, point_list: list) -> dict:
        """提交跑步详情（轨迹点）— 不加密"""
        data = {
            "scantronId": scantron_id,
            "stuNumber": self.stu_number,
            "faceData": "",
            "pointList": point_list,
            "token": self.token
        }

        url = f"{BASE_URL}/app/platform/recrecord/sunRunExercisesDetail"
        response = await self.client.post(url, json=data, headers=COMMON_HEADERS)
        response.raise_for_status()
        return response.json()

    async def submit_complete_run(
        self,
        task: RunTask,
        campus_name: str,
        km: float = None,
        used_time_minutes: int = None,
        point_index: int = None,
        run_date: str = None,
        run_time: str = None
    ) -> tuple:
        """完整提交跑步记录（基础记录 + 轨迹详情）"""
        # 1. 生成跑步数据
        run_data = generate_run_data(
            task=task,
            stu_number=self.stu_number,
            token=self.token,
            campus_name=campus_name,
            km=km,
            used_time_minutes=used_time_minutes,
            point_index=point_index,
            run_date=run_date,
            run_time=run_time
        )

        point_list = run_data.pop("_pointList", [])
        selected_point = run_data.pop("_selectedPoint", "默认")

        print(f"[service] 生成的跑步数据:")
        print(f"  submitDate={run_data.get('submitDate')}")
        print(f"  evaluateDate={run_data.get('evaluateDate')}")
        print(f"  startTime={run_data.get('startTime')}")
        print(f"  endTime={run_data.get('endTime')}")
        print(f"  km={run_data.get('km')}, usedTime={run_data.get('usedTime')}")
        print(f"  ifLocalSubmit={run_data.get('ifLocalSubmit')}")
        print(f"  selectedPoint={selected_point}")

        # 2. 提交基础记录
        result1 = await self.submit_run_record(run_data)

        if result1.get("code") != "0":
            return result1, None, {
                "km": run_data["km"],
                "usedTime": run_data["usedTime"],
                "selectedPoint": selected_point,
                "trackPoints": len(point_list)
            }

        scantron_id = result1.get("scantronId", "")

        # 3. 提交轨迹详情
        result2 = await self.submit_run_detail(scantron_id, point_list)

        return result1, result2, {
            "km": run_data["km"],
            "usedTime": run_data["usedTime"],
            "avgSpeed": run_data["avgSpeed"],
            "steps": run_data["steps"],
            "selectedPoint": selected_point,
            "trackPoints": len(point_list),
            "scantronId": scantron_id
        }
