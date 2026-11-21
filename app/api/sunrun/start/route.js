import { json, readJson } from '../../../../lib/server/core/http.js';
import { executeConfirmedRun } from '../../../../lib/server/sunrun/confirmed-run.js';
import { verifyRunPreview } from '../../../../lib/server/sunrun/run-preview.js';
import { loginWithToken } from '../../../../lib/server/auth/token-login.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const body = await readJson(request);
    const profile = await loginWithToken(body.token);
    const input = {
      token: profile.token,
      stuNumber: profile.stuNumber,
      schoolCode: profile.schoolCode,
      task: body.task,
      route: body.route,
    };
    const plan = verifyRunPreview(body.preview_token, {
      task: input.task,
      route: input.route,
      identity: input,
    });
    const result = await executeConfirmedRun(input, { plan });
    if (result.mode === 'queued') return json({ success: true, result }, { headers });
    return json({
      success: true,
      result: {
        mode: result.mode,
        scantronId: result.scantronId,
        track: {
          routeName: result.track.routeName,
          km: result.track.km,
          usedTime: result.track.usedTime,
          avgSpeed: result.track.avgSpeed,
          steps: result.track.steps,
          pointCount: result.track.pointCount,
        },
        checks: result.steps,
      },
    }, { headers });
  } catch (error) {
    return json({ success: false, message: `开始跑步失败: ${error.message}` }, { status: 400, headers });
  }
}
