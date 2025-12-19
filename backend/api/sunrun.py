"""
阳光跑 API 路由
"""
from fastapi import APIRouter, HTTPException

from models.schemas import (
    TokenRequest,
    RunTaskResponse,
    StartRunRequest,
    SubmitRunRequest,
    SubmitRunResponse,
    RunRecordsRequest,
    RunRecordsResponse,
    BulkRunRequest,
    BulkRunResponse
)
from services.sunrun_service import SunRunService

router = APIRouter()


@router.post("/task", response_model=RunTaskResponse)
async def get_sunrun_task(request: TokenRequest):
    """
    获取阳光跑任务
    
    返回当前用户的跑步任务信息，包括：
    - 时间要求
    - 里程要求
    - 打卡点列表
    """
    try:
        async with SunRunService(
            token=request.token,
            stu_number=request.stu_number,
            school_id=request.school_id,
            campus_id=request.campus_id
        ) as service:
            task = await service.get_sunrun_task()
            
            if not task.is_success:
                return RunTaskResponse(
                    success=False,
                    message=task.message,
                    data=None
                )
            
            return RunTaskResponse(
                success=True,
                message="获取成功",
                data=task.to_dict()
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取任务失败: {str(e)}")


@router.post("/start")
async def start_run(request: StartRunRequest):
    """
    开始跑步
    
    必须在提交跑步记录前调用此接口
    """
    try:
        async with SunRunService(
            token=request.token,
            stu_number=request.stu_number,
            school_id=request.school_id,
            campus_id=request.campus_id
        ) as service:
            result = await service.start_run()
            
            return {
                "success": result.get("code") == "0",
                "message": result.get("message", ""),
                "data": result
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"开始跑步失败: {str(e)}")


@router.post("/submit", response_model=SubmitRunResponse)
async def submit_run(request: SubmitRunRequest):
    """
    提交跑步记录
    
    自动生成合理的跑步数据并提交。可选参数：
    - km: 指定里程（公里）
    - used_time_minutes: 指定用时（分钟）
    - point_index: 指定打卡点索引
    """

    try:
        # 验证日期不能为未来
        if request.run_date:
            from datetime import datetime
            try:
                run_date_obj = datetime.strptime(request.run_date, "%Y-%m-%d").date()
                if run_date_obj > datetime.now().date():
                    # 自动替换为今天
                    request.run_date = datetime.now().strftime("%Y-%m-%d")
                    # print(f"警告：提交的日期 {run_date_obj} 是未来日期，已自动修正为今天 {request.run_date}")
            except ValueError:
                # 日期格式错误交给后续逻辑处理
                pass

        async with SunRunService(
            token=request.token,
            stu_number=request.stu_number,
            school_id=request.school_id,
            campus_id=request.campus_id
        ) as service:
            # 1. 获取任务
            task = await service.get_sunrun_task()
            if not task.is_success:
                return SubmitRunResponse(
                    success=False,
                    message=f"获取任务失败: {task.message}",
                    scantron_id=None,
                    data=None
                )
            
            # 2. 开始跑步
            start_result = await service.start_run()
            if start_result.get("code") != "0":
                return SubmitRunResponse(
                    success=False,
                    message=f"开始跑步失败: {start_result.get('message', '')}",
                    scantron_id=None,
                    data=None
                )
            
            # 3. 提交记录
            result1, result2, run_info = await service.submit_complete_run(
                task=task,
                campus_name=request.campus_name,
                km=request.km,
                used_time_minutes=request.used_time_minutes,
                point_index=request.point_index,
                run_date=request.run_date,
                run_time=request.run_time
            )
            
            if result1.get("code") != "0":
                return SubmitRunResponse(
                    success=False,
                    message=f"提交基础记录失败: {result1.get('message', '')}",
                    scantron_id=None,
                    data=run_info
                )
            
            if result2 and result2.get("code") != "0":
                return SubmitRunResponse(
                    success=False,
                    message=f"提交轨迹详情失败: {result2.get('message', '')}",
                    scantron_id=run_info.get("scantronId"),
                    data=run_info
                )
            
            return SubmitRunResponse(
                success=True,
                message="跑步记录提交成功",
                scantron_id=run_info.get("scantronId"),
                data=run_info
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"提交跑步记录失败: {str(e)}")


@router.post("/records", response_model=RunRecordsResponse)
async def get_run_records(request: RunRecordsRequest):
    """
    获取跑步记录列表
    
    如果提供了 school_id 和 campus_id，会获取任务信息并按日期范围筛选记录
    """
    try:
        async with SunRunService(
            token=request.token,
            stu_number=request.stu_number,
            school_id=request.school_id or "",
            campus_id=request.campus_id or ""
        ) as service:
            # 获取跑步记录
            result = await service.get_sunrun_sport(
                run_type=request.run_type,
                month_id=request.month_id,
                page_number=request.page_number,
                row_number=request.row_number
            )
            
            if result.get("code") != "0":
                return RunRecordsResponse(
                    success=False,
                    message=result.get("message", "获取失败"),
                    total=0,
                    records=[]
                )
            
            records = result.get("runList", [])
            task_info = None
            
            # 如果有 school_id 和 campus_id，获取任务信息并过滤记录
            if request.school_id and request.campus_id:
                try:
                    task = await service.get_sunrun_task()
                    if task.is_success:
                        task_info = {
                            "startDate": task.start_date,
                            "endDate": task.end_date,
                            "mileage": task.mileage
                        }
                        
                        # 按日期范围过滤记录
                        filtered_records = []
                        for record in records:
                            record_day = record.get("day", "")
                            if record_day and task.start_date and task.end_date:
                                if task.start_date <= record_day <= task.end_date:
                                    filtered_records.append(record)
                        records = filtered_records
                except Exception:
                    # 获取任务失败不影响记录返回
                    pass
            
            return RunRecordsResponse(
                success=True,
                message="获取成功",
                total=len(records),
                records=records,
                task_info=task_info
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取记录失败: {str(e)}")


@router.post("/bulk", response_model=BulkRunResponse)
async def bulk_run(request: BulkRunRequest):
    """
    批量跑步 - 一键补齐剩余次数
    
    根据当前任务的日期范围（startDate ~ endDate）和时间范围（startTime ~ endTime），
    在未跑的日期中随机选择日期，并在每天的时间范围内生成随机开始时间。
    """
    import random
    from datetime import datetime, timedelta
    
    if request.count <= 0:
        return BulkRunResponse(
            success=False,
            message="跑步次数必须大于0",
            total_submitted=0,
            results=[]
        )
    
    try:
        async with SunRunService(
            token=request.token,
            stu_number=request.stu_number,
            school_id=request.school_id,
            campus_id=request.campus_id
        ) as service:
            # 1. 获取任务信息
            task = await service.get_sunrun_task()
            if not task.is_success:
                return BulkRunResponse(
                    success=False,
                    message=f"获取任务失败: {task.message}",
                    total_submitted=0,
                    results=[]
                )
            
            # 2. 获取已有跑步记录
            records_result = await service.get_sunrun_sport(row_number="200")
            existing_days = set()
            if records_result.get("code") == "0":
                for record in records_result.get("runList", []):
                    record_day = record.get("day", "")
                    if record_day and task.start_date <= record_day <= task.end_date:
                        existing_days.add(record_day)
            
            # 3. 生成可用日期列表（在日期范围内且未跑的日期，且必须在今天之前）
            start_date = datetime.strptime(task.start_date, "%Y-%m-%d")
            end_date = datetime.strptime(task.end_date, "%Y-%m-%d")
            
            # 确保只选择今天之前的日期
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday = today - timedelta(days=1)
            # 取 end_date 和 昨天 的较小值作为实际结束日期
            actual_end_date = min(end_date, yesterday)
            
            if actual_end_date < start_date:
                return BulkRunResponse(
                    success=False,
                    message="任务日期范围内没有可补跑的日期（必须是今天之前的日期）",
                    total_submitted=0,
                    results=[]
                )
            
            all_dates = []
            current_date = start_date
            while current_date <= actual_end_date:
                date_str = current_date.strftime("%Y-%m-%d")
                if date_str not in existing_days:
                    all_dates.append(date_str)
                current_date += timedelta(days=1)
            
            # 4. 解析时间范围
            try:
                start_time_parts = task.start_time.split(":")
                end_time_parts = task.end_time.split(":")
                start_hour, start_min = int(start_time_parts[0]), int(start_time_parts[1])
                end_hour, end_min = int(end_time_parts[0]), int(end_time_parts[1])
            except:
                # 默认时间范围 06:00 ~ 22:00
                start_hour, start_min = 6, 0
                end_hour, end_min = 22, 0
            
            # 计算时间范围（分钟）
            start_minutes = start_hour * 60 + start_min
            end_minutes = end_hour * 60 + end_min
            if end_minutes <= start_minutes:
                end_minutes = start_minutes + 60  # 至少1小时范围
            
            # 5. 随机选择日期并提交
            count_to_submit = min(request.count, len(all_dates))
            if count_to_submit <= 0:
                return BulkRunResponse(
                    success=False,
                    message="没有可用的日期进行跑步（所有日期已有记录或日期范围已过）",
                    total_submitted=0,
                    results=[]
                )
            
            # 随机选择日期
            selected_dates = random.sample(all_dates, count_to_submit)
            selected_dates.sort()  # 按日期排序
            
            results = []
            success_count = 0
            
            for run_date in selected_dates:
                # 为每天生成随机开始时间
                # 跑步加用时约30-45分钟，所以结束时间要减去这个时间
                time_range_minutes = end_minutes - start_minutes - 45
                if time_range_minutes < 30:
                    time_range_minutes = 30
                
                random_minutes = random.randint(start_minutes, start_minutes + time_range_minutes)
                run_hour = random_minutes // 60
                run_min = random_minutes % 60
                run_sec = random.randint(0, 59)
                run_time = f"{run_hour:02d}:{run_min:02d}:{run_sec:02d}"
                
                try:
                    # 开始跑步
                    start_result = await service.start_run()
                    if start_result.get("code") != "0":
                        results.append({
                            "date": run_date,
                            "time": run_time,
                            "success": False,
                            "message": f"开始跑步失败: {start_result.get('message', '')}"
                        })
                        continue
                    
                    # 提交跑步记录
                    result1, result2, run_info = await service.submit_complete_run(
                        task=task,
                        campus_name=request.campus_name,
                        run_date=run_date,
                        run_time=run_time
                    )
                    
                    if result1.get("code") == "0":
                        success_count += 1
                        results.append({
                            "date": run_date,
                            "time": run_time,
                            "success": True,
                            "message": "提交成功",
                            "km": run_info.get("km"),
                            "usedTime": run_info.get("usedTime")
                        })
                    else:
                        results.append({
                            "date": run_date,
                            "time": run_time,
                            "success": False,
                            "message": result1.get("message", "提交失败")
                        })
                except Exception as e:
                    results.append({
                        "date": run_date,
                        "time": run_time,
                        "success": False,
                        "message": str(e)
                    })
            
            return BulkRunResponse(
                success=success_count > 0,
                message=f"成功提交 {success_count}/{count_to_submit} 次跑步记录",
                total_submitted=success_count,
                results=results
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量跑步失败: {str(e)}")

