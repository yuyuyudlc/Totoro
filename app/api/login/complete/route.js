import { json, readJson, serverError } from '../../../../lib/server/http';
import { LoginService } from '../../../../lib/server/service';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await readJson(request);
    const service = new LoginService();
    const loginInfo = await service.completeLogin(
      body.wx_code,
      body.longitude || '116.397428',
      body.latitude || '39.908823'
    );

    if (!loginInfo.isSuccess) {
      return json({ success: false, message: loginInfo.message, data: null });
    }

    const data = { ...loginInfo };
    delete data.isSuccess;
    return json({ success: true, message: '登录成功', data });
  } catch (error) {
    return serverError('登录失败', error);
  }
}
