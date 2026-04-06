import { NextRequest, NextResponse } from 'next/server';
import { getCloudinary } from '@/lib/cloudinary';
import { verifyAdminIdToken } from '@/lib/firebase-admin';

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
    const cloudinary = getCloudinary();
    const idToken = getBearerToken(request);

    if (!idToken) {
      return NextResponse.json({ error: 'Token ausente.' }, { status: 401 });
    }

    await verifyAdminIdToken(idToken);

    const formData = await request.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') as string | null) ?? 'representantes';
    const publicId = (formData.get('publicId') as string | null) ?? undefined;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo inválido.' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await new Promise<{
      secure_url: string;
      public_id: string;
      bytes: number;
      resource_type: string;
      original_filename?: string;
      format?: string;
    }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'auto',
          overwrite: Boolean(publicId),
          use_filename: !publicId,
          unique_filename: !publicId,
        },
        (error, uploadResult) => {
          if (error || !uploadResult) {
            reject(error ?? new Error('Falha no upload para o Cloudinary.'));
            return;
          }

          resolve(uploadResult);
        }
      );

      uploadStream.end(buffer);
    });

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
      bytes: result.bytes,
      resourceType: result.resource_type,
      originalFilename: result.original_filename,
      format: result.format,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no upload.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}