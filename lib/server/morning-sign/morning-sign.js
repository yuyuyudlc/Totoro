import {
  constants,
  createPublicKey,
  publicEncrypt,
} from 'node:crypto';
import { fetchMiniProgram } from '../core/miniprogram-fetch.js';

const TASK_PATH = '/wxxcx/platform/mornSign/getMornSignPaper';
const SUBMIT_PATH = '/wxxcx/platform/mornSign/morningExercises';
const PUBLIC_KEY_DER = 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC/dTvkr4EMAVX2Op39VYwufkOG1X6bDIXY8SPwOAujssdHuj/AbJKKAPAHYfNKFSt6IsPKNJcQRd94B1cc1Qb+AHOR+Zj4QnfGU7JLw0W2NrobGX3i6wBJCgxmvXqKDp+7fXs/r1zo76krrIj+bEEHKo3hPbLKaI1Xw9B1mFPUEQIDAQAB';
const PUBLIC_KEY = createPublicKey({
  key: Buffer.from(PUBLIC_KEY_DER, 'base64'),
  format: 'der',
  type: 'spki',
});

export class MorningSignError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'MorningSignError';
    this.status = status;
  }
}

function requiredString(value, message) {
  const result = String(value || '').trim();
  if (!result) throw new MorningSignError(message);
  return result;
}

function splitUtf8(value, maxBytes) {
  const chunks = [];
  let chunk = '';
  let byteLength = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (byteLength + characterBytes > maxBytes) {
      chunks.push(chunk);
      chunk = character;
      byteLength = characterBytes;
    } else {
      chunk += character;
      byteLength += characterBytes;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

export function encryptMorningPayload(value) {
  const text = String(value || '');
  if (!text) throw new MorningSignError('早操签到参数不能为空');
  const encrypted = splitUtf8(text, 117).map(chunk => publicEncrypt({
    key: PUBLIC_KEY,
    padding: constants.RSA_PKCS1_PADDING,
  }, Buffer.from(chunk, 'utf8')));
  return Buffer.concat(encrypted).toString('base64');
}

export function formatShanghaiDateTime(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}:${fields.second}`;
}

export function normalizeMorningTask(result, { includeSecrets = false } = {}) {
  const points = Array.isArray(result?.signPointList) ? result.signPointList : [];
  return {
    status: String(result?.status ?? ''),
    code: String(result?.code ?? ''),
    message: String(result?.message || result?.msg || ''),
    signType: String(result?.signType ?? '0'),
    startDate: String(result?.startDate || ''),
    endDate: String(result?.endDate || ''),
    startTime: String(result?.startTime || ''),
    endTime: String(result?.endTime || ''),
    offsetRange: String(result?.offsetRange || ''),
    dayNeedSignCount: String(result?.dayNeedSignCount || '0'),
    dayCompSignCount: String(result?.dayCompSignCount || '0'),
    minTimeInterval: String(result?.minTimeInterval || '0'),
    signPointList: points.map(point => ({
      taskId: String(point?.taskId || ''),
      pointId: String(point?.pointId || ''),
      pointName: String(point?.pointName || '未命名点位'),
      ...(includeSecrets ? {
        longitude: String(point?.longitude || ''),
        latitude: String(point?.latitude || ''),
        qrCode: String(point?.qrCode || ''),
      } : {}),
    })),
  };
}

export class MorningSignService {
  constructor({ token, stuNumber }, {
    fetchImpl = fetch,
    encryptPayload = encryptMorningPayload,
    now = () => new Date(),
  } = {}) {
    this.token = requiredString(token, '缺少小程序接口 Token');
    this.stuNumber = requiredString(stuNumber, '缺少学号');
    this.fetch = fetchImpl;
    this.encryptPayload = encryptPayload;
    this.now = now;
  }

  async post(endpoint, body) {
    const response = await fetchMiniProgram(endpoint, {
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    }, { fetchImpl: this.fetch });
    if (!response.ok) throw new MorningSignError(`早操接口请求失败: HTTP ${response.status}`, 502);
    return response.json().catch(() => {
      throw new MorningSignError('早操接口未返回有效 JSON', 502);
    });
  }

  async getTask({ includeSecrets = false } = {}) {
    const result = await this.post(TASK_PATH, {
      stuNumber: this.stuNumber,
      token: this.token,
    });
    if (String(result?.status ?? '') !== '00') {
      throw new MorningSignError(result?.message || result?.msg || '获取早操任务失败', 502);
    }
    return normalizeMorningTask(result, { includeSecrets });
  }

  async submit({ pointId, phoneInfo } = {}) {
    const selectedPointId = requiredString(pointId, '请选择早操点位');
    const task = await this.getTask({ includeSecrets: true });
    const point = task.signPointList.find(item => item.pointId === selectedPointId);
    if (!point) throw new MorningSignError('所选点位不在当前早操任务中');
    if (!point.taskId || !point.latitude || !point.longitude || !point.qrCode) {
      throw new MorningSignError('当前早操点位资料不完整，无法提交', 422);
    }

    const payload = {
      taskId: point.taskId,
      iLocalSubmit: '0',
      signDate: formatShanghaiDateTime(this.now()),
      stuNumber: this.stuNumber,
      token: this.token,
      phoneNumber: '',
      qrCode: point.qrCode,
      headImage: '',
      baseStation: '',
      longitude: point.longitude,
      latitude: point.latitude,
      phoneInfo: String(phoneInfo || 'Totoro/Web').slice(0, 512),
      mac: '',
      pointId: point.pointId,
      appVersion: '1.0.0',
      signType: task.signType || '0',
    };
    const result = await this.post(SUBMIT_PATH, {
      encryptParams: this.encryptPayload(JSON.stringify(payload)),
    });
    const accepted = String(result?.code ?? '') === '0';
    return {
      accepted,
      status: String(result?.status ?? ''),
      code: String(result?.code ?? ''),
      message: String(result?.message || result?.msg || (accepted ? '打卡成功' : '早操签到失败')),
      submittedAt: payload.signDate,
      pointId: point.pointId,
      pointName: point.pointName,
    };
  }
}

export function morningSignServiceFromBody(body) {
  return new MorningSignService({
    token: body?.token,
    stuNumber: body?.stu_number,
  });
}
