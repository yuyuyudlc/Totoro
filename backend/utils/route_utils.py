"""
路径生成辅助工具模块
包含向量运算、距离计算、正态分布随机数等功能
"""
import math
import random
from typing import List, Tuple

Point = Tuple[float, float]


class Vector:
    """二维向量类"""
    
    def __init__(self, components: List[float]):
        """
        初始化向量
        
        Args:
            components: [x, y] 分量
        """
        if len(components) != 2:
            raise ValueError("向量必须是二维的")
        self.x = components[0]
        self.y = components[1]
    
    @property
    def norm(self) -> float:
        """计算向量模长"""
        return math.sqrt(self.x ** 2 + self.y ** 2)
    
    @property
    def unit_vector(self) -> List[float]:
        """计算单位向量"""
        norm = self.norm
        if norm == 0:
            return [0.0, 0.0]
        return [self.x / norm, self.y / norm]


def normal_random(mean: float, std: float) -> float:
    """
    生成正态分布随机数
    
    Args:
        mean: 均值
        std: 标准差
        
    Returns:
        符合正态分布的随机数
    """
    return random.gauss(mean, std)


def haversine_distance(point1: Point, point2: Point) -> float:
    """
    使用 Haversine 公式计算两个经纬度点之间的距离（米）
    
    Args:
        point1: (经度, 纬度)
        point2: (经度, 纬度)
        
    Returns:
        距离（米）
    """
    lon1, lat1 = point1
    lon2, lat2 = point2
    
    # 地球半径（米）
    R = 6371000
    
    # 转换为弧度
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    # Haversine 公式
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def distance_of_line(points: List[Point]) -> float:
    """
    计算路径点序列的总距离（米）
    
    Args:
        points: 路径点列表 [(lon, lat), ...]
        
    Returns:
        总距离（米）
    """
    if len(points) < 2:
        return 0.0
    
    total_distance = 0.0
    for i in range(len(points) - 1):
        total_distance += haversine_distance(points[i], points[i + 1])
    
    return total_distance


def format_route_to_amap(point_list: List[dict]) -> List[Point]:
    """
    将打卡点列表格式化为高德地图格式的坐标点列表
    
    Args:
        point_list: 打卡点列表，每个点包含 longitude 和 latitude
        
    Returns:
        坐标点列表 [(lon, lat), ...]
    """
    route = []
    for point in point_list:
        lon = float(point.get("longitude", 0))
        lat = float(point.get("latitude", 0))
        route.append((lon, lat))
    return route
