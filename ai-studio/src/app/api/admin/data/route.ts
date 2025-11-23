import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-middleware';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface QueryParams {
  type?: string; // 'models' | 'images' | 'jobs' | 'users'
  limit?: string;
  offset?: string;
  search?: string;
  status?: string; // For jobs filter
  adminFilter?: string; // For users filter: 'all' | 'admin' | 'non-admin'
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

async function fetchModels(supabase: any, params: QueryParams) {
  const limit = parseInt(params.limit || '50');
  const offset = parseInt(params.offset || '0');
  const search = params.search?.toLowerCase() || '';
  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder === 'asc' ? true : false;

  let query = supabase
    .from('models')
    .select(`
      id,
      name,
      default_prompt,
      size,
      requests_default,
      owner_id,
      team_id,
      created_at,
      profiles!models_owner_id_fkey(full_name, user_id),
      teams(id, name)
    `, { count: 'exact' });

  // Apply search filter
  if (search) {
    query = query.or(`name.ilike.%${search}%,profiles.full_name.ilike.%${search}%`);
  }

  // Apply sorting - map sortBy to actual column names
  // Only sort by columns that exist in the models table
  const validSortColumns = ['id', 'name', 'owner_id', 'team_id', 'created_at', 'size', 'requests_default'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  query = query.order(sortColumn, { ascending: sortOrder });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const result = await query;
  
  if (result.error) {
    console.error('[Admin Data] Error fetching models:', result.error);
    return {
      data: [],
      total: 0,
      hasMore: false,
      error: result.error.message
    };
  }
  
  return {
    data: result.data || [],
    total: result.count || 0,
    hasMore: (result.count || 0) > offset + limit
  };
}

async function fetchImages(supabase: any, params: QueryParams) {
  const limit = parseInt(params.limit || '50');
  const offset = parseInt(params.offset || '0');
  const search = params.search?.toLowerCase() || '';
  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder === 'asc' ? true : false;

  let query = supabase
    .from('generated_images')
    .select(`
      id,
      output_url,
      thumbnail_url,
      width,
      height,
      user_id,
      model_id,
      created_at,
      profiles!generated_images_user_id_fkey(full_name, user_id),
      models!generated_images_model_id_fkey(id, name)
    `, { count: 'exact' });

  // Apply search filter
  if (search) {
    query = query.or(`profiles.full_name.ilike.%${search}%,models.name.ilike.%${search}%`);
  }

  // Apply sorting - map sortBy to actual column names
  // Only sort by columns that exist in the generated_images table
  const validSortColumns = ['id', 'user_id', 'model_id', 'created_at', 'width', 'height'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  query = query.order(sortColumn, { ascending: sortOrder });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const result = await query;
  
  if (result.error) {
    console.error('[Admin Data] Error fetching images:', result.error);
    return {
      data: [],
      total: 0,
      hasMore: false,
      error: result.error.message
    };
  }
  
  return {
    data: result.data || [],
    total: result.count || 0,
    hasMore: (result.count || 0) > offset + limit
  };
}

async function fetchJobs(supabase: any, params: QueryParams) {
  const limit = parseInt(params.limit || '50');
  const offset = parseInt(params.offset || '0');
  const search = params.search?.toLowerCase() || '';
  const statusFilter = params.status;
  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder === 'asc' ? true : false;

  let query = supabase
    .from('jobs')
    .select(`
      id,
      status,
      user_id,
      model_id,
      row_id,
      created_at,
      updated_at,
      error,
      profiles!jobs_user_id_fkey(full_name, user_id),
      models!jobs_model_id_fkey(id, name),
      model_rows!jobs_row_id_fkey(id)
    `, { count: 'exact' });

  // Apply status filter
  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  // Apply search filter
  if (search) {
    query = query.or(`profiles.full_name.ilike.%${search}%,models.name.ilike.%${search}%`);
  }

  // Apply sorting - map sortBy to actual column names
  // Only sort by columns that exist in the jobs table
  const validSortColumns = ['id', 'status', 'user_id', 'model_id', 'row_id', 'created_at', 'updated_at'];
  const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
  query = query.order(sortColumn, { ascending: sortOrder });

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const result = await query;
  
  if (result.error) {
    console.error('[Admin Data] Error fetching jobs:', result.error);
    return {
      data: [],
      total: 0,
      hasMore: false,
      error: result.error.message
    };
  }
  
  return {
    data: result.data || [],
    total: result.count || 0,
    hasMore: (result.count || 0) > offset + limit
  };
}

async function fetchUsers(supabase: any, params: QueryParams) {
  const limit = parseInt(params.limit || '50');
  const offset = parseInt(params.offset || '0');
  const search = params.search?.toLowerCase() || '';
  const adminFilter = params.adminFilter || 'all';
  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder === 'asc' ? true : false;

  // First, get user IDs with filters
  let userQuery = supabase
    .from('profiles')
    .select('user_id', { count: 'exact' });

  if (adminFilter === 'admin') {
    userQuery = userQuery.eq('is_admin', true);
  } else if (adminFilter === 'non-admin') {
    userQuery = userQuery.eq('is_admin', false);
  }

  if (search) {
    userQuery = userQuery.or(`full_name.ilike.%${search}%`);
  }

  const userResult = await userQuery;
  
  if (userResult.error) {
    console.error('[Admin Data] Error fetching users (initial query):', userResult.error);
    return {
      data: [],
      total: 0,
      hasMore: false,
      error: userResult.error.message
    };
  }
  
  const userIds = userResult.data?.map((u: any) => u.user_id) || [];
  const totalUsers = userResult.count || 0;

  if (userIds.length === 0) {
    return {
      data: [],
      total: 0,
      hasMore: false
    };
  }

  // Get user stats (counts) for each user
  const [usersResult, modelsCounts, imagesCounts, jobsCounts] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, full_name, is_admin, created_at')
      .in('user_id', userIds)
      .order(sortBy, { ascending: sortOrder })
      .range(offset, offset + limit - 1),
    
    // Get model counts per user
    supabase
      .from('models')
      .select('owner_id')
      .in('owner_id', userIds),
    
    // Get image counts per user
    supabase
      .from('generated_images')
      .select('user_id')
      .in('user_id', userIds),
    
    // Get job counts per user
    supabase
      .from('jobs')
      .select('user_id')
      .in('user_id', userIds)
  ]);

  // Check for errors
  if (usersResult.error) {
    console.error('[Admin Data] Error fetching users:', usersResult.error);
    return {
      data: [],
      total: 0,
      hasMore: false,
      error: usersResult.error.message
    };
  }
  
  if (modelsCounts.error) {
    console.error('[Admin Data] Error fetching model counts:', modelsCounts.error);
  }
  if (imagesCounts.error) {
    console.error('[Admin Data] Error fetching image counts:', imagesCounts.error);
  }
  if (jobsCounts.error) {
    console.error('[Admin Data] Error fetching job counts:', jobsCounts.error);
  }

  // Aggregate counts
  const modelCountMap = new Map<string, number>();
  (modelsCounts.data || []).forEach((m: any) => {
    modelCountMap.set(m.owner_id, (modelCountMap.get(m.owner_id) || 0) + 1);
  });

  const imageCountMap = new Map<string, number>();
  (imagesCounts.data || []).forEach((img: any) => {
    imageCountMap.set(img.user_id, (imageCountMap.get(img.user_id) || 0) + 1);
  });

  const jobCountMap = new Map<string, number>();
  (jobsCounts.data || []).forEach((job: any) => {
    jobCountMap.set(job.user_id, (jobCountMap.get(job.user_id) || 0) + 1);
  });

  // Get email from auth.users (we'll need to do this separately or use a view)
  const usersWithStats = (usersResult.data || []).map((user: any) => ({
    ...user,
    models_count: modelCountMap.get(user.user_id) || 0,
    images_count: imageCountMap.get(user.user_id) || 0,
    jobs_count: jobCountMap.get(user.user_id) || 0,
    email: null // We'll fetch this separately if needed
  }));

  return {
    data: usersWithStats,
    total: totalUsers,
    hasMore: totalUsers > offset + limit
  };
}

