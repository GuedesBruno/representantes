import { NextRequest, NextResponse } from 'next/server';
import { createSession, deleteSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const { uid, email, displayName } = await request.json();

    if (!uid || !email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    await createSession(uid, email, displayName);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  await deleteSession();
  return NextResponse.json({ ok: true });
}
