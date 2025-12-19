"""
跑步数据工具函数
"""
import random
import math
from datetime import datetime, timedelta
from typing import List, Optional

from models.domain import RunTask, LoginInfo, RunPoint


# ============================================================
# 计算函数
# ============================================================

def calculate_avg_speed(used_time_seconds: int, km: float) -> str:
    """
    计算平均速度（km/h）
    
    Args:
        used_time_seconds: 用时（秒）
        km: 里程（公里）
        
    Returns:
        时速字符串，如 "8.50"
    """
    if used_time_seconds <= 0:
        return "0"
    speed_kmh = km / (used_time_seconds / 3600)
    return f"{speed_kmh:.2f}"


def format_used_time(used_time_seconds: int) -> str:
    """
    格式化用时为 HH:MM:SS 格式
    
    Args:
        used_time_seconds: 用时（秒）
        
    Returns:
        格式化的时间字符串，如 "00:23:45"
    """
    hours = used_time_seconds // 3600
    minutes = (used_time_seconds % 3600) // 60
    seconds = used_time_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


# ============================================================
# 打卡点选择
# ============================================================

def select_point_for_campus(
    run_point_list: List[RunPoint],
    campus_name: str
) -> Optional[RunPoint]:
    """
    根据校区名称自动选择合适的打卡点
    
    Args:
        run_point_list: 打卡点列表
        campus_name: 校区名称
        
    Returns:
        匹配的打卡点，未找到则返回 None
    """
    if not run_point_list:
        return None
    
    campus_lower = campus_name.lower() if campus_name else ""
    
    for point in run_point_list:
        point_name_lower = point.point_name.lower()
        if campus_lower and campus_lower in point_name_lower:
            return point
        # 天目湖校区特殊处理
        if "天目湖" in campus_name and "天目湖" in point.point_name:
            return point
    
    return None


# ============================================================
# 轨迹生成
# ============================================================

def generate_simple_track(start_point: dict, km: float, point_count: int = 50) -> list:
    """
    生成简单的模拟跑步轨迹（环形）
    
    Args:
        start_point: 起始点 {"longitude": "...", "latitude": "..."}
        km: 跑步里程
        point_count: 轨迹点数量
        
    Returns:
        轨迹点列表
    """
    points = []
    
    start_lng = float(start_point.get("longitude", "119.48"))
    start_lat = float(start_point.get("latitude", "31.37"))
    
    # 根据里程计算环形半径
    radius = km / (2 * math.pi) * 0.009
    
    for i in range(point_count):
        angle = 2 * math.pi * i / point_count
        
        # 添加随机偏移
        random_offset_lng = random.uniform(-0.0001, 0.0001)
        random_offset_lat = random.uniform(-0.0001, 0.0001)
        
        lng = start_lng + radius * math.cos(angle) + random_offset_lng
        lat = start_lat + radius * math.sin(angle) + random_offset_lat
        
        points.append({
            "longitude": f"{lng:.6f}",
            "latitude": f"{lat:.6f}"
        })
    
    # 添加回到起点
    points.append({
        "longitude": f"{start_lng + random.uniform(-0.0001, 0.0001):.6f}",
        "latitude": f"{start_lat + random.uniform(-0.0001, 0.0001):.6f}"
    })
    
    return points


# ============================================================
# 核心：生成跑步记录数据
# ============================================================

