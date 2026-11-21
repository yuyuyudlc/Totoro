import { createHash } from 'node:crypto';
import {
  REAL_DEVICE_PROFILES,
  findDeviceProfile,
  formatDeviceProfile,
} from '../../shared/device-profiles.js';
import {
  STRIDE_METERS,
  strideForSpeed,
  summarizeMetrics,
} from '../../shared/run-metrics.js';

export { REAL_DEVICE_PROFILES };

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_LATITUDE_DEGREE = 111320;
// 中国标准时间没有夏令时，直接按 +8 小时结算，避免依赖服务器所在时区。
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const OVERSHOOT = Object.freeze({ min: 1.002, max: 1.012 });
const SAMPLE_INTERVAL_SECONDS = Object.freeze({ min: 0.9, max: 1.15 });
const SAMPLE_GAP_SECONDS = Object.freeze({ min: 2, max: 4.5 });
const SAMPLE_GAP_CHANCE = 0.015;
const GPS_SIGMA_METERS = 2.2;
const STOP_SECONDS = Object.freeze({ min: 3, max: 15 });
const DRIFT_METERS = Object.freeze({ min: 40, max: 75 });
const ROUTE_ONE_FALLBACK_POINTS = Object.freeze([
  { longitude: 118.789377, latitude: 31.939196 },
  { longitude: 118.789678, latitude: 31.93925 },
  { longitude: 118.790021, latitude: 31.939232 },
  { longitude: 118.790257, latitude: 31.939123 },
  { longitude: 118.790922, latitude: 31.938559 },
  { longitude: 118.791201, latitude: 31.937703 },
  { longitude: 118.791716, latitude: 31.935809 },
  { longitude: 118.792038, latitude: 31.93468 },
  { longitude: 118.789785, latitude: 31.934225 },
  { longitude: 118.78897, latitude: 31.935791 },
  { longitude: 118.788262, latitude: 31.937065 },
  { longitude: 118.788176, latitude: 31.93814 },
  { longitude: 118.788648, latitude: 31.938832 },
  { longitude: 118.789442, latitude: 31.939214 },
].map(point => Object.freeze(point)));

const pad = value => String(value).padStart(2, '0');
const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const randomBetween = (min, max) => min + (max - min) * Math.random();
const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

export function getRandomDeviceProfile() {
  const profile = REAL_DEVICE_PROFILES[Math.floor(Math.random() * REAL_DEVICE_PROFILES.length)];
  return formatDeviceProfile(profile);
}

export function resolveDeviceProfile({ deviceId, identity } = {}) {
  const explicit = findDeviceProfile(deviceId);
  if (explicit) return explicit;
  const stuNumber = identity?.stuNumber ? String(identity.stuNumber).trim() : '';
  if (stuNumber) {
    const schoolCode = identity?.schoolCode ? String(identity.schoolCode).trim() : '';
    const digest = createHash('sha256').update(`${schoolCode}\0${stuNumber}`).digest();
    const index = digest.readUInt32BE(0) % REAL_DEVICE_PROFILES.length;
    return formatDeviceProfile(REAL_DEVICE_PROFILES[index]);
  }
  return getRandomDeviceProfile();
}

