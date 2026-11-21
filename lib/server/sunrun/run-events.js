import { createHash, randomUUID } from 'node:crypto';

const MESSAGE_LIMIT = 500;

function definedEntries(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''));
}

function safeText(value, limit = 160) {
  const text = typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
  return text ? text.slice(0, limit) : undefined;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function userKey(input) {
  const schoolCode = safeText(input?.schoolCode);
  const studentNumber = safeText(input?.stuNumber);
  if (!schoolCode || !studentNumber) return undefined;
  return createHash('sha256')
    .update(`${schoolCode}\0${studentNumber}`)
    .digest('base64url');
}

function redactMessage(value, sensitiveValues = []) {
  let text = String(value || '未知错误')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/(\btoken\b\s*[:=]\s*)[^\s,;}]+/gi, '$1[REDACTED]')
    .replace(/[\r\n\t]+/g, ' ');
  for (const valueToRedact of sensitiveValues) {
    const secret = typeof valueToRedact === 'string' ? valueToRedact.trim() : '';
    if (secret.length >= 3) text = text.replaceAll(secret, '[REDACTED]');
  }
  return text.trim().slice(0, MESSAGE_LIMIT);
}

export function createRunLogContext(input, options = {}) {
  const plannedMeters = safeNumber(options.plan?.targetMeters);
  const taskMileage = safeNumber(input?.task?.mileage);
  const plannedKm = plannedMeters !== undefined
    ? (plannedMeters / 1000).toFixed(2)
    : taskMileage?.toFixed(2);

  return definedEntries({
    request_id: safeText(options.jobId, 128) || randomUUID(),
    user_key: userKey(input),
    school_code: safeText(input?.schoolCode, 64),
    input: definedEntries({
      task_id: safeText(input?.task?.taskId, 128),
      route_id: safeText(input?.route?.pointId, 128),
      route_name: safeText(input?.route?.pointName, 160),
      planned_km: plannedKm,
      planned_duration_seconds: safeNumber(options.plan?.durationSeconds),
    }),
  });
}

export function runFailureDetails(error, fallbackStage = 'unknown', sensitiveValues = []) {
  const upstream = definedEntries({
    path: safeText(error?.endpoint, 256),
    http_status: safeNumber(error?.httpStatus),
    business_status: safeText(error?.businessStatus, 64),
    business_code: safeText(error?.businessCode, 64),
  });
  return definedEntries({
    stage: safeText(error?.stage, 64) || fallbackStage,
    upstream: Object.keys(upstream).length ? upstream : undefined,
    error: {
      kind: safeText(error?.kind, 64) || 'unexpected',
      message: redactMessage(error?.message, sensitiveValues),
    },
    elapsed_ms: safeNumber(error?.elapsedMs),
  });
}

export function logRunEvent(name, context, details = {}, options = {}) {
  const record = {
    schema_version: 1,
    timestamp: (options.now || new Date()).toISOString(),
    event: name,
    ...context,
    ...details,
  };
  const line = JSON.stringify(record);
  const sink = options.sink || (name === 'run.failed' ? console.error : console.info);
  sink(line);
  return record;
}
