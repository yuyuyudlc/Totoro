"""
阳光跑服务
处理跑步任务和记录提交
"""
from typing import Optional

import httpx

from core.config import BASE_URL, COMMON_HEADERS
from core.crypto import rsa_encrypt
from models.domain import RunTask
from utils.run_utils import generate_run_data


class SunRunService:
    """阳光跑服务"""
    
    def __init__(self, token: str, stu_number: str, school_id: str, campus_id: str):
        """
        初始化服务
        
        Args:
            token: 登录令牌
            stu_number: 学号
            school_id: 学校ID
            campus_id: 校区ID
        """
        self.token = token
        self.stu_number = stu_number
        self.school_id = school_id
        self.campus_id = campus_id
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def close(self):
        """关闭客户端"""
        await self.client.aclose()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    async def _post(self, endpoint: str, data: dict, encrypt: bool = True) -> dict:
        """
        发送 POST 请求
        
        Args:
            endpoint: API 端点
            data: 请求数据
            encrypt: 是否加密
            
        Returns:
            响应 JSON 数据
        """
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
        """
        获取跑步记录列表
        
        Args:
            run_type: 跑步类型，默认 "0" (阳光跑)
            month_id: 月份ID，默认为空表示全部
            page_number: 页码，默认 "1"
            row_number: 每页条数，默认 "100"
            
        Returns:
            响应数据，包含跑步记录列表
        """
        data = {
            "stuNumber": self.stu_number,
            "runType": run_type,
            "monthId": month_id,
            "pageNumber": page_number,
            "rowNumber": row_number,
        }
        return await self._post("/app/sunrun/getSunrunSport", data)
    
    async def submit_run_record(self, run_data: dict) -> dict:
        """
        提交跑步基础记录
        
        Args:
            run_data: 跑步数据
            
        Returns:
            包含 scantronId 的响应数据
        """
        return await self._post("/app/platform/recrecord/sunRunExercises", run_data)
    
    async def submit_run_detail(self, scantron_id: str, point_list: list) -> dict:
        """
        提交跑步详情（轨迹点）
        
        注意：此接口不加密
        
        Args:
            scantron_id: 记录ID（从 submit_run_record 返回）
            point_list: 轨迹点列表
            
        Returns:
            响应数据
        """
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
        """
        完整提交跑步记录（基础记录 + 轨迹详情）
        
        Args:
            task: 跑步任务
            campus_name: 校区名称
            km: 跑步里程（可选）
            used_time_minutes: 用时分钟（可选）
            point_index: 打卡点索引（可选）
            run_date: 跑步日期，格式 YYYY-MM-DD（可选）
            run_time: 跑步开始时间，格式 HH:MM:SS（可选）
            
        Returns:
            (基础记录响应, 详情响应, 生成的跑步数据)
        """
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
        
        # 提取轨迹点和选中的打卡点
        point_list = run_data.pop("_pointList", [])
        selected_point = run_data.pop("_selectedPoint", "默认")
        
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
