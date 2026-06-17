const STD = 1 / 50000;
const STEP_LENGTH = 0.0001;

function randomGaussian(mean, std) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean + z * std;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pad(number) {
  return String(number).padStart(2, '0');
}

function formatLocalDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatLocalTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function haversineDistance(point1, point2) {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;
  const radius = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return radius * c;
}

function distanceOfLine(points) {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += haversineDistance(points[index], points[index + 1]);
  }
  return total;
}

function addDeviation(point) {
  const [lon, lat] = point;
  return [randomGaussian(lon, STD), randomGaussian(lat, STD)];
}

function addPoints(pointA, pointB) {
  const vectorX = pointB[0] - pointA[0];
  const vectorY = pointB[1] - pointA[1];
  const norm = Math.sqrt(vectorX ** 2 + vectorY ** 2);
  const count = Math.floor(norm / STEP_LENGTH);
  const unitX = norm === 0 ? 0 : vectorX / norm;
  const unitY = norm === 0 ? 0 : vectorY / norm;
  const points = [pointA];

  for (let index = 1; index < count; index += 1) {
    points.push([pointA[0] + index * STEP_LENGTH * unitX, pointA[1] + index * STEP_LENGTH * unitY]);
  }

  return points;
}

function combinePoints(pointList) {
  if (!pointList.length || !pointList[0].latitude) {
    throw new Error('任务为空');
  }

  const route = pointList.map((point) => [Number(point.longitude), Number(point.latitude)]);
  const combined = [];

  for (let index = 0; index < route.length; index += 1) {
    if (index === route.length - 1) {
      combined.push(route[index]);
    } else {
      combined.push(...addPoints(route[index], route[index + 1]));
    }
  }

  return combined;
}

function trimRoute(route, distanceKm) {
  let distance = 0;
  const originalIndex = Math.floor(Math.random() * route.length);
  let index = originalIndex;
  const points = [addDeviation(route[originalIndex])];
  const targetDistance = distanceKm * 1000;

  while (distance < targetDistance) {
    points.push(addDeviation(route[index]));
    distance = distanceOfLine(points);
    index += 1;
    if (index >= route.length - 2) index = 0;
  }

  return { points, distance };
}

function generateRoute(distance, taskToday) {
  const pointList = taskToday.pointList || [];
  if (!pointList.length) {
    throw new Error('任务中没有打卡点信息');
  }

  const route = combinePoints(pointList);
  const { points, distance: actualDistance } = trimRoute(route, Number(distance));

  return {
    mockRoute: points.map(([longitude, latitude]) => ({
      longitude: longitude.toFixed(6),
      latitude: latitude.toFixed(6),
    })),
    distance: (actualDistance / 1000).toFixed(2),
  };
}

function calculateAvgSpeed(usedTimeSeconds, km) {
  if (usedTimeSeconds <= 0) return '0';
  return (km / (usedTimeSeconds / 3600)).toFixed(2);
}

function formatUsedTime(usedTimeSeconds) {
  const hours = Math.floor(usedTimeSeconds / 3600);
  const minutes = Math.floor((usedTimeSeconds % 3600) / 60);
  const seconds = usedTimeSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function generateSimpleTrack(startPoint, km, pointCount = 50) {
  const points = [];
  const startLng = Number(startPoint.longitude || '119.48');
  const startLat = Number(startPoint.latitude || '31.37');
  const radius = (km / (2 * Math.PI)) * 0.009;

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (2 * Math.PI * index) / pointCount;
    const longitude = startLng + radius * Math.cos(angle) + (Math.random() * 0.0002 - 0.0001);
    const latitude = startLat + radius * Math.sin(angle) + (Math.random() * 0.0002 - 0.0001);
    points.push({ longitude: longitude.toFixed(6), latitude: latitude.toFixed(6) });
  }

  points.push({
    longitude: (startLng + (Math.random() * 0.0002 - 0.0001)).toFixed(6),
    latitude: (startLat + (Math.random() * 0.0002 - 0.0001)).toFixed(6),
  });

  return points;
}

function selectPointForCampus(runPointList, campusName) {
  if (!runPointList.length) return null;
  const campusLower = campusName ? campusName.toLowerCase() : '';

  for (const point of runPointList) {
    const pointNameLower = point.pointName.toLowerCase();
    if (campusLower && pointNameLower.includes(campusLower)) return point;
    if (campusName?.includes('天目湖') && point.pointName.includes('天目湖')) return point;
  }

  return null;
}

