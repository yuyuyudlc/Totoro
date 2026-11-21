import { MINIPROGRAM_BASE_URL, MINIPROGRAM_FALLBACK_BASE_URL } from './config.js';

export class MiniProgramConnectionError extends Error {
  constructor(timedOut) {
    super(timedOut ? '连接小程序接口超时' : '无法连接小程序接口');
    this.name = 'MiniProgramConnectionError';
    this.timedOut = timedOut;
  }
}

function getOrigins(baseUrls, preferredBaseUrl) {
  const values = baseUrls || [MINIPROGRAM_BASE_URL, MINIPROGRAM_FALLBACK_BASE_URL];
  const origins = [...new Set(values)].map(value => {
    const origin = new URL(value);
    if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
      throw new Error('SUNRUN_MINIPROGRAM_BASE_URL 必须是无路径、无凭据的 HTTPS origin');
    }
    return origin;
  });
  if (preferredBaseUrl) {
    const preferredHref = new URL(preferredBaseUrl).href;
    origins.sort((left, right) => Number(right.href === preferredHref) - Number(left.href === preferredHref));
  }
  return origins;
}

export async function fetchMiniProgram(path, init, {
  fetchImpl = fetch,
  timeoutMs = 30000,
  baseUrls,
  preferredBaseUrl,
  onSuccess,
} = {}) {
  const failures = [];
  for (const origin of getOrigins(baseUrls, preferredBaseUrl)) {
    try {
      const response = await fetchImpl(new URL(path, origin).href, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      onSuccess?.(origin.href);
      return response;
    } catch (error) {
      failures.push(error);
      console.error('[mini-program] upstream connection failed', {
        host: origin.hostname,
        name: error?.name || 'Error',
        causeCode: error?.cause?.code || null,
        region: process.env.VERCEL_REGION || 'local',
      });
    }
  }

  const timedOut = failures.some(error => error?.name === 'TimeoutError' || error?.name === 'AbortError');
  throw new MiniProgramConnectionError(timedOut);
}
