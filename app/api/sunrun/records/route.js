import { json, readJson, serverError } from '../../../../lib/server/http';
import { SunRunService } from '../../../../lib/server/service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const service = new SunRunService({
      token: body.token,
      stuNumber: body.stu_number,
      schoolId: body.school_id || '',
      campusId: body.campus_id || '',
    });

    const result = await service.getSunrunSport({
      runType: body.run_type || '0',
      monthId: body.month_id || '',
      pageNumber: body.page_number || '1',
      rowNumber: body.row_number || '100',
    });

    if (result.code !== '0') {
      return json({
        success: false,
        message: result.message || '获取失败',
        total: 0,
        records: [],
      });
    }

    let records = result.runList || [];
    let taskInfo = null;

    if (body.school_id && body.campus_id) {
      try {
        const task = await service.getSunrunTask();
        if (task.isSuccess) {
          taskInfo = {
            startDate: task.startDate,
            endDate: task.endDate,
            mileage: task.mileage,
          };
          records = records.filter((record) => {
            const day = record.day || '';
            return day && task.startDate <= day && day <= task.endDate;
          });
        }
      } catch {
        taskInfo = null;
      }
    }

    return json({
      success: true,
      message: '获取成功',
      total: records.length,
      records,
      task_info: taskInfo,
    });
  } catch (error) {
    return serverError('获取记录失败', error);
  }
}
