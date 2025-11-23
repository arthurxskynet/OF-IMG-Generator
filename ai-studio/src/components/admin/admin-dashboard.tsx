'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Users, Image as ImageIcon, FileText, Activity, Shield, Search, ChevronLeft, ChevronRight, ArrowUpDown, RefreshCw, Eye } from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  totalModels: number;
  totalImages: number;
  totalJobs: number;
  adminUsers: number;
  jobsByStatus: Record<string, number>;
}

interface ModelData {
  id: string;
  name: string;
  default_prompt: string;
  size: string;
  requests_default: number;
  owner_id: string;
  team_id: string | null;
  created_at: string;
  profiles?: { full_name: string | null; user_id: string } | null;
  teams?: { id: string; name: string } | null;
}

interface ImageData {
  id: string;
  output_url: string;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  user_id: string;
  model_id: string;
  created_at: string;
  profiles?: { full_name: string | null; user_id: string } | null;
  models?: { id: string; name: string } | null;
}

interface JobData {
  id: string;
  status: string;
  user_id: string;
  model_id: string;
  row_id: string;
  created_at: string;
  updated_at: string;
  error: string | null;
  profiles?: { full_name: string | null; user_id: string } | null;
  models?: { id: string; name: string } | null;
  model_rows?: { id: string } | null;
}

interface UserData {
  user_id: string;
  full_name: string | null;
  is_admin: boolean;
  created_at: string;
  models_count: number;
  images_count: number;
  jobs_count: number;
  email?: string | null;
}

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  error?: string;
}

type TabType = 'models' | 'images' | 'jobs' | 'users';
type SortOrder = 'asc' | 'desc';