export function generateRunData({
  task,
  stuNumber,
  token,
  campusName,
  km,
  usedTimeMinutes,
  pointIndex,
  runDate,
  runTime,
}) {
  let distanceKm = km;
  if (distanceKm == null) {
    const requiredKm = task.mileage ? Number(task.mileage) : 3.2;
    distanceKm = requiredKm + Math.random() * 0.25 + 0.05;
  }

  let minutes = usedTimeMinutes;
  if (minutes == null) {
    const minTime = task.minTime ? Number(task.minTime) : 10;
    const maxTime = task.maxTime ? Number(task.maxTime) : 25;
    minutes = randomInt(minTime + 2, maxTime - 2);
  }

  const usedTimeSeconds = minutes * 60;
  let selectedPoint = null;

  if (task.runPointList.length) {
    if (pointIndex != null && pointIndex >= 0 && pointIndex < task.runPointList.length) {
      selectedPoint = task.runPointList[pointIndex];
    } else {
      selectedPoint = selectPointForCampus(task.runPointList, campusName) || task.runPointList[0];
    }
  }

  const startPoint = selectedPoint
    ? { longitude: selectedPoint.longitude, latitude: selectedPoint.latitude }
    : { longitude: '119.4801785', latitude: '31.372601' };
  const taskId = selectedPoint?.taskId || 'sunrunTaskPaper-20210917000004';
  const routeId = selectedPoint?.pointId || 'sunrunLine-20210918000001';

  let submitDate;
  let startTime;
  let endTime;

  if (runDate) {
    submitDate = runDate;
    if (runTime) {
      startTime = runTime;
    } else {
      const startHour = task.startTime ? Number(task.startTime.split(':')[0]) : 6;
      const endHour = task.endTime ? Number(task.endTime.split(':')[0]) : 22;
      startTime = `${pad(randomInt(startHour, Math.max(startHour, endHour - 1)))}:${pad(randomInt(0, 59))}:${pad(randomInt(0, 59))}`;
    }

    const startDate = new Date(`${runDate}T${startTime}`);
    if (Number.isNaN(startDate.getTime())) {
      const now = new Date();
      submitDate = formatLocalDate(now);
      endTime = formatLocalTime(now);
      startTime = formatLocalTime(new Date(now.getTime() - usedTimeSeconds * 1000));
    } else {
      endTime = formatLocalTime(new Date(startDate.getTime() + usedTimeSeconds * 1000));
    }
  } else {
    const now = new Date();
    submitDate = formatLocalDate(now);
    endTime = formatLocalTime(now);
    startTime = formatLocalTime(new Date(now.getTime() - usedTimeSeconds * 1000));
  }

  let pointList;
  try {
    if (selectedPoint?.pointList.length) {
      const routeResult = generateRoute(String(distanceKm), { pointList: selectedPoint.pointList });
      pointList = routeResult.mockRoute;
    } else {
      pointList = generateSimpleTrack(startPoint, distanceKm);
    }
  } catch {
    pointList = generateSimpleTrack(startPoint, distanceKm);
  }

  const steps = Math.trunc(distanceKm * 1500 + randomInt(-100, 100));

  return {
    LocalSubmitReason: '',
    avgSpeed: calculateAvgSpeed(usedTimeSeconds, distanceKm),
    baseStation: '',
    endTime,
    submitDate,
    evaluateDate: submitDate,
    fitDegree: '1',
    flag: '1',
    headImage: '',
    ifLocalSubmit: '1',
    km: distanceKm.toFixed(2),
    mac: '02:00:00:00:00:00',
    phoneInfo: '$CN11/iPhone15,4/17.4.1',
    phoneNumber: '',
    pointList: '',
    routeId,
    runType: '0',
    sensorString: '',
    startTime,
    steps: String(steps),
    stuNumber,
    taskId,
    token,
    usedTime: formatUsedTime(usedTimeSeconds),
    version: '1.2.14',
    warnFlag: '0',
    warnType: '',
    faceData: '',
    _pointList: pointList,
    _selectedPoint: selectedPoint?.pointName || '默认',
  };
}

export function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    dates.push(formatLocalDate(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function getYesterdayDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  today.setDate(today.getDate() - 1);
  return formatLocalDate(today);
}

export function generateRandomRunTime(startTime, endTime) {
  let startHour = 6;
  let startMinute = 0;
  let endHour = 22;
  let endMinute = 0;

  try {
    [startHour, startMinute] = startTime.split(':').map(Number);
    [endHour, endMinute] = endTime.split(':').map(Number);
  } catch {
    startHour = 6;
    startMinute = 0;
    endHour = 22;
    endMinute = 0;
  }

  const startTotal = startHour * 60 + startMinute;
  let endTotal = endHour * 60 + endMinute;
  if (endTotal <= startTotal) endTotal = startTotal + 60;
  const range = Math.max(30, endTotal - startTotal - 45);
  const randomMinutes = randomInt(startTotal, startTotal + range);

  return `${pad(Math.floor(randomMinutes / 60))}:${pad(randomMinutes % 60)}:${pad(randomInt(0, 59))}`;
}
