import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface DownloadBody {
  paths: string[]; // Array of full paths like "outputs/user_id/filename.jpg"
  expiresIn?: number; // Expiration in seconds, default 3600 (1 hour)
}

export async function POST(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  try {
    const body: DownloadBody = await req.json();
    const { paths, expiresIn = 3600 } = body;

    if (!Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json(
        { error: 'paths array is required' },
        { status: 400 }
      );
    }

    // Limit to prevent abuse
    if (paths.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 files per request' },
        { status: 400 }
      );
    }

    const signedUrls: Array<{
      path: string;
      url: string;
      error?: string;
    }> = [];

    // Generate signed URLs for each file
    for (const fullPath of paths) {
      const [bucket, ...pathParts] = fullPath.split('/');
      const filePath = pathParts.join('/');

      if (!bucket || !filePath) {
        signedUrls.push({
          path: fullPath,
          url: '',
          error: 'Invalid path format'
        });
        continue;
      }

      try {
        const { data, error } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(filePath, expiresIn);

        if (error) {
          signedUrls.push({
            path: fullPath,
            url: '',
            error: error.message
          });
        } else {
          signedUrls.push({
            path: fullPath,
            url: data.signedUrl
          });
        }
      } catch (error: any) {
        signedUrls.push({
          path: fullPath,
          url: '',
          error: error?.message || 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      urls: signedUrls,
      expiresIn
    });
  } catch (error) {
    console.error('[Admin Storage Download] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URLs' },
      { status: 500 }
    );
  }
}

