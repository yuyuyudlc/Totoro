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

  if (options.requiresAuth !== false && data?.success === false) {
    const { default: useStore } = await import('./store.js');
    const { logout, isLoggedIn } = useStore.getState();

    if (isLoggedIn) {
      logout();
      window.alert('登录已失效，请重新登录');
      window.location.href = '/';
    }
  }

  return data;
}

export async function getQRCode() {
  return request('/login/qrcode', { requiresAuth: false });
}

export async function pollScanStatus(uuid) {
  return request(`/login/poll/${uuid}`, { requiresAuth: false });
}

export async function completeLogin(wxCode, longitude = '116.397428', latitude = '39.908823') {
  return request('/login/complete', {
    method: 'POST',
    requiresAuth: false,
    body: { wx_code: wxCode, longitude, latitude },
  });
}

export async function submitRun(authData, options = {}) {
  return request('/sunrun/submit', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      campus_id: authData.campusId,
      campus_name: authData.campusName,
      km: options.km || null,
      used_time_minutes: options.usedTimeMinutes || null,
      point_index: options.pointIndex ?? null,
      run_date: options.runDate || null,
      run_time: options.runTime || null,
    },
  });
}

export async function getRunRecords(authData, options = {}) {
  return request('/sunrun/records', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      campus_id: authData.campusId,
      run_type: options.runType || '0',
      month_id: options.monthId || '',
      page_number: options.pageNumber || '1',
      row_number: options.rowNumber || '100',
    },
  });
}

export async function bulkRun(authData, count) {
  return request('/sunrun/bulk', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      campus_id: authData.campusId,
      campus_name: authData.campusName,
      count,
    },
  });
}

export async function bulkRunV2(authData, dates, intervalSeconds = 1) {
  return request('/sunrun/bulk-v2', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      campus_id: authData.campusId,
      campus_name: authData.campusName,
      dates,
      interval_seconds: intervalSeconds,
    },
  });
}
