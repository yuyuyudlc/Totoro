import {
  getAvailableDates,
  getExistingDays,
  pickRandomDates,
  submitDates,
} from '../../../../lib/server/bulk';
import { BULK_SYNC_LIMIT } from '../../../../lib/server/config';
import { json, readJson, serverError } from '../../../../lib/server/http';
import { SunRunService } from '../../../../lib/server/service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const count = Number(body.count) || 0;

    if (count <= 0) {
      return json({
        success: false,
        message: '跑步次数必须大于0',
        total_submitted: 0,
        results: [],
      });
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
        total_submitted: 0,
        results: [],
      });
    }

    const recordsResult = await service.getSunrunSport({ rowNumber: '200' });
    const existingDays = getExistingDays(recordsResult, task);
    const availableDates = getAvailableDates(task, existingDays);

    if (!availableDates.length) {
      return json({
        success: false,
        message: '没有可用的日期进行跑步（所有日期已有记录或日期范围已过）',
        total_submitted: 0,
        results: [],
      });
    }

    const selectedDates = pickRandomDates(availableDates, Math.min(count, availableDates.length));
    const { successCount, attemptedCount, results } = await submitDates({
      service,
      task,
      campusName: body.campus_name,
      dates: selectedDates,
    });

    const suffix =
      selectedDates.length > BULK_SYNC_LIMIT ? `；超过 ${BULK_SYNC_LIMIT} 条的日期已标记为未处理` : '';

    return json({
      success: successCount > 0,
      message: `成功提交 ${successCount}/${attemptedCount} 次跑步记录${suffix}`,
      total_submitted: successCount,
      results,
    });
  } catch (error) {
    return serverError('批量跑步失败', error);
  }
}
