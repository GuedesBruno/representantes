import { NextRequest, NextResponse } from 'next/server';

function normalizeExternalUrl(rawUrl: string): string | null {
  const input = rawUrl.trim();
  if (!input) return null;

  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get('url') || '';
  const normalizedUrl = normalizeExternalUrl(rawUrl);

  if (!normalizedUrl) {
    return NextResponse.json({ error: 'Invalid url.' }, { status: 400 });
  }

  const host = new URL(normalizedUrl).hostname.toLowerCase();
  if (!host.includes('vimeo.com')) {
    return NextResponse.json({ error: 'Only Vimeo urls are supported.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(normalizedUrl)}`, {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Thumbnail lookup failed.' }, { status: response.status });
    }

    const data = await response.json() as { thumbnail_url?: string };
    const thumbnailUrl = normalizeExternalUrl(data.thumbnail_url || '');

    if (!thumbnailUrl) {
      return NextResponse.json({ error: 'Thumbnail not found.' }, { status: 404 });
    }

    return NextResponse.json({ thumbnailUrl });
  } catch {
    return NextResponse.json({ error: 'Unexpected error while fetching thumbnail.' }, { status: 500 });
  }
}
