"""
跑步工具函数
合并路径生成、距离计算、跑步数据生成等功能
"""
import math
import random
from datetime import datetime, timedelta
from typing import List, Tuple, Dict, Optional

# ============================================================
# 基础类型 & 向量运算
# ============================================================

Point = Tuple[float, float]


class Vector:
    """二维向量类"""

    def __init__(self, components: List[float]):
        if len(components) != 2:
            raise ValueError("向量必须是二维的")
        self.x = components[0]
        self.y = components[1]

    @property
    def norm(self) -> float:
        return math.sqrt(self.x ** 2 + self.y ** 2)

    @property
    def unit_vector(self) -> List[float]:
        norm = self.norm
        if norm == 0:
            return [0.0, 0.0]
        return [self.x / norm, self.y / norm]


# ============================================================
# 距离计算
# ============================================================

def normal_random(mean: float, std: float) -> float:
    """生成正态分布随机数"""
    return random.gauss(mean, std)


def haversine_distance(point1: Point, point2: Point) -> float:
    """使用 Haversine 公式计算两个经纬度点之间的距离（米）"""
    lon1, lat1 = point1
    lon2, lat2 = point2
    R = 6371000

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def distance_of_line(points: List[Point]) -> float:
    """计算路径点序列的总距离（米）"""
    if len(points) < 2:
        return 0.0
    total_distance = 0.0
    for i in range(len(points) - 1):
        total_distance += haversine_distance(points[i], points[i + 1])
    return total_distance


def format_route_to_amap(point_list: List[dict]) -> List[Point]:
    """将打卡点列表格式化为坐标点列表 [(lon, lat), ...]"""
    route = []
    for point in point_list:
        lon = float(point.get("longitude", 0))
        lat = float(point.get("latitude", 0))
        route.append((lon, lat))
    return route


# ============================================================
# 路径生成
# ============================================================

# GPS 偏移标准差
_STD = 1 / 50000
# 路径点插值步长
_STEP_LENGTH = 0.0001


def _add_deviation(point: Point) -> Point:
    """添加 GPS 偏移"""
    lon, lat = point
    return (normal_random(lon, _STD), normal_random(lat, _STD))


def _add_points(point_a: Point, point_b: Point) -> List[Point]:
    """在两个路径点之间插入密集点"""
    point_vector = Vector([point_b[0] - point_a[0], point_b[1] - point_a[1]])
    number_of_points = math.floor(point_vector.norm / _STEP_LENGTH)

    points = [point_a]
    unit_vector = point_vector.unit_vector

    for i in range(1, number_of_points):
        point_x = point_a[0] + i * _STEP_LENGTH * unit_vector[0]
        point_y = point_a[1] + i * _STEP_LENGTH * unit_vector[1]
        points.append((point_x, point_y))

    return points


def _combine_points(point_list: List[dict]) -> List[Point]:
    """组合标准路线，在所有打卡点之间插值"""
    if not point_list or not point_list[0].get("latitude"):
        raise ValueError("任务为空")

    route = format_route_to_amap(point_list)
    combined_points = []

    for index in range(len(route)):
        if index == len(route) - 1:
            combined_points.append(route[index])
            break

        point_a = route[index]
        point_b = route[index + 1]

        for point in _add_points(point_a, point_b):
            combined_points.append(point)

    return combined_points


def _trim_route(route: List[Point], distance_km: float) -> Tuple[List[Point], float]:
    """裁剪路线到指定距离"""
    r = 0.0
    ori_i = math.floor(random.random() * len(route))
    i = ori_i
    points = [_add_deviation(route[ori_i])]
    distance_m = distance_km * 1000

    while r < distance_m:
        point = _add_deviation(route[i])
        points.append(point)
        r = distance_of_line(points)
        i += 1
        if i >= len(route) - 2:
            i = 0

    return points, r


def generate_route(distance: str, task_today: dict) -> Dict[str, any]:
    """
    生成模拟跑步路线

    Args:
        distance: 目标距离（公里，字符串格式）
        task_today: 跑步任务信息，包含 pointList

    Returns:
        {"mockRoute": [...], "distance": "实际距离(km)"}
    """
    point_list = task_today.get("pointList", [])
    if not point_list:
        raise ValueError("任务中没有打卡点信息")

    route_added_points = _combine_points(point_list)
    distance_km = float(distance)
    trimmed_points, actual_distance_m = _trim_route(route_added_points, distance_km)

    mock_route = [
        {"longitude": f"{lon:.6f}", "latitude": f"{lat:.6f}"}
        for lon, lat in trimmed_points
    ]

    actual_distance_km = actual_distance_m / 1000
    return {
        "mockRoute": mock_route,
        "distance": f"{actual_distance_km:.2f}"
    }


