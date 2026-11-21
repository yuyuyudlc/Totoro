import { json, readJson } from '../../../../lib/server/core/http.js';
import { loginWithToken, TokenLoginError } from '../../../../lib/server/auth/token-login.js';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const body = await readJson(request);
    const data = await loginWithToken(body?.token);
    return json({ success: true, message: '登录成功', data }, { headers });
  } catch (error) {
    return json({ success: false, message: error instanceof TokenLoginError ? error.message : '验证服务暂时不可用，请稍后重试', data: null },
      { status: error instanceof TokenLoginError ? error.status : 502, headers });
  }
}
