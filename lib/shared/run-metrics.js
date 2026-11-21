const STRIDE_LIMITS = Object.freeze({ min: 0.75, max: 1.7 });
const CADENCE_LIMITS = Object.freeze({ min: 138, max: 188 });

export const STRIDE_METERS = STRIDE_LIMITS;
export const CADENCE_SPM = CADENCE_LIMITS;

const pad = value => String(value).padStart(2, '0');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function parseUsedTime(value) {
  const parts = String(value ?? '').trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !Number.isInteger(part) || part < 0)) return null;
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  if (minutes > 59 || seconds > 59 || hours > 6) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

// 里程输入最多两位小数，多余的字符和小数位直接丢掉。
export function sanitizeMileageInput(value) {
  const cleaned = String(value ?? '').replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (!rest.length) return whole;
  return `${whole}.${rest.join('').slice(0, 2)}`;
}

export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds % 60)}`;
}

export function formatPace(seconds, km) {
  const pace = Math.round(seconds / km);
  return `${Math.floor(pace / 60)}'${pad(pace % 60)}"`;
}

export function cadenceForSpeed(speed) {
  return speed > 0 ? clamp(152 + (speed - 2.6) * 16, CADENCE_LIMITS.min, CADENCE_LIMITS.max) : CADENCE_LIMITS.min;
}

export function strideForSpeed(speed) {
  if (!(speed > 0)) return STRIDE_LIMITS.min;
  return Number(clamp(speed * 60 / cadenceForSpeed(speed), STRIDE_LIMITS.min, STRIDE_LIMITS.max).toFixed(3));
}

// 里程、用时、配速、步数共用一套换算，服务端生成与前端预览必须完全一致。
export function summarizeMetrics({ meters, durationSeconds }) {
  const km = meters / 1000;
  const strideMeters = strideForSpeed(meters / durationSeconds);
  return {
    km: km.toFixed(2),
    usedTime: formatDuration(durationSeconds),
    avgSpeed: formatPace(durationSeconds, km),
    steps: String(Math.round(meters / strideMeters)),
    strideMeters,
  };
}
