import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyIdToken } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

function getBearerToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

export async function POST(request: NextRequest) {
  try {
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json({ error: 'Token ausente.' }, { status: 401 });
    }

    const decodedToken = await verifyIdToken(idToken);
    const representanteUid = decodedToken.uid;

    const body = await request.json();
    const {
      kitId,
      kitNome,
      itens,
      totalGeral,
      representanteEmail,
    } = body;

    if (!kitId || !kitNome || !Array.isArray(itens) || totalGeral === undefined) {
      return NextResponse.json(
        { error: 'Dados incompletos: kitId, kitNome, itens e totalGeral são obrigatórios.' },
        { status: 400 }
      );
    }

    // Get representante user to fetch sales info
    const db = getAdminDb();
    const userDoc = await db.collection('users').doc(representanteUid).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: 'Representante não encontrado.' }, { status: 404 });
    }

    const userData = userDoc.data();
    const emailVendedor = userData?.sales?.emailVendedor;
    const nomeVendedor = userData?.sales?.nomeVendedor;

    if (!emailVendedor) {
      return NextResponse.json(
        { error: 'Vendedor não configurado para este representante. Contate o administrador.' },
        { status: 400 }
      );
    }

    // Save quote request to Firestore
    const quoteRequest = {
      kitId,
      kitNome,
      representanteUid,
      representanteEmail,
      nomeVendedor,
      emailVendedor,
      itens,
      totalGeral,
      status: 'pendente',
      criadoEm: new Date(),
      atualizadoEm: new Date(),
    };

    const docRef = await db.collection('cotacoes').add(quoteRequest);

    // Send email to vendor
    let emailSent = false;
    let emailError: string | null = null;
    try {
      const result = await sendEmailToVendor({
        vendedorNome: nomeVendedor,
        vendedorEmail: emailVendedor,
        representanteEmail,
        kitNome,
        itens,
        totalGeral,
        quoteId: docRef.id,
      });
      emailSent = result.sent;
      emailError = result.error ?? null;
    } catch (emailError) {
      console.error('Erro ao enviar email:', emailError);
      emailSent = false;
      emailError = emailError instanceof Error ? emailError.message : 'Falha ao enviar email.';
      // Don't fail the request if email sending fails
    }

    return NextResponse.json({
      ok: true,
      quoteId: docRef.id,
      emailSent,
      emailError,
      message: emailSent
        ? 'Cotação solicitada com sucesso. Em breve o vendedor entrará em contato.'
        : 'Cotação registrada, mas não foi possível enviar o email ao vendedor.',
    });
  } catch (error) {
    console.error('Erro ao processar requisição de cotação:', error);
    const message = error instanceof Error ? error.message : 'Erro ao solicitar cotação.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function sendEmailToVendor({
  vendedorNome,
  vendedorEmail,
  representanteEmail,
  kitNome,
  itens,
  totalGeral,
  quoteId,
}: {
  vendedorNome: string;
  vendedorEmail: string;
  representanteEmail: string;
  kitNome: string;
  itens: Array<{
    produtoId: string;
    nomeProduto: string;
    quantidade: number;
    precoUnitario: number;
  }>;
  totalGeral: number;
  quoteId: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY não está configurada. Email não será enviado.');
    return {
      sent: false,
      error: 'RESEND_API_KEY não configurada.',
    };
  }

  const resend = new Resend(resendApiKey);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@site.tecassistiva.com.br';

  // Format currency
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 2,
    }).format(value);

  // Build HTML email
  const itemsHtml = itens
    .map(
      (item) =>
        `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px; text-align: left;">${item.nomeProduto}</td>
          <td style="padding: 8px; text-align: center;">${item.quantidade}</td>
          <td style="padding: 8px; text-align: right;">${formatCurrency(item.precoUnitario)}</td>
          <td style="padding: 8px; text-align: right; font-weight: bold;">${formatCurrency(
            item.precoUnitario * item.quantidade
          )}</td>
        </tr>
      `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Nova Requisição de Cotação</title>
        <style>
          body { font-family: Arial, sans-serif; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
          .content { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f9f9f9; padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #ddd; }
          .total-row { background: #f0f0f0; font-weight: bold; }
          .footer { color: #666; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; color: #1a5490;">Nova Requisição de Cotação</h1>
            <p style="margin: 8px 0 0 0; color: #666;">ID da Cotação: <strong>${quoteId}</strong></p>
          </div>

          <div class="content">
            <h2 style="font-size: 18px; margin-bottom: 12px;">Detalhes do Projeto</h2>
            <p><strong>Kit/Projeto:</strong> ${kitNome}</p>
            <p><strong>Representante:</strong> ${representanteEmail}</p>
            <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
          </div>

          <div class="content">
            <h2 style="font-size: 18px; margin-bottom: 12px;">Produtos Solicitados</h2>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th style="text-align: center;">Quantidade</th>
                  <th style="text-align: right;">Preço Unitário</th>
                  <th style="text-align: right;">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
                <tr class="total-row">
                  <td colspan="3" style="padding: 12px; text-align: right;">TOTAL:</td>
                  <td style="padding: 12px; text-align: right;">${formatCurrency(totalGeral)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="content" style="background: #f9f9f9; padding: 12px; border-radius: 6px;">
            <p style="margin: 0;"><strong>Ação Necessária:</strong></p>
            <p style="margin: 8px 0 0 0;">Por favor, entre em contato com o representante <strong>${representanteEmail}</strong> para fornecer a cotação para o projeto <strong>${kitNome}</strong>.</p>
          </div>

          <div class="footer">
            <p>Este é um email automático do Portal de Representantes Tecassistiva. Favor não responder este email.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    await resend.emails.send({
      from: fromEmail,
      to: vendedorEmail,
      subject: `[Cotação ${quoteId}] ${kitNome} - ${representanteEmail}`,
      html: htmlContent,
      replyTo: representanteEmail,
    });

    console.log(`Email enviado para ${vendedorEmail} (${vendedorNome})`);
    return {
      sent: true,
    };
  } catch (err) {
    console.error('Erro ao enviar email via Resend:', err);
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Falha ao enviar email via Resend.',
    };
  }
}
