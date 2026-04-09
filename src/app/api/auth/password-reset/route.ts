import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { generatePasswordResetLinkForEmail } from '@/lib/firebase-admin';

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

function normalizeEmail(input: unknown) {
  return String(input ?? '').trim().toLowerCase();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'email inválido.' }, { status: 400 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return NextResponse.json({ ok: true, useFirebaseFallback: true });
    }

    let resetLink = '';
    try {
      const rawResetLink = await generatePasswordResetLinkForEmail(email);
      resetLink = buildCustomResetLink(rawResetLink, request.nextUrl.origin);
    } catch {
      // Do not reveal whether the email exists.
      return NextResponse.json({ ok: true });
    }

    const resend = new Resend(resendApiKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@site.tecassistiva.com.br';

    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Redefina sua senha - Portal Tecassistiva',
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; background: #f8fafc;">
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 28px;">
            <p style="margin: 0 0 8px 0; color: #334155; font-size: 14px;">Portal de Representantes Tecassistiva</p>
            <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 24px;">Redefinir senha</h2>
            <p style="margin: 0 0 20px 0; color: #334155; line-height: 1.6;">
              Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha.
            </p>

            <div style="margin: 28px 0; text-align: center;">
              <a href="${resetLink}"
                style="background: #0b5ed7; color: #ffffff; padding: 14px 24px; border-radius: 10px; text-decoration: none; font-weight: 700; display: inline-block;">
                Criar nova senha
              </a>
            </div>

            <div style="margin-top: 22px; padding: 12px 14px; border: 1px solid #dbeafe; background: #eff6ff; border-radius: 10px;">
              <p style="margin: 0; color: #1e3a8a; font-size: 13px; line-height: 1.5;">
                Se o botão não funcionar, copie e cole este link no navegador:<br />
                <a href="${resetLink}" style="color: #1d4ed8; word-break: break-all;">${resetLink}</a>
              </p>
            </div>

            <p style="margin: 18px 0 0 0; color: #64748b; font-size: 12px;">Por segurança, este link expira em 24 horas.</p>
          </div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
