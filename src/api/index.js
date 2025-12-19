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
  
  // 检测token失效：如果是需要认证的接口且返回success=false
  if (options.requiresAuth !== false && data.success === false) {
    // 动态导入store以避免循环依赖
    const { default: useAuthStore } = await import('../store/useAuthStore.js');
    const { logout, isLoggedIn } = useAuthStore.getState();
    
    // 只有在已登录状态下才处理token失效
    if (isLoggedIn) {
      console.warn('[Token失效] 检测到登录已失效，正在退出登录...');
      logout();
      
      // 提示用户并跳转到登录页
      alert('登录已失效，请重新登录');
      
      // 跳转到登录页
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

/**
 * 获取微信登录二维码
 */
export async function getQRCode() {
  return request('/login/qrcode', { requiresAuth: false });
}

/**
 * 轮询扫码状态
 */
export async function pollScanStatus(uuid) {
  return request(`/login/poll/${uuid}`, { requiresAuth: false });
}

/**
 * 完成登录
 */
export async function completeLogin(wxCode, longitude = '116.397428', latitude = '39.908823') {
  return request('/login/complete', {
    method: 'POST',
    requiresAuth: false,
    body: {
      wx_code: wxCode,
      longitude,
      latitude,
    },
  });
}

// ============================================================
// 阳光跑 API
// ============================================================

/**
 * 获取跑步任务
 */
export async function getRunTask(authData) {
  return request('/sunrun/task', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      campus_id: authData.campusId,
    },
  });
}

/**
 * 开始跑步
 */
export async function startRun(authData) {
  return request('/sunrun/start', {
    method: 'POST',
    body: {
      token: authData.token,
      stu_number: authData.stuNumber,
      school_id: authData.schoolId,
      campus_id: authData.campusId,
    },
  });
}

/**
 * 提交跑步记录
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
      point_index: options.pointIndex || null,
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
 * 批量跑步 - 一键补齐剩余次数
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

