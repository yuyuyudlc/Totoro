"""
智能路径生成模块
基于真实打卡点路线生成模拟跑步轨迹
"""
import math
import random
from typing import List, Dict, Tuple

from utils.route_utils import (
    Vector, 
    normal_random, 
    distance_of_line, 
    format_route_to_amap,
    Point
)


# GPS 偏移标准差
STD = 1 / 50000

# 路径点插值步长
STEP_LENGTH = 0.0001


def add_deviation(point: Point) -> Point:
    """
    添加 GPS 偏移
    
    Args:
        point: 原始坐标点 (lon, lat)
        
    Returns:
        添加偏移后的坐标点
    """
    lon, lat = point
    return (normal_random(lon, STD), normal_random(lat, STD))


def add_points(point_a: Point, point_b: Point) -> List[Point]:
    """
    在两个路径点之间插入密集点
    
    Args:
        point_a: 起始点
        point_b: 结束点
        
    Returns:
        插值后的点列表（不包含 point_b）
    """
    point_vector = Vector([point_b[0] - point_a[0], point_b[1] - point_a[1]])
    number_of_points = math.floor(point_vector.norm / STEP_LENGTH)
    
    points = [point_a]
    unit_vector = point_vector.unit_vector
    
    for i in range(1, number_of_points):
        point_x = point_a[0] + i * STEP_LENGTH * unit_vector[0]
        point_y = point_a[1] + i * STEP_LENGTH * unit_vector[1]
        points.append((point_x, point_y))
    
    return points


def combine_points(point_list: List[dict]) -> List[Point]:
    """
    组合标准路线，在所有打卡点之间插值
    
    Args:
        point_list: 打卡点列表
        
    Returns:
        插值后的完整路线
    """
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
        
        for point in add_points(point_a, point_b):
            combined_points.append(point)
    
    return combined_points


def trim_route(route: List[Point], distance_km: float) -> Tuple[List[Point], float]:
    """
    裁剪路线到指定距离
    
    Args:
        route: 标准路线点列表
        distance_km: 目标距离（公里）
        
    Returns:
        (裁剪后的路线点, 实际距离(米))
    """
    r = 0.0
    ori_i = math.floor(random.random() * len(route))
    i = ori_i
    points = [add_deviation(route[ori_i])]
    distance_m = distance_km * 1000
    
    while r < distance_m:
        point = add_deviation(route[i])
        points.append(point)
        r = distance_of_line(points)
        i += 1
        
        # 不计算最后两个路径点避免标准路线抽风导致的路线抽风
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
        {
            "mockRoute": [{"longitude": "...", "latitude": "..."}, ...],
            "distance": "实际距离(km)"
        }
    """
    point_list = task_today.get("pointList", [])
    if not point_list:
        raise ValueError("任务中没有打卡点信息")
    
    # 组合标准路线
    route_added_points = combine_points(point_list)
    
    # 裁剪到目标距离
    distance_km = float(distance)
    trimmed_points, actual_distance_m = trim_route(route_added_points, distance_km)
    
    # 格式化输出
    mock_route = [
        {
            "longitude": f"{lon:.6f}",
            "latitude": f"{lat:.6f}"
        }
        for lon, lat in trimmed_points
    ]
    
    actual_distance_km = actual_distance_m / 1000
    
    return {
        "mockRoute": mock_route,
        "distance": f"{actual_distance_km:.2f}"
    }
