import { json, readJson } from '../../../../lib/server/core/http.js';
import { createRunPreview } from '../../../../lib/server/sunrun/run-preview.js';
import { assertRunnableSelection } from '../../../../lib/server/sunrun/run-window.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const body = await readJson(request);
    assertRunnableSelection(body.task, body.route);
    const preview = createRunPreview({
      task: body.task,
      route: body.route,
      overrides: body.plan,
      deviceId: body.device_id,
      identity: {
        stuNumber: body.stu_number,
        schoolCode: body.school_code || body.school_id,
      },
    });
    return json({ success: true, preview }, { headers });
  } catch (error) {
    return json({ success: false, message: `生成跑步预览失败: ${error.message}` }, { status: 400, headers });
  }
}

