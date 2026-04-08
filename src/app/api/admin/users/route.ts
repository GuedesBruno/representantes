import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminDb,
  inviteUser,
  patchUserProfile,
  setUserRole,
  updateUserEmail,
  verifyAdminIdToken,
} from '@/lib/firebase-admin';

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

    const currentAdmin = await verifyAdminIdToken(idToken);

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
    const sales = typeof body.sales === 'object' && body.sales !== null ? body.sales : undefined;
    const email =
      body.email === undefined || body.email === null
        ? undefined
        : String(body.email).trim();
    const displayName =
      body.displayName === undefined || body.displayName === null
        ? undefined
        : String(body.displayName);

    const db = getAdminDb();
    const targetDoc = await db.collection('users').doc(targetUid).get();
    const targetData = targetDoc.exists ? targetDoc.data() : undefined;
    const currentRole = targetData?.role === 'admin' ? 'admin' : 'representante';
    const currentEmail = typeof targetData?.email === 'string' ? targetData.email : undefined;

    if (targetUid === currentAdmin.uid && role === 'representante') {
      return NextResponse.json({ error: 'Você não pode remover sua própria permissão de administrador.' }, { status: 400 });
    }

    if (email !== undefined && email !== '' && !email.includes('@')) {
      return NextResponse.json({ error: 'email inválido.' }, { status: 400 });
    }

    if (role !== undefined && role !== currentRole) {
      await setUserRole(targetUid, role);
    }

    if (email !== undefined && email !== currentEmail) {
      await updateUserEmail(targetUid, email || null);
    }

    if (displayName !== undefined || profile || sales) {
      await patchUserProfile(targetUid, {
        displayName,
        profile,
        sales,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao atualizar usuário.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json({ error: 'Token ausente.' }, { status: 401 });
    }

    await verifyAdminIdToken(idToken);

    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const displayName = body.displayName === undefined || body.displayName === null
      ? null
      : String(body.displayName).trim();
    const role = body.role === 'admin' ? 'admin' : 'representante';

    const profile = typeof body.profile === 'object' && body.profile !== null ? body.profile : {};
    const sales = typeof body.sales === 'object' && body.sales !== null ? body.sales : {};

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'email inválido.' }, { status: 400 });
    }

    const invited = await inviteUser({
      email,
      displayName,
      role,
      profile,
      sales,
    });

    return NextResponse.json({
      ok: true,
      uid: invited.uid,
      resetLink: invited.resetLink,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao convidar usuário.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
