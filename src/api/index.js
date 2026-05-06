/**
 * API 请求封装
 */

const API_BASE = 'http://localhost:8000/api';

/**
 * 通用请求方法
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    throw new Error(`请求失败: ${response.status}`);
  }

  const data = await response.json();

  // 检测 token 失效
  if (options.requiresAuth !== false && data.success === false) {
    const { default: useStore } = await import('../store/store.js');
    const { logout, isLoggedIn } = useStore.getState();

    if (isLoggedIn) {
      console.warn('[Token失效] 检测到登录已失效，正在退出登录...');
      logout();
      alert('登录已失效，请重新登录');
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  }

  return data;
}

// ============================================================
// 登录 API
// ============================================================

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

// ============================================================
// 阳光跑 API
// ============================================================

/**
 * 提交跑步记录（一键完成）
 */
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

/**
 * 获取跑步记录
 */
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

/**
 * 批量跑步 - 一键补齐
 */
export async function bulkRun(authData, count) {
  return request('/sunrun/bulk', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      campus_id: authData.campusId,
      campus_name: authData.campusName,
      count: count,
    },
  });
}

/**
 * 批量跑步V2 - 指定日期 + 间隔
 * @param {object} authData - 认证数据
 * @param {string[]} dates - 日期列表 ["2026-05-01", "2026-05-03", ...]
 * @param {number} intervalSeconds - 每次跑步间隔秒数
 */
export async function bulkRunV2(authData, dates, intervalSeconds = 2) {
  return request('/sunrun/bulk-v2', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      campus_id: authData.campusId,
      campus_name: authData.campusName,
      dates: dates,
      interval_seconds: intervalSeconds,
    },
  });
}