# ============================================================
# 跑步数据计算
# ============================================================

def calculate_avg_speed(used_time_seconds: int, km: float) -> str:
    """计算平均速度（km/h）"""
    if used_time_seconds <= 0:
        return "0"
    speed_kmh = km / (used_time_seconds / 3600)
    return f"{speed_kmh:.2f}"


def format_used_time(used_time_seconds: int) -> str:
    """格式化用时为 HH:MM:SS 格式"""
    hours = used_time_seconds // 3600
    minutes = (used_time_seconds % 3600) // 60
    seconds = used_time_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def generate_simple_track(start_point: dict, km: float, point_count: int = 50) -> list:
    """生成简单的模拟跑步轨迹（环形）"""
    points = []

    start_lng = float(start_point.get("longitude", "119.48"))
    start_lat = float(start_point.get("latitude", "31.37"))

    radius = km / (2 * math.pi) * 0.009

    for i in range(point_count):
        angle = 2 * math.pi * i / point_count
        random_offset_lng = random.uniform(-0.0001, 0.0001)
        random_offset_lat = random.uniform(-0.0001, 0.0001)

        lng = start_lng + radius * math.cos(angle) + random_offset_lng
        lat = start_lat + radius * math.sin(angle) + random_offset_lat

        points.append({
            "longitude": f"{lng:.6f}",
            "latitude": f"{lat:.6f}"
        })

    points.append({
        "longitude": f"{start_lng + random.uniform(-0.0001, 0.0001):.6f}",
        "latitude": f"{start_lat + random.uniform(-0.0001, 0.0001):.6f}"
    })

    return points


# ============================================================
# 打卡点选择
# ============================================================

def select_point_for_campus(run_point_list, campus_name: str):
    """根据校区名称自动选择合适的打卡点"""
    if not run_point_list:
        return None

    campus_lower = campus_name.lower() if campus_name else ""

    for point in run_point_list:
        point_name_lower = point.point_name.lower()
        if campus_lower and campus_lower in point_name_lower:
            return point
        if "天目湖" in campus_name and "天目湖" in point.point_name:
            return point

    return None


# ============================================================
# 核心：生成跑步记录数据
# ============================================================

def generate_run_data(
    task,
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
    生成跑步记录数据

    Args:
        task: RunTask 对象
        stu_number: 学号
        token: 登录 token
        campus_name: 校区名称
        km: 跑步里程，默认使用任务要求 + 随机偏移
        used_time_minutes: 用时（分钟），默认随机生成
        point_index: 打卡点索引，默认自动根据校区选择
        run_date: 跑步日期，格式 YYYY-MM-DD
        run_time: 跑步开始时间，格式 HH:MM:SS

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
        start_point = {"longitude": "119.4801785", "latitude": "31.372601"}
        task_id = "sunrunTaskPaper-20210917000004"
        route_id = "sunrunLine-20210918000001"

    # 4. 生成时间
    if run_date:
        submit_date = run_date
        if run_time:
            # 日期和时间都指定了
            start_time_str = run_time
        else:
            # 只指定了日期，随机生成时间
            try:
                start_h = int(task.start_time.split(":")[0]) if task.start_time else 6
                end_h = int(task.end_time.split(":")[0]) if task.end_time else 22
            except:
                start_h, end_h = 6, 22
            rand_h = random.randint(start_h, max(start_h, end_h - 1))
            rand_m = random.randint(0, 59)
            rand_s = random.randint(0, 59)
            start_time_str = f"{rand_h:02d}:{rand_m:02d}:{rand_s:02d}"
        try:
            start_dt = datetime.strptime(f"{run_date} {start_time_str}", "%Y-%m-%d %H:%M:%S")
            end_dt = start_dt + timedelta(seconds=used_time_seconds)
            end_time_str = end_dt.strftime("%H:%M:%S")
        except ValueError:
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

    # 7. 返回数据
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
        "pointList": "",
        "routeId": route_id,
        "runType": "0",
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
        # 内部字段
        "_pointList": point_list,
        "_selectedPoint": selected_point.point_name if selected_point else "默认",
    }
