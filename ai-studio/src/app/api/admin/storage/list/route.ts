import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface ListStorageQuery {
  bucket?: string;
  limit?: string;
  offset?: string;
  search?: string;
}

export async function GET(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  try {
    const { searchParams } = new URL(req.url);
    const bucket = searchParams.get('bucket') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const search = searchParams.get('search') || undefined;

    const buckets = bucket 
      ? [bucket] 
      : ['outputs', 'refs', 'targets', 'thumbnails'];

    const allFiles: Array<{
      name: string;
      bucket_id: string;
      created_at: string;
      updated_at: string;
      metadata: Record<string, any>;
      size: number;
      fullPath: string;
    }> = [];

    // List files from each bucket
    for (const bucketId of buckets) {
      const { data: files, error } = await supabaseAdmin.storage
        .from(bucketId)
        .list('', {
          limit: 1000, // Supabase limit
          offset: 0,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        console.error(`[Admin Storage] Error listing ${bucketId}:`, error);
        continue;
      }

      if (files) {
        // Recursively list files (handle nested folders)
        // In Supabase storage: files have an 'id' property, folders don't
        const processFiles = async (path: string, items: any[]): Promise<void> => {
          for (const item of items) {
            if (!item.name) continue;

            // If it has an id, it's a file
            if (item.id) {
              const fullPath = path ? `${path}/${item.name}` : item.name;
              
              // Apply search filter if provided
              if (search && !fullPath.toLowerCase().includes(search.toLowerCase())) {
                continue;
              }

              allFiles.push({
                name: item.name,
                bucket_id: bucketId,
                created_at: item.created_at || item.updated_at || new Date().toISOString(),
                updated_at: item.updated_at || item.created_at || new Date().toISOString(),
                metadata: item.metadata || {},
                size: item.metadata?.size || 0,
                fullPath: `${bucketId}/${fullPath}`
              });
            } else {
              // It's a folder (no id), recurse into it
              const folderPath = path ? `${path}/${item.name}` : item.name;
              const { data: folderFiles } = await supabaseAdmin.storage
                .from(bucketId)
                .list(folderPath, { limit: 1000 });
              
              if (folderFiles && folderFiles.length > 0) {
                await processFiles(folderPath, folderFiles);
              }
            }
          }
        };

        await processFiles('', files);
      }
    }

    // Sort by created_at descending
    allFiles.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Apply pagination
    const paginatedFiles = allFiles.slice(offset, offset + limit);

    return NextResponse.json({
      files: paginatedFiles,
      total: allFiles.length,
      limit,
      offset,
      hasMore: offset + limit < allFiles.length
    });
  } catch (error) {
    console.error('[Admin Storage List] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to list storage files' },
      { status: 500 }
    );
  }
}

