import { NextResponse } from 'next/server.js';

export function json(data, init) {
  return NextResponse.json(data, init);
}

export function serverError(prefix, error) {
  return NextResponse.json(
    {
      success: false,
      message: `${prefix}: ${error.message}`,
      detail: `${prefix}: ${error.message}`,
    },
    { status: 500 }
  );
}

const MAX_JSON_BODY_BYTES = 1024 * 1024; // 1MB cap to prevent resource exhaustion

export async function readJson(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_JSON_BODY_BYTES) {
    throw new Error('请求体过大');
  }
  return request.json().catch(() => ({}));
}
