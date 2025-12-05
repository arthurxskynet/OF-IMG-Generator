import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 60; // Cache for 60 seconds

interface ListStorageQuery {
  bucket?: string;
  limit?: string;
  offset?: string;
  search?: string;
}

interface StorageFile {
  name: string;
  bucket_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
  size: number;
  fullPath: string;
}

/**
 * Generate content-based key for deduplication
 * Uses size + filename pattern to identify likely duplicates
 */
function getContentKey(file: StorageFile): string {
  const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
  // Extract base name pattern (remove timestamps and random suffixes)
  const basePattern = nameWithoutExt
    .replace(/\d{13,}/g, '') // Remove long timestamps
    .replace(/-[a-z0-9]{6,}$/i, '') // Remove random suffixes
    .toLowerCase();
  return `${file.size}-${basePattern}`;
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

    // Track seen paths for path-based deduplication
    const seenPaths = new Set<string>();
    // Track content keys for content-based deduplication
    const seenContentKeys = new Set<string>();
    
    const allFiles: StorageFile[] = [];
    const searchLower = search?.toLowerCase();

    // Process buckets in parallel for better performance
    await Promise.all(
      buckets.map(async (bucketId) => {
        try {
          const { data: files, error } = await supabaseAdmin.storage
            .from(bucketId)
            .list('', {
              limit: 1000, // Supabase limit
              offset: 0,
              sortBy: { column: 'created_at', order: 'desc' }
            });

          if (error) {
            console.error(`[Admin Storage] Error listing ${bucketId}:`, error);
            return;
          }

          if (!files) return;

          // Recursively list files (handle nested folders)
          // In Supabase storage: files have an 'id' property, folders don't
          const processFiles = async (path: string, items: any[]): Promise<void> => {
            for (const item of items) {
              if (!item.name) continue;

              // If it has an id, it's a file
              if (item.id) {
                const fullPath = path ? `${path}/${item.name}` : item.name;
                const normalizedFullPath = `${bucketId}/${fullPath}`;
                
                // Early filtering: Apply search filter before processing
                if (searchLower && !normalizedFullPath.toLowerCase().includes(searchLower)) {
                  continue;
                }

                // Path-based deduplication: Skip if we've seen this exact path
                if (seenPaths.has(normalizedFullPath)) {
                  continue;
                }

                const file: StorageFile = {
                  name: item.name,
                  bucket_id: bucketId,
                  created_at: item.created_at || item.updated_at || new Date().toISOString(),
                  updated_at: item.updated_at || item.created_at || new Date().toISOString(),
                  metadata: item.metadata || {},
                  size: item.metadata?.size || 0,
                  fullPath: normalizedFullPath
                };

                // Content-based deduplication: Skip if we've seen same content key
                // Only apply for files with size > 0 (meaningful content)
                if (file.size > 0) {
                  const contentKey = getContentKey(file);
                  if (seenContentKeys.has(contentKey)) {
                    continue;
                  }
                  seenContentKeys.add(contentKey);
                }

                // Mark path as seen and add file
                seenPaths.add(normalizedFullPath);
                allFiles.push(file);
              } else {
                // It's a folder (no id), recurse into it
                const folderPath = path ? `${path}/${item.name}` : item.name;
                
                // Early exit: Skip folder if search doesn't match and we're searching
                if (searchLower && !folderPath.toLowerCase().includes(searchLower)) {
                  // Still need to check files inside, but can skip if folder name doesn't match
                  // For now, we'll still recurse to be safe
                }
                
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
        } catch (error) {
          console.error(`[Admin Storage] Error processing bucket ${bucketId}:`, error);
        }
      })
    );

    // Sort by created_at descending
    allFiles.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Apply pagination
    const paginatedFiles = allFiles.slice(offset, offset + limit);

    const response = NextResponse.json({
      files: paginatedFiles,
      total: allFiles.length,
      limit,
      offset,
      hasMore: offset + limit < allFiles.length
    });

    // Add cache headers for better performance
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=60, stale-while-revalidate=120'
    );

    return response;
  } catch (error) {
    console.error('[Admin Storage List] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to list storage files' },
      { status: 500 }
    );
  }
}

