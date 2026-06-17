import { json, serverError } from '../../../../../lib/server/http';
import { LoginService } from '../../../../../lib/server/service';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const { uuid } = await params;
    const service = new LoginService();
    return json(await service.pollScanStatus(uuid));
  } catch (error) {
    return serverError('轮询失败', error);
  }
}
