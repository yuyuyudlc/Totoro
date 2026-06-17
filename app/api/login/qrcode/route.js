import { json, serverError } from '../../../../lib/server/http';
import { LoginService } from '../../../../lib/server/service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const service = new LoginService();
    return json(await service.getQRCode());
  } catch (error) {
    return serverError('获取二维码失败', error);
  }
}
