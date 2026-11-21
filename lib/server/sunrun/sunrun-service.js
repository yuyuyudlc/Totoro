import { fetchMiniProgram } from '../core/miniprogram-fetch.js';
import { assertMiniResponse, makeMiniTasks } from './sunrun-models.js';

export function serviceFromBody(body) {
  return new SunRunService({
    token: body.token, stuNumber: body.stu_number,
    campusId: body.campus_id,
  });
}

export class SunRunService {
  constructor({ token, stuNumber, campusId }, { fetchImpl = fetch } = {}) {
    if (typeof token !== 'string' || !token.trim()) throw new Error('缺少小程序接口 Token');
    if (!stuNumber) throw new Error('缺少学号');
    this.token = token;
    this.stuNumber = String(stuNumber);
    this.campusId = String(campusId || '');
    this.fetch = fetchImpl;
  }

  async post(endpoint, data = {}) {
    const response = await fetchMiniProgram(endpoint, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json;charset=UTF-8', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ ...data, token: this.token }),
    }, { fetchImpl: this.fetch });
    if (!response.ok) throw new Error(`小程序接口请求失败: ${response.status}`);
    const result = await response.json().catch(() => { throw new Error('小程序接口未返回有效 JSON'); });
    return assertMiniResponse(result);
  }

  async getSunrunTasks() {
    return makeMiniTasks(await this.post('/wxxcx/sunrun/getSunrunPaper', {
      stuNumber: this.stuNumber, campusId: this.campusId,
    }));
  }
}
