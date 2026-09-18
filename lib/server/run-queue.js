import { createHash, randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { completeRun } from './start-run.js';
import { summarizeRunPlan } from './run-data.js';

export const RUN_QUEUE_NAME = 'totoro-live-run';

const JOB_NAME = 'execute-live-run';
const JOB_SCHEMA_VERSION = 4;
const QUEUE_KEY = Symbol.for('totoro.liveRunQueue');
const ALLOWED_TRACK_KEYS = ['routeName', 'km', 'usedTime', 'avgSpeed', 'steps', 'deviceModel', 'fitDegree'];

function identityFingerprint(identity) {
  if (!identity?.stuNumber || !identity?.schoolCode) throw new Error('缺少队列身份资料');
  return createHash('sha256')
    .update(`${identity.schoolCode}\0${identity.stuNumber}`)
    .digest('base64url');
}

function sanitizedTrack(track) {
  if (!track || typeof track !== 'object') throw new Error('缺少跑步预览摘要');
  return Object.fromEntries(ALLOWED_TRACK_KEYS.filter(key => track[key] !== undefined).map(key => [key, track[key]]));
}

export function validateRedisUrl(value) {
  if (!value) throw new Error('延迟队列需要配置 REDIS_URL');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('REDIS_URL 不是有效 URL');
  }
  if (!['redis:', 'rediss:'].includes(parsed.protocol)) {
    throw new Error('REDIS_URL 必须使用 Redis 的 redis: 或 rediss: 协议');
  }
  return parsed;
}

export function buildDelayedRunJob({ input, plan, session, track }, options = {}) {
  const durationSeconds = Number(plan?.durationSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('预览用时无效');
  if (!session?.scantronId) throw new Error('缺少已创建的跑步场次');
  const runStartedAt = new Date(session.runStartedAt);
  if (Number.isNaN(runStartedAt.getTime())) throw new Error('跑步场次开始时间无效');

  const now = options.now || new Date();
  const scheduledAt = new Date(runStartedAt.getTime() + Math.round(durationSeconds * 1000));
  const delayMs = Math.max(1000, scheduledAt.getTime() - now.getTime());
  const jobId = options.jobId || randomUUID();
  const fingerprint = identityFingerprint(input);
  return {
    jobId,
    delayMs,
    scheduledAt: scheduledAt.toISOString(),
    data: {
      schemaVersion: JOB_SCHEMA_VERSION,
      jobId,
      identityFingerprint: fingerprint,
      scheduledAt: scheduledAt.toISOString(),
      track: sanitizedTrack(track),
      payload: {
        input,
        plan,
        session: {
          scantronId: session.scantronId,
          runStartedAt: runStartedAt.toISOString(),
          preferredBaseUrl: session.preferredBaseUrl,
        },
      },
    },
    track: sanitizedTrack(track),
  };
}

function createRedisConnection(env, worker = false) {
  const url = validateRedisUrl(env.REDIS_URL).toString();
  return new Redis(url, {
    maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker,
  });
}

export function getRunQueue(env = process.env) {
  if (!globalThis[QUEUE_KEY]) {
    const connection = createRedisConnection(env);
    globalThis[QUEUE_KEY] = new Queue(RUN_QUEUE_NAME, { connection });
  }
  return globalThis[QUEUE_KEY];
}

export async function enqueueDelayedRun(input, options = {}) {
  const env = options.env || process.env;
  const built = buildDelayedRunJob(input, { ...options, env });
  const queue = options.queue || getRunQueue(env);
  await queue.add(JOB_NAME, built.data, {
    jobId: built.jobId,
    delay: built.delayMs,
    attempts: 1,
    removeOnComplete: { age: 60 * 60 },
    removeOnFail: { age: 24 * 60 * 60 },
  });
  return {
    mode: 'queued',
    jobId: built.jobId,
    scantronId: built.data.payload.session.scantronId,
    scheduledAt: built.scheduledAt,
    track: built.track,
  };
}

export async function getDelayedRunJobStatus(jobId, identity, options = {}) {
  const queue = options.queue || getRunQueue(options.env || process.env);
  const job = await queue.getJob(String(jobId || ''));
  if (!job) throw new Error('延迟任务不存在或已清理');
  if (job.data?.identityFingerprint !== identityFingerprint(identity)) {
    throw new Error('无权查看此延迟任务');
  }
  const state = await job.getState();
  return {
    jobId: String(jobId),
    state,
    result: state === 'completed' ? job.returnvalue : null,
    failedReason: state === 'failed' ? (job.failedReason || '延迟任务处理失败') : null,
  };
}

export async function getStudentRunJobs(identity, options = {}) {
  const queue = options.queue || getRunQueue(options.env || process.env);
  const fingerprint = identityFingerprint(identity);
  const jobs = await queue.getJobs(['delayed', 'waiting', 'active'], 0, 99, false);
  const owned = jobs.filter(job => job.data?.identityFingerprint === fingerprint);
  const results = await Promise.all(owned.map(async job => {
    const payload = job.data?.payload;
    const track = job.data?.track || summarizeRunPlan({
      task: payload?.input?.task,
      route: payload?.input?.route,
      plan: payload?.plan,
    });
    return {
      jobId: String(job.id),
      state: await job.getState(),
      scheduledAt: job.data?.scheduledAt || new Date(job.timestamp + job.delay).toISOString(),
      track: sanitizedTrack(track),
    };
  }));
  return results.sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));
}

export async function processDelayedRunJob(job, options = {}) {
  if (job?.name !== JOB_NAME || job.data?.schemaVersion !== JOB_SCHEMA_VERSION) {
    throw new Error('不支持的延迟任务');
  }
  const payload = job.data?.payload;
  if (!payload?.input || !payload?.plan || !payload?.session?.scantronId || !payload?.session?.runStartedAt) {
    throw new Error('延迟任务载荷不完整');
  }
  if (identityFingerprint(payload.input) !== job.data.identityFingerprint) {
    throw new Error('延迟任务身份校验失败');
  }
  const runStartedAt = new Date(payload.session.runStartedAt);
  if (Number.isNaN(runStartedAt.getTime())) throw new Error('延迟任务开始时间无效');
  const completeRunImpl = options.completeRunImpl || completeRun;
  return completeRunImpl(payload.input, payload.session, {
    plan: payload.plan,
    preferredBaseUrl: payload.session.preferredBaseUrl,
  });
}

export function createRunWorker(env = process.env) {
  const connection = createRedisConnection(env, true);
  const worker = new Worker(
    RUN_QUEUE_NAME,
    job => processDelayedRunJob(job, { env }),
    { connection },
  );
  return {
    worker,
    async close() {
      await worker.close();
      await connection.quit();
    },
  };
}
