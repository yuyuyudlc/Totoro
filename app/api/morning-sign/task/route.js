import { json, readJson } from '../../../../lib/server/core/http.js';
import {
  MorningSignError,
  morningSignServiceFromBody,
} from '../../../../lib/server/morning-sign/morning-sign.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const service = morningSignServiceFromBody(await readJson(request));
    return json({ success: true, task: await service.getTask() }, { headers });
  } catch (error) {
    return json({ success: false, message: error.message }, {
      status: error instanceof MorningSignError ? error.status : 502,
      headers,
    });
  }
}
