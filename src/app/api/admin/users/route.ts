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

function buildCustomResetLink(rawLink: string, origin: string) {
  try {
    const parsed = new URL(rawLink);
    const oobCode = parsed.searchParams.get('oobCode');

    if (!oobCode) {
      return rawLink;
    }

    const customUrl = new URL('/login/criar-senha', origin);
    customUrl.searchParams.set('oobCode', oobCode);
    return customUrl.toString();
  } catch {
    return rawLink;
  }
}

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
    const passwordSetupLink = buildCustomResetLink(invited.resetLink, request.nextUrl.origin);

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
          subject: 'Crie sua senha - Portal Tecassistiva',
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background: #f8fafc;">
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px;">
                <p style="margin: 0 0 8px 0; color: #334155; font-size: 14px;">Portal de Representantes Tecassistiva</p>
                <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 24px;">Bem-vindo(a), ${firstName}.</h2>
                <p style="margin: 0 0 10px 0; color: #334155; line-height: 1.6;">
                  Seu acesso foi criado com o perfil <strong>${role}</strong>.
                </p>
                <p style="margin: 0 0 20px 0; color: #334155; line-height: 1.6;">
                  Para concluir, clique no botão abaixo e crie sua senha.
                </p>

                <div style="margin: 28px 0; text-align: center;">
                  <a href="${passwordSetupLink}"
                    style="background: #0b5ed7; color: #ffffff; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 700; display: inline-block;">
                    Criar minha senha
                  </a>
                </div>

                <div style="margin-top: 22px; padding: 12px 14px; border: 1px solid #dbeafe; background: #eff6ff; border-radius: 10px;">
                  <p style="margin: 0; color: #1e3a8a; font-size: 13px; line-height: 1.5;">
                    Se o botão não funcionar, copie e cole este link no navegador:<br />
                    <a href="${passwordSetupLink}" style="color: #1d4ed8; word-break: break-all;">${passwordSetupLink}</a>
                  </p>
                </div>

                <p style="margin: 18px 0 0 0; color: #64748b; font-size: 12px;">Por segurança, este link expira em 24 horas.</p>
              </div>
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
      resetLink: passwordSetupLink,
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
