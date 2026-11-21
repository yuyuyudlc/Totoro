import { json, readJson, serverError } from '../../../../lib/server/core/http.js';
import { serviceFromBody } from '../../../../lib/server/sunrun/sunrun-service.js';

export const runtime = 'nodejs';

export async function POST(request) {
  let service;
  try {
    service = serviceFromBody(await readJson(request));
  } catch (error) {
    return json({ success: false, message: `获取任务失败: ${error.message}` }, { status: 400 });
  }
  try {
    return json({ success: true, tasks: await service.getSunrunTasks() });
  } catch (error) {
    return serverError('获取任务失败', error);
  }
}

