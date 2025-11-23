'use client';

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BulkDownload } from './bulk-download';
import { Search, Filter, CheckSquare, Square, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getOptimizedImageUrl } from '@/lib/image-loader';

interface StorageFile {
  name: string;
  bucket_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
  size: number;
  fullPath: string;
}

export function StorageGallery() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [bucketFilter, setBucketFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  const pageSize = 50;

  const fetchFiles = async (reset = false) => {
    try {
      setLoading(true);
      const currentPage = reset ? 0 : page;
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString(),
      });

      if (bucketFilter !== 'all') {
        params.append('bucket', bucketFilter);
      }

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`/api/admin/storage/list?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }

      const data = await response.json();
      
      if (reset) {
        setFiles(data.files || []);
      } else {
        setFiles(prev => [...prev, ...(data.files || [])]);
      }

      setHasMore(data.hasMore || false);
      setTotal(data.total || 0);
    } catch (error: any) {
      console.error('Error fetching files:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load files',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(true);
  }, [bucketFilter, searchQuery]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    setPage(0);
  };

  const handleBucketChange = (bucket: string) => {
    setBucketFilter(bucket);
    setPage(0);
  };

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === filteredFiles.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredFiles.map(f => f.fullPath)));
    }
  };

  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      if (bucketFilter !== 'all' && file.bucket_id !== bucketFilter) {
        return false;
      }
      if (searchQuery && !file.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [files, bucketFilter, searchQuery]);

  const imageFiles = useMemo(() => {
    return filteredFiles.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '');
    });
  }, [filteredFiles]);

  const handleLoadMore = () => {
    setPage(prev => {
      const next = prev + 1;
      fetchFiles(false);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Storage Gallery</h1>
        <p className="text-muted-foreground mt-2">
          View and download all images from storage buckets
        </p>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Filters & Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by filename..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={bucketFilter} onValueChange={handleBucketChange}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Buckets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Buckets</SelectItem>
                <SelectItem value="outputs">Outputs</SelectItem>
                <SelectItem value="refs">Refs</SelectItem>
                <SelectItem value="targets">Targets</SelectItem>
                <SelectItem value="thumbnails">Thumbnails</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={toggleSelectAll}
              className="gap-2"
            >
              {selectedPaths.size === filteredFiles.length ? (
                <>
                  <Square className="h-4 w-4" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Select All
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {filteredFiles.length} of {total} files
              {selectedPaths.size > 0 && ` • ${selectedPaths.size} selected`}
            </div>
            <BulkDownload
              selectedPaths={Array.from(selectedPaths)}
              onDownloadComplete={() => setSelectedPaths(new Set())}
            />
          </div>
        </CardContent>
      </Card>

      {/* Image Gallery */}
      {loading && files.length === 0 ? (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : imageFiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No images found</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {imageFiles.map((file) => {
              const isSelected = selectedPaths.has(file.fullPath);
              const imageUrl = getOptimizedImageUrl(file.fullPath);

              return (
                <div
                  key={file.fullPath}
                  className={`relative group cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => toggleSelect(file.fullPath)}
                >
                  <div className="aspect-square relative bg-muted">
                    <Image
                      src={imageUrl}
                      alt={file.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
                      onError={(e) => {
                        // Fallback to signed URL if optimized fails
                        const img = e.currentTarget;
                        img.src = `/api/images/proxy?path=${encodeURIComponent(file.fullPath)}`;
                      }}
                    />
                    <div className="absolute top-2 left-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(file.fullPath)}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-background/80 backdrop-blur-sm"
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-xs text-white truncate">{file.name}</p>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="secondary" className="text-xs">
                          {file.bucket_id}
                        </Badge>
                        <Badge variant="outline" className="text-xs text-white border-white/20">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                onClick={handleLoadMore}
                disabled={loading}
                variant="outline"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