export async function GET(req: NextRequest) {
  const forbidden = await requireAdmin(req);
  if (forbidden) return forbidden;

  try {
    // Use admin client to bypass RLS for admin queries
    // This ensures admins can see all data regardless of RLS policies
    const supabase = supabaseAdmin;
    const { searchParams } = new URL(req.url);
    
    console.log('[Admin Data] Fetching data with type:', searchParams.get('type'));
    
    const params: QueryParams = {
      type: searchParams.get('type') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
      search: searchParams.get('search') || undefined,
      status: searchParams.get('status') || undefined,
      adminFilter: searchParams.get('adminFilter') || undefined,
      sortBy: searchParams.get('sortBy') || undefined,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined,
    };

    // If type is specified, return only that type with pagination
    if (params.type) {
      let result;
      switch (params.type) {
        case 'models':
          result = await fetchModels(supabase, params);
          if (result.error) {
            console.error('[Admin Data] Models fetch error:', result.error);
            return NextResponse.json(
              { error: result.error || 'Failed to fetch models', data: [], total: 0, hasMore: false },
              { status: 500 }
            );
          }
          return NextResponse.json(result);
        case 'images':
          result = await fetchImages(supabase, params);
          if (result.error) {
            console.error('[Admin Data] Images fetch error:', result.error);
            return NextResponse.json(
              { error: result.error || 'Failed to fetch images', data: [], total: 0, hasMore: false },
              { status: 500 }
            );
          }
          return NextResponse.json(result);
        case 'jobs':
          result = await fetchJobs(supabase, params);
          if (result.error) {
            console.error('[Admin Data] Jobs fetch error:', result.error);
            return NextResponse.json(
              { error: result.error || 'Failed to fetch jobs', data: [], total: 0, hasMore: false },
              { status: 500 }
            );
          }
          return NextResponse.json(result);
        case 'users':
          result = await fetchUsers(supabase, params);
          if (result.error) {
            console.error('[Admin Data] Users fetch error:', result.error);
            return NextResponse.json(
              { error: result.error || 'Failed to fetch users', data: [], total: 0, hasMore: false },
              { status: 500 }
            );
          }
          return NextResponse.json(result);
        default:
          return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
      }
    }

    // Legacy: Return all data (for backward compatibility, but with limits)
    const [modelsResult, imagesResult, jobsResult, usersResult] = await Promise.all([
      fetchModels(supabase, { limit: '50', offset: '0' }),
      fetchImages(supabase, { limit: '50', offset: '0' }),
      fetchJobs(supabase, { limit: '50', offset: '0' }),
      fetchUsers(supabase, { limit: '50', offset: '0' })
    ]);

    return NextResponse.json({
      models: modelsResult.data,
      images: imagesResult.data,
      jobs: jobsResult.data,
      users: usersResult.data,
      pagination: {
        models: { total: modelsResult.total, hasMore: modelsResult.hasMore },
        images: { total: imagesResult.total, hasMore: imagesResult.hasMore },
        jobs: { total: jobsResult.total, hasMore: jobsResult.hasMore },
        users: { total: usersResult.total, hasMore: usersResult.hasMore },
      }
    });
  } catch (error) {
    console.error('[Admin Data] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch admin data' },
      { status: 500 }
    );
  }
}

