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
    const body = await readJson(request);
    if (typeof body?.point_id !== 'string' || !body.point_id.trim()) {
      throw new MorningSignError('请选择早操点位');
    }
    const service = morningSignServiceFromBody(body);
    const result = await service.submit({
      pointId: body.point_id,
      phoneInfo: request.headers.get('user-agent') || 'Totoro/Web',
    });
    return json({ success: true, result }, { headers });
  } catch (error) {
    return json({ success: false, message: error.message }, {
      status: error instanceof MorningSignError ? error.status : 502,
      headers,
    });
  }
}
