import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import * as XLSX from 'xlsx';
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
      representanteNome,
      nomeOrgao,
      nomeResponsavel,
      cnpj,
    } = body;

    if (!kitId || !kitNome || !Array.isArray(itens) || totalGeral === undefined) {
      return NextResponse.json(
        { error: 'Dados incompletos: kitId, kitNome, itens e totalGeral são obrigatórios.' },
        { status: 400 }
      );
    }

    // Get representante user to fetch sales info
    const db = getAdminDb();
    let userData: any = null;

    // 1. Tentar pelo UID (mais garantido)
    const userDocByUid = await db.collection('users').doc(representanteUid).get();
    if (userDocByUid.exists) {
      userData = userDocByUid.data();
    }

    // 2. Se não achou ou não tem vendedor no doc do UID, busca pelo e-mail
    if (!userData?.sales?.emailVendedor) {
      const userByEmailSnap = await db.collection('users')
        .where('email', '==', representanteEmail)
        .limit(1)
        .get();
      
      if (!userByEmailSnap.empty) {
        userData = userByEmailSnap.docs[0].data();
      }
    }

    if (!userData) {
      return NextResponse.json({ error: 'Representante não encontrado no sistema.' }, { status: 404 });
    }

    const emailVendedor = userData?.sales?.emailVendedor;
    const nomeVendedor = userData?.sales?.nomeVendedor;
    const finalRepresentanteNome = userData?.displayName || representanteNome;

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
      representanteNome: finalRepresentanteNome,
      nomeOrgao,
      nomeResponsavel,
      cnpj,
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
        representanteNome: finalRepresentanteNome,
        nomeOrgao,
        nomeResponsavel,
        cnpj,
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
  representanteNome,
  nomeOrgao,
  nomeResponsavel,
  cnpj,
  kitNome,
  itens,
  totalGeral,
  quoteId,
}: {
  vendedorNome: string;
  vendedorEmail: string;
  representanteEmail: string;
  representanteNome?: string;
  nomeOrgao: string;
  nomeResponsavel: string;
  cnpj: string;
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
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #edf2f7; color: #4a5568;">${item.nomeProduto}</td>
          <td style="padding: 12px; border-bottom: 1px solid #edf2f7; color: #4a5568; text-align: center;">${item.quantidade}</td>
          <td style="padding: 12px; border-bottom: 1px solid #edf2f7; color: #4a5568; text-align: right;">${formatCurrency(item.precoUnitario)}</td>
          <td style="padding: 12px; border-bottom: 1px solid #edf2f7; color: #1a202c; text-align: right; font-weight: bold;">${formatCurrency(
            item.precoUnitario * item.quantidade
          )}</td>
        </tr>
      `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Nova Requisição de Cotação</title>
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #2d3748; background-color: #f7fafc; margin: 0; padding: 20px;">
        <div style="max-width: 700px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          
          <div style="background-color: #1a5490; padding: 30px; text-align: center;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Solicitação de Cotação</h1>
            <p style="margin: 10px 0 0 0; color: #ebf8ff; font-size: 14px; opacity: 0.9;">Protocolo: #${quoteId}</p>
          </div>

          <div style="padding: 40px;">
            
            <div style="margin-bottom: 35px;">
              <h2 style="font-size: 18px; color: #2b6cb0; border-bottom: 2px solid #bee3f8; padding-bottom: 8px; margin-bottom: 20px;">Informações do Cliente (Órgão)</h2>
              <table style="width: 100%; border-spacing: 0;">
                <tr>
                  <td style="padding: 8px 0; color: #718096; width: 140px;"><strong>Nome do Órgão:</strong></td>
                  <td style="padding: 8px 0; color: #1a202c;">${nomeOrgao}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096;"><strong>Responsável:</strong></td>
                  <td style="padding: 8px 0; color: #1a202c;">${nomeResponsavel}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096;"><strong>CNPJ:</strong></td>
                  <td style="padding: 8px 0; color: #1a202c;">${cnpj}</td>
                </tr>
              </table>
            </div>

            <div style="margin-bottom: 35px;">
              <h2 style="font-size: 18px; color: #2b6cb0; border-bottom: 2px solid #bee3f8; padding-bottom: 8px; margin-bottom: 20px;">Detalhes do Representante</h2>
              <table style="width: 100%; border-spacing: 0;">
                <tr>
                  <td style="padding: 8px 0; color: #718096; width: 140px;"><strong>Nome:</strong></td>
                  <td style="padding: 8px 0; color: #1a202c;">${representanteNome || 'Não informado'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096;"><strong>E-mail:</strong></td>
                  <td style="padding: 8px 0; color: #1a202c;">${representanteEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096;"><strong>Data da Solicitação:</strong></td>
                  <td style="padding: 8px 0; color: #1a202c;">${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</td>
                </tr>
              </table>
            </div>

            <div style="margin-bottom: 35px;">
              <h2 style="font-size: 18px; color: #2b6cb0; border-bottom: 2px solid #bee3f8; padding-bottom: 8px; margin-bottom: 20px;">Produtos Solicitados (${kitNome})</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #f8fafc;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e2e8f0; color: #4a5568; font-size: 13px;">PRODUTO</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e2e8f0; color: #4a5568; font-size: 13px;">QTD</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0; color: #4a5568; font-size: 13px;">UNITÁRIO</th>
                    <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e2e8f0; color: #4a5568; font-size: 13px;">SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                  <tr style="background-color: #f1f5f9;">
                    <td colspan="3" style="padding: 15px; text-align: right; font-weight: bold; color: #2d3748;">INVESTIMENTO TOTAL:</td>
                    <td style="padding: 15px; text-align: right; font-weight: 900; color: #1a5490; font-size: 18px;">${formatCurrency(totalGeral)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style="background-color: #fdf6b2; padding: 20px; border-radius: 8px; border-left: 4px solid #e3a008;">
              <p style="margin: 0; color: #723b13; font-weight: bold;">Ação Necessária:</p>
              <p style="margin: 10px 0 0 0; color: #723b13; line-height: 1.5;">O representante <strong>${representanteNome}</strong> aguarda o contato para tratar da cotação do projeto junto ao órgão <strong>${nomeOrgao}</strong>.</p>
            </div>

          </div>

          <div style="background-color: #f7fafc; padding: 25px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; color: #a0aec0; font-size: 12px;">Portal de Representantes Tecassistiva &copy; ${new Date().getFullYear()}</p>
            <p style="margin: 5px 0 0 0; color: #cbd5e0; font-size: 11px;">Este é um e-mail automático. Favor não responder.</p>
          </div>

        </div>
      </body>
    </html>
  `;

  try {
    const subject = `Cotação ${nomeOrgao} - Representante ${representanteNome || representanteEmail}`;
    
    // Gerar Excel (.xlsx)
    const worksheetData = itens.map(i => ({
      'Produto': i.nomeProduto,
      'Quantidade': i.quantidade,
      'Preço Unitário': formatCurrency(i.precoUnitario),
      'Subtotal': formatCurrency(i.precoUnitario * i.quantidade)
    }));

    // Adiciona linha de total no Excel
    worksheetData.push({
      'Produto': 'INVESTIMENTO TOTAL',
      'Quantidade': 0, // placeholder
      'Preço Unitário': '',
      'Subtotal': formatCurrency(totalGeral)
    });

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    
    // Ajuste de largura das colunas no Excel
    worksheet['!cols'] = [
      { wch: 60 }, // Produto
      { wch: 12 }, // Quantidade
      { wch: 20 }, // Unitário
      { wch: 20 }, // Subtotal
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Itens da Cotação');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    await resend.emails.send({
      from: fromEmail,
      to: vendedorEmail,
      subject: subject,
      html: htmlContent,
      replyTo: representanteEmail,
      attachments: [
        {
          filename: `Produtos_Cotacao_${nomeOrgao.replace(/[^a-z0-9]/gi, '_')}.xlsx`,
          content: excelBuffer,
        }
      ]
    });

    console.log(`Email enviado para ${vendedorEmail} (${vendedorNome}) com anexo Excel.`);
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
