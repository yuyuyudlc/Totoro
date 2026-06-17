import { json, readJson, serverError } from '../../../../lib/server/http';
import { SunRunService } from '../../../../lib/server/service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await readJson(request);
    let runDate = body.run_date || null;

    if (runDate && /^\d{4}-\d{2}-\d{2}$/.test(runDate)) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(`${runDate}T00:00:00`) > today) {
        runDate = today.toISOString().slice(0, 10);
      }
    }

    const service = new SunRunService({
      token: body.token,
      stuNumber: body.stu_number,
      schoolId: body.school_id,
      campusId: body.campus_id,
    });

    const task = await service.getSunrunTask();
    if (!task.isSuccess) {
      return json({
        success: false,
        message: `获取任务失败: ${task.message}`,
        scantron_id: null,
        data: null,
      });
    }

    const startResult = await service.startRun();
    if (startResult.code !== '0') {
      return json({
        success: false,
        message: `开始跑步失败: ${startResult.message || ''}`,
        scantron_id: null,
        data: null,
      });
    }

    const { result1, result2, runInfo } = await service.submitCompleteRun({
      task,
      campusName: body.campus_name,
      km: body.km,
      usedTimeMinutes: body.used_time_minutes,
      pointIndex: body.point_index,
      runDate,
      runTime: body.run_time,
    });

    if (result1.code !== '0') {
      return json({
        success: false,
        message: `提交基础记录失败: ${result1.message || ''}`,
        scantron_id: null,
        data: runInfo,
      });
    }

    if (result2 && result2.code !== '0') {
      return json({
        success: false,
        message: `提交轨迹详情失败: ${result2.message || ''}`,
        scantron_id: runInfo.scantronId,
        data: runInfo,
      });
    }

    return json({
      success: true,
      message: '跑步记录提交成功',
      scantron_id: runInfo.scantronId,
      data: runInfo,
    });
  } catch (error) {
    return serverError('提交跑步记录失败', error);
  }
}
