import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { createServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  try {
    const supabase = await createServer();

    // Fetch statistics
    const [
      usersCount,
      modelsCount,
      imagesCount,
      jobsCount,
      jobsByStatus,
      adminUsersCount
    ] = await Promise.all([
      // Total users
      supabase.from('profiles').select('user_id', { count: 'exact', head: true }),
      
      // Total models
      supabase.from('models').select('id', { count: 'exact', head: true }),
      
      // Total images
      supabase.from('generated_images').select('id', { count: 'exact', head: true }),
      
      // Total jobs
      supabase.from('jobs').select('id', { count: 'exact', head: true }),
      
      // Jobs by status
      supabase
        .from('jobs')
        .select('status')
        .then(result => {
          if (result.error) return {};
          const statusCounts: Record<string, number> = {};
          result.data?.forEach(job => {
            statusCounts[job.status] = (statusCounts[job.status] || 0) + 1;
          });
          return statusCounts;
        }),
      
      // Admin users count
      supabase
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('is_admin', true)
    ]);

    return NextResponse.json({
      totalUsers: usersCount.count || 0,
      totalModels: modelsCount.count || 0,
      totalImages: imagesCount.count || 0,
      totalJobs: jobsCount.count || 0,
      adminUsers: adminUsersCount.count || 0,
      jobsByStatus: jobsByStatus || {},
    });
  } catch (error) {
    console.error('[Admin Stats] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin statistics' },
      { status: 500 }
    );
  }
}

