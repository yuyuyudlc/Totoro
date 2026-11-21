'use client';

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data?.detail || `请求失败: ${response.status}`);
  }

  if (!data) throw new Error('接口未返回有效 JSON');

  return data;
}

export async function loginWithToken(token) {
  return request('/login/token', { method: 'POST', body: { token } });
}

export async function getRunTasks(authData) {
  return request('/sunrun/tasks', {
    method: 'POST',
    body: { token: authData.token, stu_number: authData.stuNumber, campus_id: authData.campusId },
  });
}

export async function getMorningSignTask(authData) {
  return request('/morning-sign/task', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
    },
  });
}

export async function submitMorningSign(authData, pointId) {
  return request('/morning-sign/submit', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      point_id: pointId,
    },
  });
}

function runRequestBody(authData, task, route) {
  return {
    token: authData.token,
    stu_number: authData.stuNumber,
    school_id: authData.schoolId,
    school_code: authData.schoolCode,
    task,
    route,
  };
}

export async function previewRun(authData, task, route, plan, deviceId) {
  return request('/sunrun/preview', {
    method: 'POST',
    body: {
      ...runRequestBody(authData, task, route),
      plan,
      ...(deviceId ? { device_id: deviceId } : {}),
    },
  });
}

export async function startRun(authData, task, route, previewToken) {
  return request('/sunrun/start', {
    method: 'POST',
    body: {
      ...runRequestBody(authData, task, route),
      preview_token: previewToken,
    },
  });
}

export async function getRunJobStatus(authData, jobId) {
  return request('/sunrun/run-job', {
    method: 'POST',
    body: {
      job_id: jobId,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      school_code: authData.schoolCode,
    },
  });
}

export async function getCurrentRunJobs(authData) {
  return request('/sunrun/run-job', {
    method: 'POST',
    body: { token: authData.token },
  });
}
