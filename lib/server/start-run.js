import { fetchMiniProgram } from './miniprogram-fetch.js';
import { buildRouteFreeFixture, buildRunFixture } from './run-data.js';

const PATHS = {
  time: '/wxxcx/platform/camera/currentTimeMillis', config: '/wxxcx/platform/sunrunFace/selectSunRunStartConfiguration',
  camera: '/wxxcx/platform/camera/getCameraConfig', random: '/wxxcx/platform/sunrunFace/selectSunRunRandomConfiguration',
  check: '/wxxcx/platform/sunrunFace/startUpNote', begin: '/wxxcx/sunrun/getRunBegin',
  points: '/wxxcx/sunrun/getRunPointList', abnormal: '/wxxcx/sunrun/getRunPointListAbnormal',
  exercise: '/wxxcx/sunrun/sunRunExercises', detail: '/wxxcx/platform/recrecord/sunRunExercisesDetail',
};

const ENDPOINT_STAGES = new Map([
  [PATHS.time, 'server_time'],
  [PATHS.config, 'start_configuration'],
  [PATHS.camera, 'camera_configuration'],
  [PATHS.random, 'random_configuration'],
  [PATHS.check, 'startup_check'],
  [PATHS.begin, 'get_run_begin'],
  [PATHS.points, 'run_points'],
  [PATHS.abnormal, 'run_points_abnormal'],
  [PATHS.exercise, 'submit_exercises'],
  [PATHS.detail, 'submit_detail'],
]);

export class RunFlowError extends Error {
  constructor(message, details = {}, options = {}) {
    super(message, options);
    this.name = 'RunFlowError';
    Object.assign(this, details);
  }
}

function flowError(message, { endpoint, kind, httpStatus, result, elapsedMs }, cause) {
  return new RunFlowError(message, {
    stage: ENDPOINT_STAGES.get(endpoint) || 'unknown_upstream',
    endpoint,
    kind,
    httpStatus,
    businessStatus: result?.status == null ? undefined : String(result.status),
    businessCode: result?.code == null ? undefined : String(result.code),
    elapsedMs,
  }, cause ? { cause } : undefined);
}

function assertSuccessful(result, endpoint, httpStatus, elapsedMs) {
  if (!result || typeof result !== 'object') {
    throw flowError(`${endpoint} 未返回 JSON 对象`, {
      endpoint, kind: 'invalid_response', httpStatus, elapsedMs,
    });
  }
  if (result.status != null && String(result.status) !== '00') {
    throw flowError(result.msg || result.message || `${endpoint} 返回失败`, {
      endpoint, kind: 'business_rejected', httpStatus, result, elapsedMs,
    });
  }
  if (result.code != null && String(result.code) !== '0') {
    throw flowError(result.msg || result.message || `${endpoint} 返回失败`, {
      endpoint, kind: 'business_rejected', httpStatus, result, elapsedMs,
    });
  }
}

function getIdentity(input) {
  const identity = { token: input.token, stuNumber: input.stuNumber, schoolCode: input.schoolCode };
  if (!identity.token || !identity.stuNumber || !identity.schoolCode) throw new Error('缺少账号资料');
  return identity;
}

function buildFixture(input, identity, now, plan) {
  return input.route?.pointId
    ? buildRunFixture({ task: input.task, route: input.route, identity, now }, { plan })
    : buildRouteFreeFixture({ task: input.task, identity, now }, { plan });
}

function createClient(identity, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const baseUrls = options.baseUrl ? [options.baseUrl] : undefined;
  let preferredBaseUrl = options.preferredBaseUrl || options.baseUrl;
  const steps = [];
  return {
    steps,
    get preferredBaseUrl() { return preferredBaseUrl; },
    async post(endpoint, payload) {
      const started = Date.now();
      let response;
      try {
        response = await fetchMiniProgram(endpoint, {
          method: 'POST', cache: 'no-store', redirect: 'error',
          headers: { 'Content-Type': 'application/json;charset=UTF-8', Authorization: `Bearer ${identity.token}` },
          body: JSON.stringify({ ...payload, token: identity.token }),
        }, {
          fetchImpl, baseUrls, preferredBaseUrl,
          onSuccess: origin => { preferredBaseUrl = origin; },
        });
      } catch (error) {
        throw flowError(error.message, {
          endpoint,
          kind: error?.timedOut ? 'upstream_timeout' : 'upstream_connection',
          elapsedMs: Date.now() - started,
        }, error);
      }
      if (!response.ok) {
        throw flowError(`${endpoint} HTTP ${response.status}`, {
          endpoint,
          kind: 'upstream_http',
          httpStatus: response.status,
          elapsedMs: Date.now() - started,
        });
      }
      let result;
      try {
        result = await response.json();
      } catch (error) {
        throw flowError(`${endpoint} 未返回有效 JSON`, {
          endpoint,
          kind: 'invalid_json',
          httpStatus: response.status,
          elapsedMs: Date.now() - started,
        }, error);
      }
      assertSuccessful(result, endpoint, response.status, Date.now() - started);
      steps.push({ endpoint, ok: true, elapsedMs: Date.now() - started,
        status: String(result.status ?? '00'), code: String(result.code ?? '0') });
      return result;
    },
  };
}