export function calculateRouteSimilarity(trackPoints, routePoints, sampleMeters = 5, thresholdMeters = 25) {
  if (!trackPoints || trackPoints.length < 2 || !routePoints || routePoints.length < 2) return 0;

  const haversine = (lat1, lon1, lat2, lon2) => {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const pointToSegmentDist = (pLat, pLon, aLat, aLon, bLat, bLon) => {
    const latA = Number(aLat), lonA = Number(aLon);
    const latB = Number(bLat), lonB = Number(bLon);
    const dLat = latB - latA;
    const dLon = lonB - lonA;
    const lenSq = dLat * dLat + dLon * dLon;
    let u = lenSq !== 0 ? ((pLat - latA) * dLat + (pLon - lonA) * dLon) / lenSq : -1;
    let nearLat = latA, nearLon = lonA;
    if (u > 1) { nearLat = latB; nearLon = lonB; }
    else if (u > 0) { nearLat = latA + u * dLat; nearLon = lonA + u * dLon; }
    return haversine(pLat, pLon, nearLat, nearLon);
  };

  let matched = 0, total = 0;
  for (let c = 0; c < trackPoints.length - 1; c++) {
    const p1 = trackPoints[c], p2 = trackPoints[c + 1];
    const segDist = haversine(p1.latitude, p1.longitude, p2.latitude, p2.longitude);
    const steps = Math.max(1, Math.ceil(segDist / sampleMeters));

    for (let g = 0; g < steps; g++) {
      const ratio = g / steps;
      const sLat = p1.latitude + (p2.latitude - p1.latitude) * ratio;
      const sLon = p1.longitude + (p2.longitude - p1.longitude) * ratio;
      let minDist = Infinity;

      for (let q = 0; q < routePoints.length - 1; q++) {
        const r1 = routePoints[q], r2 = routePoints[q + 1];
        const d = pointToSegmentDist(sLat, sLon, r1.latitude, r1.longitude, r2.latitude, r2.longitude);
        if (d < minDist) minDist = d;
        if (minDist <= thresholdMeters) break;
      }
      if (minDist <= thresholdMeters) matched++;
      total++;
    }
  }
  return total === 0 ? 0 : Number((matched / total).toFixed(2));
}

export function haversineDistance(pointA, pointB) {
  const lat1 = Number(pointA.latitude) * Math.PI / 180;
  const lat2 = Number(pointB.latitude) * Math.PI / 180;
  const deltaLat = lat2 - lat1;
  const deltaLng = (Number(pointB.longitude) - Number(pointA.longitude)) * Math.PI / 180;
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function distanceOfTrack(points) {
  return points.slice(1).reduce((total, point, index) => total + haversineDistance(points[index], point), 0);
}

function shanghaiDate(date) {
  return new Date(date.getTime() + SHANGHAI_OFFSET_MS);
}

function formatTime(date) {
  const shifted = shanghaiDate(date);
  return `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

function formatDateTime(date) {
  const shifted = shanghaiDate(date);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
    + ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
}

function formatDate(date) {
  const shifted = shanghaiDate(date);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function normalizedRoute(route) {
  const raw = Array.isArray(route?.pointList) && route.pointList.length > 1
    ? route.pointList
    : [{ longitude: route?.longitude, latitude: route?.latitude }];
  const points = raw.map(point => ({
    longitude: number(point.longitude, NaN), latitude: number(point.latitude, NaN),
  }));
  if (points.length < 2 || points.some(point => !Number.isFinite(point.longitude) || !Number.isFinite(point.latitude))) {
    throw new Error('所选路线缺少可用的经纬度轨迹');
  }

  const closingDistance = haversineDistance(points.at(-1), points[0]);
  if (closingDistance <= 150) return [...points, points[0]];
  return [...points, ...points.slice(1, -1).reverse(), points[0]];
}

function interpolate(pointA, pointB, ratio) {
  return {
    longitude: pointA.longitude + (pointB.longitude - pointA.longitude) * ratio,
    latitude: pointA.latitude + (pointB.latitude - pointA.latitude) * ratio,
  };
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalRandom(random) {
  let value;
  do {
    const x = random() * 2 - 1;
    const y = random() * 2 - 1;
    const radius = x * x + y * y;
    value = radius > 0 && radius < 1 ? x * Math.sqrt(-2 * Math.log(radius) / radius) : NaN;
  } while (!Number.isFinite(value) || Math.abs(value) > 3);
  return value;
}

function buildLapMetrics(lap) {
  const lengths = lap.slice(1).map((point, index) => haversineDistance(lap[index], point));
  const cumulative = [0];
  for (const length of lengths) cumulative.push(cumulative.at(-1) + length);
  return { lengths, cumulative, total: cumulative.at(-1) };
}

function pointAtDistance(lap, metrics, distance) {
  const wrapped = ((distance % metrics.total) + metrics.total) % metrics.total;
  let segmentIndex = 0;
  while (segmentIndex < metrics.lengths.length - 1 && wrapped > metrics.cumulative[segmentIndex + 1]) {
    segmentIndex += 1;
  }
  const length = metrics.lengths[segmentIndex] || 0;
  const ratio = length > 0 ? (wrapped - metrics.cumulative[segmentIndex]) / length : 0;
  return interpolate(lap[segmentIndex], lap[segmentIndex + 1], clampValue(ratio, 0, 1));
}

function buildIntervals(durationSeconds, random) {
  const intervals = [];
  let remaining = durationSeconds;
  while (remaining > 1) {
    let seconds = randomBetween(SAMPLE_INTERVAL_SECONDS.min, SAMPLE_INTERVAL_SECONDS.max);
    if (random() < SAMPLE_GAP_CHANCE) {
      seconds = randomBetween(SAMPLE_GAP_SECONDS.min, SAMPLE_GAP_SECONDS.max);
    }
    seconds = Math.min(seconds, remaining);
    if (remaining - seconds < 1) seconds = remaining;
    intervals.push(seconds);
    remaining -= seconds;
  }
  intervals.push(remaining);
  return intervals.filter(seconds => seconds > 0.05);
}

function buildFractions(intervals, random) {
  const stopped = new Set();
  const stopCount = 1 + Math.floor(random() * 3);
  for (let stop = 0; stop < stopCount; stop++) {
    const start = Math.floor(random() * Math.max(1, intervals.length - 3));
    let seconds = randomBetween(STOP_SECONDS.min, STOP_SECONDS.max);
    let index = start;
    while (seconds > 0 && index < intervals.length) {
      stopped.add(index);
      seconds -= intervals[index];
      index += 1;
    }
  }

  let drift = 0;
  const weights = intervals.map((seconds, index) => {
    if (stopped.has(index)) return randomBetween(0.05, 0.4) * seconds;
    drift = drift * 0.9 + (random() - 0.5) * 0.08;
    const pace = clampValue(1 + drift + (random() - 0.5) * 0.12, 0.55, 1.55);
    return pace * seconds;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map(weight => weight / total);
}

function buildGpsNoise(pointCount, random) {
  // 真实 GPS 误差在几秒内高度自相关，用 AR(1) 平滑，避免白噪声把链长抬得离谱。
  const noise = [];
  let north = normalRandom(random) * GPS_SIGMA_METERS;
  let east = normalRandom(random) * GPS_SIGMA_METERS;
  for (let index = 0; index < pointCount; index++) {
    north = north * 0.9 + normalRandom(random) * GPS_SIGMA_METERS * 0.44;
    east = east * 0.9 + normalRandom(random) * GPS_SIGMA_METERS * 0.44;
    noise.push({ north, east, driftNorth: 0, driftEast: 0 });
  }
  // 偶发的多路径漂移：缓慢隆起再回落，幅度受 DRIFT_METERS 限制，相邻点不会瞬移。
  const windows = 1 + Math.floor(random() * 3);
  for (let window = 0; window < windows; window++) {
    const length = 10 + Math.floor(random() * 15);
    const start = Math.floor(random() * Math.max(1, pointCount - length));
    const amplitude = randomBetween(DRIFT_METERS.min, DRIFT_METERS.max);
    const angle = random() * Math.PI * 2;
    for (let offset = 0; offset < length && start + offset < pointCount; offset++) {
      const ratio = Math.sin(((offset + 1) / (length + 1)) * Math.PI);
      const point = noise[start + offset];
      point.driftNorth += Math.sin(angle) * amplitude * ratio;
      point.driftEast += Math.cos(angle) * amplitude * ratio;
      const magnitude = Math.hypot(point.driftNorth, point.driftEast);
      if (magnitude > DRIFT_METERS.max) {
        point.driftNorth *= DRIFT_METERS.max / magnitude;
        point.driftEast *= DRIFT_METERS.max / magnitude;
      }
    }
  }
  return noise;
}

function buildTimestamps(start, intervals, durationSeconds) {
  const startMs = start.getTime();
  const timestamps = [startMs];
  let elapsed = 0;
  for (let index = 0; index < intervals.length; index++) {
    elapsed += intervals[index];
    const value = index === intervals.length - 1
      ? startMs + durationSeconds * 1000
      : startMs + Math.round(elapsed * 1000);
    timestamps.push(Math.max(value, timestamps.at(-1) + 100));
  }
  return timestamps;
}

function buildTrack({ route, targetMeters, durationSeconds, start, random }) {
  const lap = normalizedRoute(route);
  const metrics = buildLapMetrics(lap);
  if (!(metrics.total >= 20)) throw new Error('所选路线轨迹长度不足');

  const intervals = buildIntervals(durationSeconds, random);
  const fractions = buildFractions(intervals, random);
  const noise = buildGpsNoise(fractions.length + 1, random);
  const timestamps = buildTimestamps(start, intervals, durationSeconds);
  const origin = random() * metrics.total;

  const materialize = scale => {
    const points = [];
    let travelled = 0;
    for (let index = 0; index <= fractions.length; index++) {
      const base = pointAtDistance(lap, metrics, origin + travelled);
      const jitter = noise[index];
      const north = jitter.north + jitter.driftNorth;
      const east = jitter.east + jitter.driftEast;
      const latitude = base.latitude + north / METERS_PER_LATITUDE_DEGREE;
      const longitude = base.longitude + east / (METERS_PER_LATITUDE_DEGREE * Math.max(0.01, Math.cos(base.latitude * Math.PI / 180)));
      const rounded = { latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) };
      const previous = points.at(-1);
      if (previous && previous.latitude === rounded.latitude && previous.longitude === rounded.longitude) {
        rounded.longitude = Number((rounded.longitude + 0.000002).toFixed(6));
      }
      points.push(rounded);
      if (index < fractions.length) travelled += fractions[index] * targetMeters * scale;
    }
    return points;
  };

  let along = 1;
  let points = materialize(along);
  // 轨迹里 GPS 抖动和绕行会额外增加长度，量出这部分再把沿路线的行进距离压回目标值。
  for (let attempt = 0; attempt < 2; attempt++) {
    const excess = distanceOfTrack(points) - targetMeters * along;
    const next = clampValue((targetMeters - excess) / targetMeters, 0.6, 1.2);
    if (Math.abs(next - along) < 0.001) break;
    along = next;
    points = materialize(along);
  }
  return { points, timestamps };
}

function normalizeRunPlan(task, plan) {
  const targetMeters = number(plan?.targetMeters, NaN);
  const durationSeconds = number(plan?.durationSeconds, NaN);
  const strideMeters = number(plan?.strideMeters, NaN);
  const device = plan?.device ? {
    ...(plan.device.id ? { id: String(plan.device.id) } : {}),
    version: String(plan.device.version),
    phoneInfo: String(plan.device.phoneInfo),
    deviceModel: String(plan.device.deviceModel || plan.device.phoneInfo),
  } : getRandomDeviceProfile();

  if (!Number.isFinite(targetMeters) || targetMeters < 200 || targetMeters > 50000
    || !Number.isSafeInteger(durationSeconds) || durationSeconds < 60 || durationSeconds > 6 * 3600
    || !Number.isFinite(strideMeters) || strideMeters < STRIDE_METERS.min || strideMeters > STRIDE_METERS.max) {
    throw new Error('跑步预览数据无效');
  }
  return { targetMeters, durationSeconds, strideMeters, device };
}

export function createRunPlan(task, options = {}) {
  const requestedMeters = Math.max(0.2, number(task?.mileage, 3.2)) * 1000;
  const minSeconds = Math.max(60, Math.round(number(task?.minTime, 10) * 60));
  const maxSeconds = Math.max(minSeconds, Math.round(number(task?.maxTime, 25) * 60));
  const lowerDuration = minSeconds + (maxSeconds - minSeconds) * 0.15;
  const upperDuration = minSeconds + (maxSeconds - minSeconds) * 0.85;
  const device = options.device || getRandomDeviceProfile();
  const overrides = options.overrides || null;
  const durationSeconds = overrides
    ? overrides.durationSeconds
    : Math.round(randomBetween(lowerDuration, upperDuration));
  const targetMeters = overrides
    ? overrides.targetMeters
    : Math.round(requestedMeters * randomBetween(OVERSHOOT.min, OVERSHOOT.max));
  const speed = targetMeters / durationSeconds;
  const strideMeters = strideForSpeed(speed);

  return {
    targetMeters,
    durationSeconds,
    strideMeters,
    device,
    customized: Boolean(overrides),
    fitEstimate: Number(randomBetween(0.93, 0.99).toFixed(2)),
  };
}

export function summarizeRunPlan({ task, route, plan }) {
  const normalized = normalizeRunPlan(task, plan);
  const metrics = summarizeMetrics({
    meters: normalized.targetMeters,
    durationSeconds: normalized.durationSeconds,
  });
  const hasRoute = Array.isArray(route?.pointList) && route.pointList.length > 1;
  return {
    routeName: route?.pointName || route?.pointId || '无固定路线',
    km: metrics.km,
    usedTime: metrics.usedTime,
    avgSpeed: metrics.avgSpeed,
    steps: metrics.steps,
    deviceModel: normalized.device?.deviceModel || 'iPhone 14 Pro (iOS 17.5.1)',
    fitDegree: hasRoute ? Number(plan?.fitEstimate ?? 0.96).toFixed(2) : '0.00',
  };
}

export function buildRunFixture({ task, route, identity, now = new Date() }, options = {}) {
  if (!task?.taskId) throw new Error('缺少跑步任务');
  if (!route?.pointId) throw new Error('当前任务未配置跑步路线');
  const plan = normalizeRunPlan(task, options.plan || createRunPlan(task));
  const { durationSeconds, device } = plan;
  const start = new Date(now);
  const end = new Date(start.getTime() + durationSeconds * 1000);
  const random = createRandom(Math.floor(Math.random() * 0xFFFFFFFF));
  const { points, timestamps } = buildTrack({
    route, targetMeters: plan.targetMeters, durationSeconds, start, random,
  });
  const pointList = points.map((point, index) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    time: formatDateTime(new Date(timestamps[index])),
    timestamp: timestamps[index],
  }));
  const metrics = summarizeMetrics({ meters: plan.targetMeters, durationSeconds });
  const { km, usedTime, avgSpeed, steps } = metrics;
  const fitDegree = calculateRouteSimilarity(pointList, route.pointList).toFixed(2);
  const token = identity?.token || '';
  const version = identity?.version || device?.version || '8.0.50';
  const phoneInfo = identity?.phoneInfo || device?.phoneInfo || 'iPhone&iPhone 14 Pro<iPhone15,2>&iOS 17.5.1';

  return {
    begin: {
      runType: 0, version, phoneInfo, paperId: task.taskId, lineId: route.pointId, faceBase64: '',
    },
    exercise: {
      scantronId: '', stuNumber: String(identity?.stuNumber || ''), schoolCode: String(identity?.schoolCode || ''),
      runType: 0, km, usedTime,
      fitDegree, avgSpeed,
      steps, token, version, phoneInfo,
      evaluateDate: formatDate(start), endTime: formatTime(end), startTime: formatTime(start),
      taskId: task.taskId, sunrunPathPointList: route.pointList, flag: '1',
    },
    detail: {
      pointList, gyroscope: [], accelerometer: [], cheatCode: '正常跑步',
      stopReason: '', offsiteDistance: 0, forceStop: '0',
      scantronId: '', token,
    },
    summary: {
      taskName: task.name || task.taskId,
      routeName: route.pointName || route.pointId || '无固定路线',
      km, usedTime, avgSpeed, steps, deviceModel: device?.deviceModel || 'iPhone 14 Pro (iOS 17.5.1)',
      fitDegree,
      pointCount: pointList.length, startTime: formatTime(start), endTime: formatTime(end),
    },
  };
}

export function buildRouteFreeFixture({ task, identity, now = new Date() }, options = {}) {
  const generatedRoute = {
    pointId: 'route-free',
    pointName: '无固定路线',
    pointList: ROUTE_ONE_FALLBACK_POINTS,
  };
  const fixture = buildRunFixture({ task, route: generatedRoute, identity, now }, options);

  return {
    ...fixture,
    begin: { ...fixture.begin, lineId: '' },
    exercise: { ...fixture.exercise, fitDegree: '0.00', sunrunPathPointList: [] },
    summary: { ...fixture.summary, routeName: '无固定路线', fitDegree: '0.00' },
  };
}
