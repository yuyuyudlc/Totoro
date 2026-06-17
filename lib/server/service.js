import {
  BASE_URL,
  COMMON_HEADERS,
  WECHAT_APPID,
  WECHAT_BUNDLE_ID,
  WECHAT_HEADERS,
} from './config';
import { rsaEncrypt } from './crypto';
import { makeLoginInfo, makeRunTask } from './models';
import { generateRunData } from './run-data';

async function fetchJson(url, options = {}, timeoutMs = 30000) {
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[upstream] non-ok response', {
      url,
      status: response.status,
      body: text.slice(0, 500),
    });
    throw new Error(`上游请求失败: ${response.status}${text ? ` ${text.slice(0, 120)}` : ''}`);
  }

  try {
    return await response.json();
  } catch (error) {
    const text = await response.text().catch(() => '');
    console.error('[upstream] invalid json response', {
      url,
      message: error.message,
      body: text.slice(0, 500),
    });
    throw new Error(`上游响应不是JSON: ${error.message}`);
  }
}

export class LoginService {
  async getQRCode() {
    const url =
      `https://open.weixin.qq.com/connect/app/qrconnect?appid=${WECHAT_APPID}` +
      `&bundleid=${WECHAT_BUNDLE_ID}&scope=snsapi_userinfo&state=`;
    const response = await fetch(url, { headers: WECHAT_HEADERS, signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      throw new Error(`获取二维码失败: ${response.status}`);
    }

    const html = await response.text();
    const uuidMatch = html.match(/uuid\s*=\s*["']([^"']+)["']/) || html.match(/\/qrcode\/([a-zA-Z0-9_-]+)/);

    if (!uuidMatch) {
      throw new Error('无法从页面中提取 UUID');
    }

    const uuid = uuidMatch[1];
    return {
      qrcode_url: `https://open.weixin.qq.com/connect/qrcode/${uuid}`,
      uuid,
    };
  }

  async pollScanStatus(uuid) {
    const url = `https://long.open.weixin.qq.com/connect/l/qrconnect?uuid=${uuid}&f=json`;

    try {
      const data = await fetchJson(url, { headers: WECHAT_HEADERS }, 8000);
      const wxErrcode = data.wx_errcode ?? 408;
      const wxCode = data.wx_code || '';
      const messages = {
        408: '等待扫码',
        404: '已扫码，请在手机上确认',
        405: '授权成功',
        403: '用户取消授权',
        402: '二维码已过期',
      };

      return {
        status: wxErrcode,
        message: messages[wxErrcode] || `未知状态: ${wxErrcode}`,
        wx_code: wxCode || null,
      };
    } catch {
      return {
        status: 408,
        message: '等待扫码',
        wx_code: null,
      };
    }
  }

  async getServerToken(wechatCode) {
    const body = rsaEncrypt({ code: wechatCode });
    const result = await fetchJson(`${BASE_URL}/app/platform/serverlist/getLesseeServer`, {
      method: 'POST',
      body,
      headers: COMMON_HEADERS,
    });

    if (result.code !== '0') {
      console.error('[login] getServerToken failed', {
        code: result.code,
        message: result.message,
      });
      throw new Error(`获取服务器token失败: ${result.message || '未知错误'}`);
    }

    return result.token || '';
  }

  async login(wechatCode, serverToken, longitude = '116.397428', latitude = '39.908823') {
    const body = rsaEncrypt({
      loginWay: '1',
      phoneNumber: '',
      password: '',
      code: wechatCode,
      longitude,
      latitude,
      token: serverToken,
    });
    const result = await fetchJson(`${BASE_URL}/app/platform/login/login`, {
      method: 'POST',
      body,
      headers: COMMON_HEADERS,
    });

    return makeLoginInfo(result, serverToken);
  }

  async completeLogin(wxCode, longitude, latitude) {
    const serverToken = await this.getServerToken(wxCode);
    return this.login(wxCode, serverToken, longitude, latitude);
  }
}

export class SunRunService {
  constructor({ token, stuNumber, schoolId, campusId }) {
    this.token = token;
    this.stuNumber = stuNumber;
    this.schoolId = schoolId;
    this.campusId = campusId;
  }

  async post(endpoint, data, encrypt = true) {
    const payload = { ...data, token: this.token };
    const options = encrypt
      ? { body: rsaEncrypt(payload), headers: COMMON_HEADERS }
      : { body: JSON.stringify(payload), headers: COMMON_HEADERS };

    return fetchJson(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      ...options,
    });
  }

  async getSunrunTask() {
    const result = await this.post('/app/sunrun/getSunrunPaper', {
      stuNumber: this.stuNumber,
      schoolId: this.schoolId,
      campusId: this.campusId,
    });
    return makeRunTask(result);
  }

  async startRun() {
    return this.post('/app/sunrun/getRunBegin', {
      stuNumber: this.stuNumber,
      schoolId: this.schoolId,
      campusId: this.campusId,
    });
  }

  async getSunrunSport({ runType = '0', monthId = '', pageNumber = '1', rowNumber = '100' } = {}) {
    return this.post('/app/sunrun/getSunrunSport', {
      stuNumber: this.stuNumber,
      runType,
      monthId,
      pageNumber,
      rowNumber,
    });
  }

  async submitRunRecord(runData) {
    return this.post('/app/platform/recrecord/sunRunExercises', runData);
  }

  async submitRunDetail(scantronId, pointList) {
    return this.post(
      '/app/platform/recrecord/sunRunExercisesDetail',
      {
        scantronId,
        stuNumber: this.stuNumber,
        faceData: '',
        pointList,
      },
      false
    );
  }

  async submitCompleteRun({ task, campusName, km, usedTimeMinutes, pointIndex, runDate, runTime }) {
    const runData = generateRunData({
      task,
      stuNumber: this.stuNumber,
      token: this.token,
      campusName,
      km,
      usedTimeMinutes,
      pointIndex,
      runDate,
      runTime,
    });
    const pointList = runData._pointList || [];
    const selectedPoint = runData._selectedPoint || '默认';
    delete runData._pointList;
    delete runData._selectedPoint;

    const result1 = await this.submitRunRecord(runData);

    if (result1.code !== '0') {
      return {
        result1,
        result2: null,
        runInfo: {
          km: runData.km,
          usedTime: runData.usedTime,
          selectedPoint,
          trackPoints: pointList.length,
        },
      };
    }

    const scantronId = result1.scantronId || '';
    const result2 = await this.submitRunDetail(scantronId, pointList);

    return {
      result1,
      result2,
      runInfo: {
        km: runData.km,
        usedTime: runData.usedTime,
        avgSpeed: runData.avgSpeed,
        steps: runData.steps,
        selectedPoint,
        trackPoints: pointList.length,
        scantronId,
      },
    };
  }
}