export async function prepareRun(input, options = {}) {
  const identity = getIdentity(input);
  const client = createClient(identity, options);
  const hasConfiguredRoute = Boolean(input.route?.pointId);

  const timeResult = await client.post(PATHS.time, {});
  let timeOffset = 0;
  if (timeResult?.body && Number.isFinite(Number(timeResult.body))) {
    timeOffset = Number(timeResult.body) - Date.now();
  }
  const configuration = await client.post(PATHS.config, { snCode: identity.stuNumber });
  let camera;
  if (hasConfiguredRoute) {
    camera = await client.post(PATHS.camera, { lineId: input.route.pointId });
    await client.post(PATHS.random, { lineId: input.route.pointId });
  }
  await client.post(PATHS.check, {});
  if (configuration.body?.sunrunStartFace === '1') {
    throw new RunFlowError('学校要求开跑人脸校验，当前网页无法完成真实人脸采集', {
      stage: 'policy_face_check', kind: 'policy_rejected',
    });
  }
  if (configuration.body?.sunrunPointRandom == '1') {
    throw new RunFlowError('学校启用了随机人脸抽检，当前网页无法完成真实抽检', {
      stage: 'policy_random_face', kind: 'policy_rejected',
    });
  }
  if (camera?.body?.flag) {
    throw new RunFlowError('学校启用了路线摄像头校验，当前网页无法完成真实拍摄', {
      stage: 'policy_camera', kind: 'policy_rejected',
    });
  }

  const runStartedAt = options.now || new Date(Date.now() + timeOffset);
  const fixture = buildFixture(input, identity, runStartedAt, options.plan);
  const begin = await client.post(PATHS.begin, fixture.begin);
  if (!begin.scantronId) throw new Error('创建场次成功响应缺少 scantronId');
  options.onSessionStarted?.({
    mode: 'started',
    scantronId: begin.scantronId,
    runStartedAt: new Date(runStartedAt).toISOString(),
    preferredBaseUrl: client.preferredBaseUrl,
    track: fixture.summary,
  });
  await client.post(PATHS.points, { scantronId: begin.scantronId });
  await client.post(PATHS.abnormal, { scantronId: begin.scantronId });
  return {
    mode: 'started', scantronId: begin.scantronId, runStartedAt: new Date(runStartedAt).toISOString(),
    preferredBaseUrl: client.preferredBaseUrl, track: fixture.summary, steps: client.steps,
  };
}

export async function completeRun(input, session, options = {}) {
  const identity = getIdentity(input);
  if (!session?.scantronId) throw new Error('延迟任务缺少 scantronId');
  const runStartedAt = new Date(session.runStartedAt);
  if (Number.isNaN(runStartedAt.getTime())) throw new Error('延迟任务开始时间无效');
  const fixture = buildFixture(input, identity, runStartedAt, options.plan);
  const client = createClient(identity, { ...options, preferredBaseUrl: options.preferredBaseUrl || session.preferredBaseUrl });
  await client.post(PATHS.exercise, { ...fixture.exercise, scantronId: session.scantronId });
  await client.post(PATHS.detail, { ...fixture.detail, scantronId: session.scantronId });
  return { mode: 'completed', scantronId: session.scantronId, track: fixture.summary, steps: client.steps };
}

export async function startRun(input, options = {}) {
  const prepared = await prepareRun(input, options);
  const completed = await completeRun(input, prepared, options);
  return { ...completed, steps: [...prepared.steps, ...completed.steps] };
}
