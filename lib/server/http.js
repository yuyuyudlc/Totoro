import { NextResponse } from 'next/server';

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

export async function readJson(request) {
  return request.json().catch(() => ({}));
}
