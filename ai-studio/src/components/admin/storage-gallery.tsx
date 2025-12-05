'use client';

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
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
import { getOptimizedImageUrl, preloadImages, batchGetOptimizedImageUrls } from '@/lib/image-loader';

interface StorageFile {
  name: string;
  bucket_id: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
  size: number;
  fullPath: string;
}

interface ImageCardProps {
  file: StorageFile;
  isSelected: boolean;
  onToggleSelect: (path: string) => void;
}

// Memoized image card component to prevent unnecessary re-renders
const ImageCard = memo(function ImageCard({ file, isSelected, onToggleSelect }: ImageCardProps) {
  const imageRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const imageUrl = useMemo(() => getOptimizedImageUrl(file.fullPath), [file.fullPath]);

  useEffect(() => {
    if (!imageRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '50px' } // Start loading 50px before entering viewport
    );

    observer.observe(imageRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={imageRef}
      className={`relative group cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
        isSelected
          ? 'border-primary ring-2 ring-primary'
          : 'border-border hover:border-primary/50'
      }`}
      onClick={() => onToggleSelect(file.fullPath)}
    >
      <div className="aspect-square relative bg-muted">
        {isInView ? (
          <Image
            src={imageUrl}
            alt={file.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
            loading="lazy"
            onError={(e) => {
              // Fallback to signed URL if optimized fails
              const img = e.currentTarget;
              img.src = `/api/images/proxy?path=${encodeURIComponent(file.fullPath)}`;
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(file.fullPath)}
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
});

ImageCard.displayName = 'ImageCard';

export function StorageGallery() {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [bucketFilter, setBucketFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  const pageSize = 50;

  // Debounce search query (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setPage(0); // Reset to first page on search change
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchFiles = useCallback(async (reset = false, pageOverride?: number) => {
    try {
      setLoading(true);
      const currentPage = reset ? 0 : (pageOverride ?? page);
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString(),
      });

      if (bucketFilter !== 'all') {
        params.append('bucket', bucketFilter);
      }

      if (debouncedSearchQuery) {
        params.append('search', debouncedSearchQuery);
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

      // Preload next page images in background if there are more
      if (data.files && data.files.length > 0) {
        // Preload images for current page using batch generation
        const imageFiles = data.files.filter((f: StorageFile) => {
          const ext = f.name.toLowerCase().split('.').pop();
          return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '');
        });
        
        const imagePaths = imageFiles.map((f: StorageFile) => f.fullPath);
        const imageUrls = batchGetOptimizedImageUrls(imagePaths);
        
        // Preload in background (don't await)
        preloadImages(imageUrls).catch(() => {
          // Silently fail - preloading is best effort
        });
      }
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
  }, [bucketFilter, debouncedSearchQuery, page, pageSize, toast]);

  useEffect(() => {
    fetchFiles(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketFilter, debouncedSearchQuery]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setPage(0);
  }, []);

  const handleBucketChange = useCallback((bucket: string) => {
    setBucketFilter(bucket);
    setPage(0);
  }, []);

  const toggleSelect = useCallback((path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Optimized: Filtering is now done server-side, but we still filter client-side
  // for any edge cases and to filter by image type
  const imageFiles = useMemo(() => {
    return files.filter(file => {
      const ext = file.name.toLowerCase().split('.').pop();
      return ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '');
    });
  }, [files]);

  const toggleSelectAll = useCallback(() => {
    setSelectedPaths(prev => {
      if (prev.size === imageFiles.length && imageFiles.length > 0) {
        return new Set();
      } else {
        return new Set(imageFiles.map(f => f.fullPath));
      }
    });
  }, [imageFiles]);

  const handleLoadMore = useCallback(() => {
    const nextPage = page + 1;
    setPage(nextPage);
    // Fetch with the new page number explicitly
    fetchFiles(false, nextPage);
  }, [page, fetchFiles]);

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
              {selectedPaths.size === imageFiles.length && imageFiles.length > 0 ? (
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
              Showing {imageFiles.length} of {total} files
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
            {imageFiles.map((file) => (
              <ImageCard
                key={file.fullPath}
                file={file}
                isSelected={selectedPaths.has(file.fullPath)}
                onToggleSelect={toggleSelect}
              />
            ))}
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

