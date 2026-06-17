import {
  getExistingDays,
  submitDates,
  validateSelectedDates,
} from '../../../../lib/server/bulk';
import { BULK_INTERVAL_LIMIT_SECONDS, BULK_SYNC_LIMIT } from '../../../../lib/server/config';
import { json, readJson, serverError } from '../../../../lib/server/http';
import { SunRunService } from '../../../../lib/server/service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const dates = Array.isArray(body.dates) ? body.dates : [];

    if (!dates.length) {
      return json({
        success: false,
        message: '至少需要选择一个日期',
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
    const { validDates, skippedDates } = validateSelectedDates(dates, task, existingDays);

    if (!validDates.length) {
      return json({
        success: false,
        message: `没有有效的日期可跑（${skippedDates.length} 个日期被跳过）`,
        total_submitted: 0,
        results: skippedDates.map((item) => ({
          date: item.date,
          success: false,
          message: item.reason,
        })),
      });
    }

    const intervalSeconds = Math.min(
      Number(body.interval_seconds) || 0,
      BULK_INTERVAL_LIMIT_SECONDS
    );
    const { successCount, attemptedCount, results } = await submitDates({
      service,
      task,
      campusName: body.campus_name,
      dates: validDates,
      intervalSeconds,
      skippedDates,
    });

    const deferredCount = Math.max(0, validDates.length - BULK_SYNC_LIMIT);
    const suffix = deferredCount > 0 ? `；${deferredCount} 个日期超过 Vercel 同步限制，已标记为未处理` : '';

    return json({
      success: successCount > 0,
      message: `成功提交 ${successCount}/${attemptedCount} 次跑步记录${suffix}`,
      total_submitted: successCount,
      results,
    });
  } catch (error) {
    return serverError('批量跑步V2失败', error);
  }
}
