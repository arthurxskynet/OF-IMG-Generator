'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface BulkDownloadProps {
  selectedPaths: string[];
  onDownloadComplete?: () => void;
}

export function BulkDownload({ selectedPaths, onDownloadComplete }: BulkDownloadProps) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const handleDownload = async () => {
    if (selectedPaths.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select at least one file to download',
        variant: 'destructive'
      });
      return;
    }

    setDownloading(true);
    setProgress(0);

    try {
      // Generate signed URLs
      const response = await fetch('/api/admin/storage/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paths: selectedPaths,
          expiresIn: 3600 // 1 hour
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate download URLs');
      }

      const { urls } = await response.json();
      const validUrls = urls.filter((u: any) => u.url && !u.error);

      if (validUrls.length === 0) {
        throw new Error('No valid download URLs generated');
      }

      // Download files one by one
      for (let i = 0; i < validUrls.length; i++) {
        const item = validUrls[i];
        setProgress(((i + 1) / validUrls.length) * 100);

        try {
          // Fetch the file
          const fileResponse = await fetch(item.url);
          if (!fileResponse.ok) continue;

          const blob = await fileResponse.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          
          // Extract filename from path
          const pathParts = item.path.split('/');
          const filename = pathParts[pathParts.length - 1] || `file-${i + 1}`;
          a.download = filename;
          
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);

          // Small delay to prevent browser blocking multiple downloads
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Failed to download ${item.path}:`, error);
        }
      }

      toast({
        title: 'Download complete',
        description: `Downloaded ${validUrls.length} file(s)`,
      });

      onDownloadComplete?.();
    } catch (error: any) {
      console.error('Bulk download error:', error);
      toast({
        title: 'Download failed',
        description: error.message || 'Failed to download files',
        variant: 'destructive'
      });
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleDownload}
        disabled={downloading || selectedPaths.length === 0}
        className="w-full"
      >
        {downloading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Downloading...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            Download Selected ({selectedPaths.length})
          </>
        )}
      </Button>
      {downloading && (
        <Progress value={progress} className="w-full" />
      )}
    </div>
  );
}

