import { json, readJson } from '../../../../lib/server/core/http.js';
import { getDelayedRunJobStatus, getStudentRunJobs } from '../../../../lib/server/sunrun/run-queue.js';
import { loginWithToken } from '../../../../lib/server/auth/token-login.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const body = await readJson(request);
    if (!body.job_id) {
      const profile = await loginWithToken(body.token);
      const jobs = await getStudentRunJobs({
        stuNumber: profile.stuNumber,
        schoolCode: profile.schoolCode,
      });
      return json({ success: true, jobs }, { headers });
    }
    const job = await getDelayedRunJobStatus(body.job_id, {
      stuNumber: body.stu_number,
      schoolCode: body.school_code || body.school_id,
    });
    return json({ success: true, job }, { headers });
  } catch (error) {
    return json({ success: false, message: `查询延迟任务失败: ${error.message}` }, { status: 400, headers });
  }
}
