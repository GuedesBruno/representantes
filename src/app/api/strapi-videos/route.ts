import { NextResponse } from 'next/server';

export async function GET() {
  // Use a URL base do Strapi definida no .env ou o fallback padrão (Strapi Cloud)
  const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || 'https://innovative-friendship-159ff40007.strapiapp.com';
  
  try {
    // Busca os produtos do Strapi populando todos os campos (incluindo mídia e documentos)
    const response = await fetch(`${STRAPI_URL}/api/produtos?populate=*&pagination[pageSize]=100`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      // Opcional: revalidação a cada hora para não sobrecarregar o Strapi
      next: { revalidate: 3600 } 
    });

    if (!response.ok) {
      console.error(`Erro ao buscar dados do Strapi: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: 'Falha ao buscar dados do Strapi' }, 
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Retornamos o JSON bruto do Strapi, pois o frontend já tem a lógica de mapeamento
    return NextResponse.json(data);
  } catch (error) {
    console.error('Erro na rota API Strapi:', error);
    return NextResponse.json(
      { error: 'Erro interno ao processar vídeos do Strapi' }, 
      { status: 500 }
    );
  }
}
