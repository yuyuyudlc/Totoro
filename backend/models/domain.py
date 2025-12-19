"""
业务数据模型
"""
from dataclasses import dataclass, field
from typing import List


@dataclass
class LoginInfo:
    """登录信息"""
    code: str
    message: str
    student_id: str = ""
    stu_number: str = ""
    stu_name: str = ""
    phone_number: str = ""
    school_id: str = ""
    school_name: str = ""
    campus_id: str = ""
    campus_name: str = ""
    college_id: str = ""
    college_name: str = ""
    natural_id: str = ""
    natural_name: str = ""
    class_name: str = ""
    gender: str = ""
    head_portrait: str = ""
    token: str = ""
    
    @classmethod
    def from_dict(cls, data: dict, server_token: str = "") -> "LoginInfo":
        """从字典创建 LoginInfo"""
        token = data.get("token") or server_token or ""
        
        return cls(
            code=data.get("code", ""),
            message=data.get("message", ""),
            student_id=data.get("studentId", ""),
            stu_number=data.get("stuNumber", ""),
            stu_name=data.get("stuName", ""),
            phone_number=data.get("phoneNumber", ""),
            school_id=data.get("schoolId", ""),
            school_name=data.get("schoolName", ""),
            campus_id=data.get("campusId", ""),
            campus_name=data.get("campusName", ""),
            college_id=data.get("collegeId", ""),
            college_name=data.get("collegeName", ""),
            natural_id=data.get("naturalId", ""),
            natural_name=data.get("naturalName", ""),
            class_name=data.get("className", "") or "",
            gender=data.get("gender", "") or data.get("sex", "") or "",
            head_portrait=data.get("headPortrait", ""),
            token=token,
        )
    
    @property
    def is_success(self) -> bool:
        """是否登录成功"""
        return self.code == "0"
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "code": self.code,
            "message": self.message,
            "studentId": self.student_id,
            "stuNumber": self.stu_number,
            "stuName": self.stu_name,
            "phoneNumber": self.phone_number,
            "schoolId": self.school_id,
            "schoolName": self.school_name,
            "campusId": self.campus_id,
            "campusName": self.campus_name,
            "collegeId": self.college_id,
            "collegeName": self.college_name,
            "naturalId": self.natural_id,
            "naturalName": self.natural_name,
            "className": self.class_name,
            "gender": self.gender,
            "headPortrait": self.head_portrait,
            "token": self.token,
        }


@dataclass
class QRCodeInfo:
    """二维码信息"""
    qrcode_url: str  # 二维码图片 URL
    uuid: str        # 用于轮询的 UUID


@dataclass
class Coordinate:
    """坐标点"""
    longitude: str
    latitude: str
    
    @classmethod
    def from_dict(cls, data: dict) -> "Coordinate":
        return cls(
            longitude=data.get("longitude", ""),
            latitude=data.get("latitude", "")
        )
    
    def to_dict(self) -> dict:
        return {
            "longitude": self.longitude,
            "latitude": self.latitude
        }


@dataclass
class RunPoint:
    """打卡点"""
    task_id: str
    point_id: str
    point_name: str
    longitude: str
    latitude: str
    point_list: List[Coordinate] = field(default_factory=list)
    
    @classmethod
    def from_dict(cls, data: dict) -> "RunPoint":
        point_list = [
            Coordinate.from_dict(p) 
            for p in data.get("pointList", [])
        ]
        return cls(
            task_id=data.get("taskId", ""),
            point_id=data.get("pointId", ""),
            point_name=data.get("pointName", ""),
            longitude=data.get("longitude", ""),
            latitude=data.get("latitude", ""),
            point_list=point_list
        )
    
    def to_dict(self) -> dict:
        return {
            "taskId": self.task_id,
            "pointId": self.point_id,
            "pointName": self.point_name,
            "longitude": self.longitude,
            "latitude": self.latitude,
            "pointList": [p.to_dict() for p in self.point_list]
        }


@dataclass
class RunTask:
    """跑步任务"""
    code: str
    message: str
    # 时间配置
    start_date: str = ""
    start_time: str = ""
    end_date: str = ""
    end_time: str = ""
    # 跑步要求
    mileage: str = ""          # 要求里程(公里)
    min_time: str = ""         # 最短时间(分钟)
    max_time: str = ""         # 最长时间(分钟)
    min_speed: str = ""        # 最低配速
    max_speed: str = ""        # 最高配速
    fit_degree: str = ""       # 路线匹配度要求(%)
    offset_range: str = ""     # 偏移范围(米)
    # 状态
    face_flag: str = ""        # 是否需要人脸: "1"=是, "0"=否
    if_has_run: str = ""       # 今日是否已跑: "0"=否, "1"=是
    # 打卡点
    run_point_list: List[RunPoint] = field(default_factory=list)
    
    @classmethod
    def from_dict(cls, data: dict) -> "RunTask":
        run_point_list = [
            RunPoint.from_dict(p) 
            for p in data.get("runPointList", [])
        ]
        return cls(
            code=data.get("code", ""),
            message=data.get("message", ""),
            start_date=data.get("startDate", ""),
            start_time=data.get("startTime", ""),
            end_date=data.get("endDate", ""),
            end_time=data.get("endTime", ""),
            mileage=data.get("mileage", ""),
            min_time=data.get("minTime", ""),
            max_time=data.get("maxTime", ""),
            min_speed=data.get("minSpeed", ""),
            max_speed=data.get("maxSpeed", ""),
            fit_degree=data.get("fitDegree", ""),
            offset_range=data.get("offsetRange", ""),
            face_flag=data.get("faceFlag", ""),
            if_has_run=data.get("ifHasRun", ""),
            run_point_list=run_point_list
        )
    
    @property
    def is_success(self) -> bool:
        """是否获取成功"""
        return self.code == "0"
    
    @property
    def has_run_today(self) -> bool:
        """今日是否已跑"""
        return self.if_has_run == "1"
    
    @property
    def need_face(self) -> bool:
        """是否需要人脸识别"""
        return self.face_flag == "1"
    
    @property
    def required_km(self) -> float:
        """要求里程(公里)"""
        try:
            return float(self.mileage)
        except:
            return 0.0
    
    @property
    def time_range(self) -> tuple:
        """时间范围 (min_minutes, max_minutes)"""
        try:
            return (int(self.min_time), int(self.max_time))
        except:
            return (15, 45)
    
    @property
    def speed_range(self) -> tuple:
        """配速范围 (min_pace, max_pace) 分钟/公里"""
        try:
            return (float(self.min_speed), float(self.max_speed))
        except:
            return (4.0, 10.0)
    
    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "message": self.message,
            "startDate": self.start_date,
            "startTime": self.start_time,
            "endDate": self.end_date,
            "endTime": self.end_time,
            "mileage": self.mileage,
            "minTime": self.min_time,
            "maxTime": self.max_time,
            "minSpeed": self.min_speed,
            "maxSpeed": self.max_speed,
            "fitDegree": self.fit_degree,
            "offsetRange": self.offset_range,
            "faceFlag": self.face_flag,
            "ifHasRun": self.if_has_run,
            "runPointList": [p.to_dict() for p in self.run_point_list]
        }