def generate_run_data(
    task: RunTask,
    stu_number: str,
    token: str,
    campus_name: str,
    km: float = None,
    used_time_minutes: int = None,
    point_index: int = None,
    run_date: str = None,
    run_time: str = None,
) -> dict:
    """
    生成跑步记录数据（与 Vue.js 版本格式一致）
    
    Args:
        task: 跑步任务
        stu_number: 学号
        token: 登录 token
        campus_name: 校区名称
        km: 跑步里程，默认使用任务要求 + 随机偏移
        used_time_minutes: 用时（分钟），默认随机生成
        point_index: 打卡点索引，默认自动根据校区选择
        run_date: 跑步日期，格式 YYYY-MM-DD，默认使用当前日期
        run_time: 跑步开始时间，格式 HH:MM:SS，默认使用当前时间
        
    Returns:
        跑步记录数据字典，包含 _pointList 用于详情提交
    """
    # 1. 设置里程
    if km is None:
        required_km = float(task.mileage) if task.mileage else 3.2
        km = required_km + random.uniform(0.05, 0.3)
    
    # 2. 设置用时
    if used_time_minutes is None:
        min_time = int(task.min_time) if task.min_time else 10
        max_time = int(task.max_time) if task.max_time else 25
        used_time_minutes = random.randint(min_time + 2, max_time - 2)
    
    used_time_seconds = used_time_minutes * 60
    
    # 3. 选择打卡点
    selected_point = None
    
    if task.run_point_list:
        if point_index is not None and 0 <= point_index < len(task.run_point_list):
            selected_point = task.run_point_list[point_index]
        else:
            selected_point = select_point_for_campus(
                task.run_point_list, 
                campus_name
            )
            if selected_point is None:
                selected_point = task.run_point_list[0]
        
        start_point = {
            "longitude": selected_point.longitude,
            "latitude": selected_point.latitude
        }
        task_id = selected_point.task_id
        route_id = selected_point.point_id
    else:
        # 兜底默认值
        start_point = {"longitude": "119.4801785", "latitude": "31.372601"}
        task_id = "sunrunTaskPaper-20210917000004"
        route_id = "sunrunLine-20210918000001"
    
    # 4. 生成时间（支持自定义日期和时间）
    if run_date and run_time:
        # 使用指定的日期和时间
        submit_date = run_date
        start_time_str = run_time
        # 计算结束时间
        try:
            start_dt = datetime.strptime(f"{run_date} {run_time}", "%Y-%m-%d %H:%M:%S")
            end_dt = start_dt + timedelta(seconds=used_time_seconds)
            end_time_str = end_dt.strftime("%H:%M:%S")
        except ValueError:
            # 解析失败使用当前时间
            now = datetime.now()
            submit_date = now.strftime("%Y-%m-%d")
            end_time_str = now.strftime("%H:%M:%S")
            start_time_str = (now - timedelta(seconds=used_time_seconds)).strftime("%H:%M:%S")
    else:
        now = datetime.now()
        submit_date = now.strftime("%Y-%m-%d")
        end_time_str = now.strftime("%H:%M:%S")
        start_time_str = (now - timedelta(seconds=used_time_seconds)).strftime("%H:%M:%S")
    
    # 5. 生成轨迹点
    try:
        from utils.generate_route import generate_route
        if selected_point and selected_point.point_list:
            point_list_dicts = [
                {"longitude": p.longitude, "latitude": p.latitude}
                for p in selected_point.point_list
            ]
            task_data = {"pointList": point_list_dicts}
            route_result = generate_route(str(km), task_data)
            point_list = route_result["mockRoute"]
        else:
            point_list = generate_simple_track(start_point, km)
    except (ImportError, ValueError):
        point_list = generate_simple_track(start_point, km)
    
    # 6. 计算步数
    steps = int(km * 1500 + random.randint(-100, 100))
    
    # 7. 返回数据（格式与 Vue.js 一致）
    return {
        "LocalSubmitReason": "",
        "avgSpeed": calculate_avg_speed(used_time_seconds, km),
        "baseStation": "",
        "endTime": end_time_str,
        "submitDate": submit_date,
        "evaluateDate": submit_date,
        "fitDegree": "1",
        "flag": "1",
        "headImage": "",
        "ifLocalSubmit": "1",
        "km": f"{km:.2f}",
        "mac": "02:00:00:00:00:00",
        "phoneInfo": "$CN11/iPhone15,4/17.4.1",
        "phoneNumber": "",
        "pointList": "",  # 基础记录中为空字符串
        "routeId": route_id,
        "runType": "0",   # 阳光跑
        "sensorString": "",
        "startTime": start_time_str,
        "steps": str(steps),
        "stuNumber": stu_number,
        "taskId": task_id,
        "token": token,
        "usedTime": format_used_time(used_time_seconds),
        "version": "1.2.14",
        "warnFlag": "0",
        "warnType": "",
        "faceData": "",
        # 内部字段，用于后续提交详情
        "_pointList": point_list,
        "_selectedPoint": selected_point.point_name if selected_point else "默认",
    }

