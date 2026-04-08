import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  deleteUser,
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

    let emailSent = false;
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@site.tecassistiva.com.br';
        const firstName = displayName ? displayName.split(' ')[0] : 'Representante';
        await resend.emails.send({
          from: fromEmail,
          to: email,
          subject: 'Seu acesso ao Portal Tecassistiva',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1a1a1a;">Bem-vindo ao Portal Tecassistiva</h2>
              <p style="color: #444;">Olá, ${firstName}!</p>
              <p style="color: #444;">
                Você foi convidado como <strong>${role}</strong> no Portal Tecassistiva.
                Clique no botão abaixo para criar sua senha e acessar o portal.
              </p>
              <div style="text-align: center; margin: 32px 0;">
                <a href="${invited.resetLink}"
                  style="background: #0066cc; color: #fff; padding: 14px 28px; border-radius: 6px;
                         text-decoration: none; font-weight: bold; display: inline-block;">
                  Criar minha senha
                </a>
              </div>
              <p style="color: #888; font-size: 13px;">
                Se o botão não funcionar, copie e cole este link no navegador:<br/>
                <a href="${invited.resetLink}" style="color: #0066cc;">${invited.resetLink}</a>
              </p>
              <p style="color: #888; font-size: 13px;">Este link expira em 24 horas.</p>
            </div>
          `,
        });
        emailSent = true;
      } catch (emailError) {
        console.error('Falha ao enviar email de convite:', emailError);
      }
    }

    return NextResponse.json({
      ok: true,
      uid: invited.uid,
      resetLink: invited.resetLink,
      emailSent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao convidar usuário.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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

    if (targetUid === currentAdmin.uid) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 });
    }

    await deleteUser(targetUid);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao excluir usuário.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
