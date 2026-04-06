import { NextRequest, NextResponse } from 'next/server';
import { createSession, deleteSession } from '@/lib/session';
import { upsertUserProfile, verifyIdToken } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const decoded = await verifyIdToken(idToken);
    const uid = decoded.uid;
    const email = decoded.email;
    const displayName = decoded.name ?? null;

    if (!uid || !email) {
      return NextResponse.json({ error: 'Invalid token payload' }, { status: 400 });
    }

    await createSession(uid, email, displayName);
    await upsertUserProfile({
      uid,
      email,
      displayName,
      isAdmin: Boolean(decoded.admin),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Falha ao criar sessão:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE() {
  await deleteSession();
  return NextResponse.json({ ok: true });
}
