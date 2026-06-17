export function makeRunTask(data = {}) {
  const runPointList = (data.runPointList || []).map((point) => ({
    taskId: point.taskId || '',
    pointId: point.pointId || '',
    pointName: point.pointName || '',
    longitude: point.longitude || '',
    latitude: point.latitude || '',
    pointList: (point.pointList || []).map((coordinate) => ({
      longitude: coordinate.longitude || '',
      latitude: coordinate.latitude || '',
    })),
  }));

  return {
    code: data.code || '',
    message: data.message || '',
    startDate: data.startDate || '',
    startTime: data.startTime || '',
    endDate: data.endDate || '',
    endTime: data.endTime || '',
    mileage: data.mileage || '',
    minTime: data.minTime || '',
    maxTime: data.maxTime || '',
    minSpeed: data.minSpeed || '',
    maxSpeed: data.maxSpeed || '',
    fitDegree: data.fitDegree || '',
    offsetRange: data.offsetRange || '',
    faceFlag: data.faceFlag || '',
    ifHasRun: data.ifHasRun || '',
    runPointList,
    isSuccess: data.code === '0',
  };
}

export function makeLoginInfo(data = {}, serverToken = '') {
  return {
    code: data.code || '',
    message: data.message || '',
    studentId: data.studentId || '',
    stuNumber: data.stuNumber || '',
    stuName: data.stuName || '',
    phoneNumber: data.phoneNumber || '',
    schoolId: data.schoolId || '',
    schoolName: data.schoolName || '',
    campusId: data.campusId || '',
    campusName: data.campusName || '',
    collegeId: data.collegeId || '',
    collegeName: data.collegeName || '',
    naturalId: data.naturalId || '',
    naturalName: data.naturalName || '',
    className: data.className || '',
    gender: data.gender || data.sex || '',
    headPortrait: data.headPortrait || '',
    token: data.token || serverToken || '',
    isSuccess: data.code === '0',
  };
}
