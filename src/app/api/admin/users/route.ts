import { NextRequest, NextResponse } from 'next/server';
import { patchUserProfile, setUserRole, verifyAdminIdToken } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice('Bearer '.length).trim();
}

export async function PATCH(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json({ error: 'Token ausente.' }, { status: 401 });
    }

    await verifyAdminIdToken(idToken);

    const body = await request.json();
    const targetUid = typeof body.targetUid === 'string' ? body.targetUid.trim() : '';

    if (!targetUid) {
      return NextResponse.json({ error: 'targetUid é obrigatório.' }, { status: 400 });
    }

    const role = body.role;
    if (role !== undefined && role !== 'admin' && role !== 'representante') {
      return NextResponse.json({ error: 'role inválido.' }, { status: 400 });
    }

    const profile = typeof body.profile === 'object' && body.profile !== null ? body.profile : undefined;
    const preferences = typeof body.preferences === 'object' && body.preferences !== null ? body.preferences : undefined;
    const business = typeof body.business === 'object' && body.business !== null ? body.business : undefined;
    const displayName =
      body.displayName === undefined || body.displayName === null
        ? undefined
        : String(body.displayName);

    if (role !== undefined) {
      await setUserRole(targetUid, role);
    }

    if (displayName !== undefined || profile || preferences || business) {
      await patchUserProfile(targetUid, {
        displayName,
        profile,
        preferences,
        business,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar usuário.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