function PaginationControls({ 
  page, 
  pageSize, 
  total, 
  onPageChange, 
  onPageSizeChange,
  loading 
}: { 
  page: number; 
  pageSize: number; 
  total: number; 
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading: boolean;
}) {
  const totalPages = Math.ceil(total / pageSize);
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Rows per page:</span>
        <Select value={pageSize.toString()} onValueChange={(v) => onPageSizeChange(parseInt(v))}>
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {total > 0 ? `${start}-${end} of ${total}` : '0 results'}
        </span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1 || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({ 
  children, 
  sortBy, 
  currentSortBy, 
  currentSortOrder, 
  onSort 
}: { 
  children: React.ReactNode; 
  sortBy: string; 
  currentSortBy?: string; 
  currentSortOrder?: SortOrder;
  onSort: (sortBy: string, order: SortOrder) => void;
}) {
  const isActive = currentSortBy === sortBy;
  const handleClick = () => {
    if (isActive && currentSortOrder === 'desc') {
      onSort(sortBy, 'asc');
    } else {
      onSort(sortBy, 'desc');
    }
  };

  return (
    <TableHead className="cursor-pointer hover:bg-muted/50" onClick={handleClick}>
      <div className="flex items-center gap-2">
        {children}
        <ArrowUpDown className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
    </TableHead>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('models');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Models state
  const [models, setModels] = useState<ModelData[]>([]);
  const [modelsPage, setModelsPage] = useState(0);
  const [modelsPageSize, setModelsPageSize] = useState(50);
  const [modelsTotal, setModelsTotal] = useState(0);
  const [modelsSearch, setModelsSearch] = useState('');
  const [modelsSortBy, setModelsSortBy] = useState<string>('created_at');
  const [modelsSortOrder, setModelsSortOrder] = useState<SortOrder>('desc');
  const [modelsLoading, setModelsLoading] = useState(false);

  // Images state
  const [images, setImages] = useState<ImageData[]>([]);
  const [imagesPage, setImagesPage] = useState(0);
  const [imagesPageSize, setImagesPageSize] = useState(50);
  const [imagesTotal, setImagesTotal] = useState(0);
  const [imagesSearch, setImagesSearch] = useState('');
  const [imagesSortBy, setImagesSortBy] = useState<string>('created_at');
  const [imagesSortOrder, setImagesSortOrder] = useState<SortOrder>('desc');
  const [imagesLoading, setImagesLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageData | null>(null);

  // Jobs state
  const [jobs, setJobs] = useState<JobData[]>([]);
  const [jobsPage, setJobsPage] = useState(0);
  const [jobsPageSize, setJobsPageSize] = useState(50);
  const [jobsTotal, setJobsTotal] = useState(0);
  const [jobsSearch, setJobsSearch] = useState('');
  const [jobsStatusFilter, setJobsStatusFilter] = useState<string>('all');
  const [jobsSortBy, setJobsSortBy] = useState<string>('created_at');
  const [jobsSortOrder, setJobsSortOrder] = useState<SortOrder>('desc');
  const [jobsLoading, setJobsLoading] = useState(false);

  // Users state
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersPage, setUsersPage] = useState(0);
  const [usersPageSize, setUsersPageSize] = useState(50);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersAdminFilter, setUsersAdminFilter] = useState<string>('all');
  const [usersSortBy, setUsersSortBy] = useState<string>('created_at');
  const [usersSortOrder, setUsersSortOrder] = useState<SortOrder>('desc');
  const [usersLoading, setUsersLoading] = useState(false);

  // Debounced search
  const [debouncedModelsSearch, setDebouncedModelsSearch] = useState('');
  const [debouncedImagesSearch, setDebouncedImagesSearch] = useState('');
  const [debouncedJobsSearch, setDebouncedJobsSearch] = useState('');
  const [debouncedUsersSearch, setDebouncedUsersSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedModelsSearch(modelsSearch), 300);
    return () => clearTimeout(timer);
  }, [modelsSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedImagesSearch(imagesSearch), 300);
    return () => clearTimeout(timer);
  }, [imagesSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedJobsSearch(jobsSearch), 300);
    return () => clearTimeout(timer);
  }, [jobsSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUsersSearch(usersSearch), 300);
    return () => clearTimeout(timer);
  }, [usersSearch]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch (err: any) {
      console.error('Error fetching stats:', err);
    }
  }, []);

  // Fetch models
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'models',
        limit: modelsPageSize.toString(),
        offset: (modelsPage * modelsPageSize).toString(),
        sortBy: modelsSortBy,
        sortOrder: modelsSortOrder,
      });
      if (debouncedModelsSearch) {
        params.append('search', debouncedModelsSearch);
      }

      const res = await fetch(`/api/admin/data?${params}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch models: ${res.statusText}`);
      }
      const data: PaginatedResponse<ModelData> = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setModels(data.data || []);
      setModelsTotal(data.total || 0);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching models:', err);
      setError(err.message);
      setModels([]);
      setModelsTotal(0);
    } finally {
      setModelsLoading(false);
    }
  }, [modelsPage, modelsPageSize, modelsSortBy, modelsSortOrder, debouncedModelsSearch]);

  // Fetch images
  const fetchImages = useCallback(async () => {
    setImagesLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'images',
        limit: imagesPageSize.toString(),
        offset: (imagesPage * imagesPageSize).toString(),
        sortBy: imagesSortBy,
        sortOrder: imagesSortOrder,
      });
      if (debouncedImagesSearch) {
        params.append('search', debouncedImagesSearch);
      }

      const res = await fetch(`/api/admin/data?${params}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch images: ${res.statusText}`);
      }
      const data: PaginatedResponse<ImageData> = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setImages(data.data || []);
      setImagesTotal(data.total || 0);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching images:', err);
      setError(err.message);
      setImages([]);
      setImagesTotal(0);
    } finally {
      setImagesLoading(false);
    }
  }, [imagesPage, imagesPageSize, imagesSortBy, imagesSortOrder, debouncedImagesSearch]);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'jobs',
        limit: jobsPageSize.toString(),
        offset: (jobsPage * jobsPageSize).toString(),
        sortBy: jobsSortBy,
        sortOrder: jobsSortOrder,
      });
      if (debouncedJobsSearch) {
        params.append('search', debouncedJobsSearch);
      }
      if (jobsStatusFilter !== 'all') {
        params.append('status', jobsStatusFilter);
      }

      const res = await fetch(`/api/admin/data?${params}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch jobs: ${res.statusText}`);
      }
      const data: PaginatedResponse<JobData> = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setJobs(data.data || []);
      setJobsTotal(data.total || 0);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching jobs:', err);
      setError(err.message);
      setJobs([]);
      setJobsTotal(0);
    } finally {
      setJobsLoading(false);
    }
  }, [jobsPage, jobsPageSize, jobsSortBy, jobsSortOrder, debouncedJobsSearch, jobsStatusFilter]);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'users',
        limit: usersPageSize.toString(),
        offset: (usersPage * usersPageSize).toString(),
        sortBy: usersSortBy,
        sortOrder: usersSortOrder,
      });
      if (debouncedUsersSearch) {
        params.append('search', debouncedUsersSearch);
      }
      if (usersAdminFilter !== 'all') {
        params.append('adminFilter', usersAdminFilter);
      }

      const res = await fetch(`/api/admin/data?${params}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch users: ${res.statusText}`);
      }
      const data: PaginatedResponse<UserData> = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setUsers(data.data || []);
      setUsersTotal(data.total || 0);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message);
      setUsers([]);
      setUsersTotal(0);
    } finally {
      setUsersLoading(false);
    }
  }, [usersPage, usersPageSize, usersSortBy, usersSortOrder, debouncedUsersSearch, usersAdminFilter]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await Promise.all([fetchStats(), fetchModels(), fetchImages(), fetchJobs(), fetchUsers()]);
      } catch (err: any) {
        setError(err.message || 'Failed to load admin data');
      } finally {
        setLoading(false);
      }
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch data when filters change (reset to page 0)
  useEffect(() => {
    if (activeTab === 'models') {
      setModelsPage(0);
    }
  }, [activeTab, modelsPageSize, modelsSortBy, modelsSortOrder, debouncedModelsSearch]);

  useEffect(() => {
    if (activeTab === 'images') {
      setImagesPage(0);
    }
  }, [activeTab, imagesPageSize, imagesSortBy, imagesSortOrder, debouncedImagesSearch]);

  useEffect(() => {
    if (activeTab === 'jobs') {
      setJobsPage(0);
    }
  }, [activeTab, jobsPageSize, jobsSortBy, jobsSortOrder, debouncedJobsSearch, jobsStatusFilter]);

  useEffect(() => {
    if (activeTab === 'users') {
      setUsersPage(0);
    }
  }, [activeTab, usersPageSize, usersSortBy, usersSortOrder, debouncedUsersSearch, usersAdminFilter]);

  // Fetch data when page or filters change
  useEffect(() => {
    if (activeTab === 'models') {
      fetchModels();
    }
  }, [activeTab, modelsPage, modelsPageSize, modelsSortBy, modelsSortOrder, debouncedModelsSearch, fetchModels]);

  useEffect(() => {
    if (activeTab === 'images') {
      fetchImages();
    }
  }, [activeTab, imagesPage, imagesPageSize, imagesSortBy, imagesSortOrder, debouncedImagesSearch, fetchImages]);

  useEffect(() => {
    if (activeTab === 'jobs') {
      fetchJobs();
    }
  }, [activeTab, jobsPage, jobsPageSize, jobsSortBy, jobsSortOrder, debouncedJobsSearch, jobsStatusFilter, fetchJobs]);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab, usersPage, usersPageSize, usersSortBy, usersSortOrder, debouncedUsersSearch, usersAdminFilter, fetchUsers]);

  const handleRefresh = () => {
    fetchStats();
    if (activeTab === 'models') fetchModels();
    else if (activeTab === 'images') fetchImages();
    else if (activeTab === 'jobs') fetchJobs();
    else if (activeTab === 'users') fetchUsers();
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'succeeded':
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      case 'running':
      case 'submitted':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Overview of all system data and statistics
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                {stats.adminUsers} admin users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Models</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalModels}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Images</CardTitle>
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalImages}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalJobs}</div>
              <div className="flex flex-wrap gap-1 mt-2">
                {Object.entries(stats.jobsByStatus).map(([status, count]) => (
                  <Badge key={status} variant="outline" className="text-xs">
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Data Tables */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="models">Models ({modelsTotal})</TabsTrigger>
          <TabsTrigger value="images">Images ({imagesTotal})</TabsTrigger>
          <TabsTrigger value="jobs">Jobs ({jobsTotal})</TabsTrigger>
          <TabsTrigger value="users">Users ({usersTotal})</TabsTrigger>
        </TabsList>

        {/* Models Tab */}
        <TabsContent value="models" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Models</CardTitle>
              <CardDescription>All models created by all users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or owner..."
                    value={modelsSearch}
                    onChange={(e) => setModelsSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              {modelsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                </div>
              ) : models.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No models found</div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableHeader
                            sortBy="name"
                            currentSortBy={modelsSortBy}
                            currentSortOrder={modelsSortOrder}
                            onSort={(by, order) => {
                              setModelsSortBy(by);
                              setModelsSortOrder(order);
                            }}
                          >
                            Name
                          </SortableHeader>
                          <SortableHeader
                            sortBy="profiles.full_name"
                            currentSortBy={modelsSortBy}
                            currentSortOrder={modelsSortOrder}
                            onSort={(by, order) => {
                              setModelsSortBy('owner_id');
                              setModelsSortOrder(order);
                            }}
                          >
                            Owner
                          </SortableHeader>
                          <TableHead>Team</TableHead>
                          <TableHead>Default Prompt</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead>Requests</TableHead>
                          <SortableHeader
                            sortBy="created_at"
                            currentSortBy={modelsSortBy}
                            currentSortOrder={modelsSortOrder}
                            onSort={(by, order) => {
                              setModelsSortBy(by);
                              setModelsSortOrder(order);
                            }}
                          >
                            Created
                          </SortableHeader>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {models.map((model) => (
                          <TableRow key={model.id}>
                            <TableCell className="font-medium">{model.name}</TableCell>
                            <TableCell>{model.profiles?.full_name || model.owner_id.slice(0, 8)}</TableCell>
                            <TableCell>{model.teams?.name || '-'}</TableCell>
                            <TableCell className="max-w-xs truncate" title={model.default_prompt}>
                              {model.default_prompt || '-'}
                            </TableCell>
                            <TableCell>{model.size || '-'}</TableCell>
                            <TableCell>{model.requests_default || '-'}</TableCell>
                            <TableCell>{new Date(model.created_at).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationControls
                    page={modelsPage}
                    pageSize={modelsPageSize}
                    total={modelsTotal}
                    onPageChange={setModelsPage}
                    onPageSizeChange={(size) => {
                      setModelsPageSize(size);
                      setModelsPage(0);
                    }}
                    loading={modelsLoading}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Images Tab */}
        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Generated Images</CardTitle>
              <CardDescription>All images generated by all users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by user or model..."
                    value={imagesSearch}
                    onChange={(e) => setImagesSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
              {imagesLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                </div>
              ) : images.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No images found</div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Thumbnail</TableHead>
                          <SortableHeader
                            sortBy="models.name"
                            currentSortBy={imagesSortBy}
                            currentSortOrder={imagesSortOrder}
                            onSort={(by, order) => {
                              setImagesSortBy('model_id');
                              setImagesSortOrder(order);
                            }}
                          >
                            Model
                          </SortableHeader>
                          <SortableHeader
                            sortBy="profiles.full_name"
                            currentSortBy={imagesSortBy}
                            currentSortOrder={imagesSortOrder}
                            onSort={(by, order) => {
                              setImagesSortBy('user_id');
                              setImagesSortOrder(order);
                            }}
                          >
                            User
                          </SortableHeader>
                          <TableHead>Dimensions</TableHead>
                          <SortableHeader
                            sortBy="created_at"
                            currentSortBy={imagesSortBy}
                            currentSortOrder={imagesSortOrder}
                            onSort={(by, order) => {
                              setImagesSortBy(by);
                              setImagesSortOrder(order);
                            }}
                          >
                            Created
                          </SortableHeader>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {images.map((image) => (
                          <TableRow key={image.id}>
                            <TableCell>
                              <div className="relative w-16 h-16 rounded overflow-hidden bg-muted">
                                {image.thumbnail_url ? (
                                  <Image
                                    src={image.thumbnail_url}
                                    alt="Thumbnail"
                                    fill
                                    className="object-cover"
                                    sizes="64px"
                                  />
                                ) : (
                                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                                    <ImageIcon className="h-6 w-6" />
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{image.models?.name || image.model_id.slice(0, 8)}</TableCell>
                            <TableCell>{image.profiles?.full_name || image.user_id.slice(0, 8)}</TableCell>
                            <TableCell>
                              {image.width && image.height ? `${image.width}×${image.height}` : '-'}
                            </TableCell>
                            <TableCell>{new Date(image.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>
                              <Dialog>
                                <DialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedImage(image)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-4xl">
                                  <DialogHeader>
                                    <DialogTitle>Image Preview</DialogTitle>
                                  </DialogHeader>
                                  <div className="relative w-full h-[600px] rounded overflow-hidden bg-muted">
                                    {image.thumbnail_url || image.output_url ? (
                                      <Image
                                        src={image.thumbnail_url || image.output_url}
                                        alt="Preview"
                                        fill
                                        className="object-contain"
                                        sizes="100vw"
                                      />
                                    ) : (
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <p className="text-muted-foreground">No preview available</p>
                                      </div>
                                    )}
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationControls
                    page={imagesPage}
                    pageSize={imagesPageSize}
                    total={imagesTotal}
                    onPageChange={setImagesPage}
                    onPageSizeChange={(size) => {
                      setImagesPageSize(size);
                      setImagesPage(0);
                    }}
                    loading={imagesLoading}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Jobs</CardTitle>
              <CardDescription>All jobs across all users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by user or model..."
                    value={jobsSearch}
                    onChange={(e) => setJobsSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={jobsStatusFilter} onValueChange={setJobsStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="succeeded">Succeeded</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {jobsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                </div>
              ) : jobs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No jobs found</div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableHeader
                            sortBy="status"
                            currentSortBy={jobsSortBy}
                            currentSortOrder={jobsSortOrder}
                            onSort={(by, order) => {
                              setJobsSortBy(by);
                              setJobsSortOrder(order);
                            }}
                          >
                            Status
                          </SortableHeader>
                          <SortableHeader
                            sortBy="profiles.full_name"
                            currentSortBy={jobsSortBy}
                            currentSortOrder={jobsSortOrder}
                            onSort={(by, order) => {
                              setJobsSortBy('user_id');
                              setJobsSortOrder(order);
                            }}
                          >
                            User
                          </SortableHeader>
                          <TableHead>Model</TableHead>
                          <TableHead>Row ID</TableHead>
                          <SortableHeader
                            sortBy="created_at"
                            currentSortBy={jobsSortBy}
                            currentSortOrder={jobsSortOrder}
                            onSort={(by, order) => {
                              setJobsSortBy(by);
                              setJobsSortOrder(order);
                            }}
                          >
                            Created
                          </SortableHeader>
                          <SortableHeader
                            sortBy="updated_at"
                            currentSortBy={jobsSortBy}
                            currentSortOrder={jobsSortOrder}
                            onSort={(by, order) => {
                              setJobsSortBy(by);
                              setJobsSortOrder(order);
                            }}
                          >
                            Updated
                          </SortableHeader>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {jobs.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell>
                              <Badge variant={getStatusBadgeVariant(job.status)}>
                                {job.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{job.profiles?.full_name || job.user_id.slice(0, 8)}</TableCell>
                            <TableCell>{job.models?.name || job.model_id.slice(0, 8)}</TableCell>
                            <TableCell className="font-mono text-xs">{job.row_id.slice(0, 8)}</TableCell>
                            <TableCell>{new Date(job.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>{new Date(job.updated_at).toLocaleDateString()}</TableCell>
                            <TableCell>
                              {job.error ? (
                                <span className="text-xs text-red-500 truncate max-w-xs block" title={job.error}>
                                  {job.error}
                                </span>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationControls
                    page={jobsPage}
                    pageSize={jobsPageSize}
                    total={jobsTotal}
                    onPageChange={setJobsPage}
                    onPageSizeChange={(size) => {
                      setJobsPageSize(size);
                      setJobsPage(0);
                    }}
                    loading={jobsLoading}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Users</CardTitle>
              <CardDescription>All registered users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name..."
                    value={usersSearch}
                    onChange={(e) => setUsersSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={usersAdminFilter} onValueChange={setUsersAdminFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="admin">Admins Only</SelectItem>
                    <SelectItem value="non-admin">Non-Admins</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {usersLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No users found</div>
              ) : (
                <>
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableHeader
                            sortBy="full_name"
                            currentSortBy={usersSortBy}
                            currentSortOrder={usersSortOrder}
                            onSort={(by, order) => {
                              setUsersSortBy(by);
                              setUsersSortOrder(order);
                            }}
                          >
                            Name
                          </SortableHeader>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <SortableHeader
                            sortBy="models_count"
                            currentSortBy={usersSortBy}
                            currentSortOrder={usersSortOrder}
                            onSort={(by, order) => {
                              setUsersSortBy(by);
                              setUsersSortOrder(order);
                            }}
                          >
                            Models
                          </SortableHeader>
                          <TableHead>Images</TableHead>
                          <TableHead>Jobs</TableHead>
                          <SortableHeader
                            sortBy="created_at"
                            currentSortBy={usersSortBy}
                            currentSortOrder={usersSortOrder}
                            onSort={(by, order) => {
                              setUsersSortBy(by);
                              setUsersSortOrder(order);
                            }}
                          >
                            Created
                          </SortableHeader>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((user) => (
                          <TableRow key={user.user_id}>
                            <TableCell className="font-medium">
                              {user.full_name || 'Unnamed User'}
                            </TableCell>
                            <TableCell>{user.email || '-'}</TableCell>
                            <TableCell>
                              {user.is_admin ? (
                                <Badge variant="default" className="gap-1">
                                  <Shield className="h-3 w-3" />
                                  Admin
                                </Badge>
                              ) : (
                                <Badge variant="outline">User</Badge>
                              )}
                            </TableCell>
                            <TableCell>{user.models_count}</TableCell>
                            <TableCell>{user.images_count}</TableCell>
                            <TableCell>{user.jobs_count}</TableCell>
                            <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <PaginationControls
                    page={usersPage}
                    pageSize={usersPageSize}
                    total={usersTotal}
                    onPageChange={setUsersPage}
                    onPageSizeChange={(size) => {
                      setUsersPageSize(size);
                      setUsersPage(0);
                    }}
                    loading={usersLoading}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
