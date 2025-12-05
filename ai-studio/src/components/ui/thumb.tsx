"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useState, useCallback } from "react";
import { getSignedUrl } from "@/lib/jobs";

interface ThumbProps {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
  dataImagePath?: string;
  dataRowId?: string;
}

const Thumb = ({ src, alt, size = 96, className, dataImagePath, dataRowId }: ThumbProps) => {
  const [fallbackSrc, setFallbackSrc] = useState<string | null>(null)
  const [errored, setErrored] = useState(false)

  const handleError = useCallback(async (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (errored) return
    setErrored(true)
    const path = dataImagePath
    if (!path) return
    try {
      const response = await getSignedUrl(path)
      if (response) {
        // Switch to direct signed URL
        setFallbackSrc(response.url)
      }
    } catch {
      // ignore; leave as empty fallback
    }
  }, [dataImagePath, errored])

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-muted shadow-xs",
        className,
      )}
      style={{ width: size, height: size }}
      data-image-path={dataImagePath}
      data-row-id={dataRowId}
    >
      {fallbackSrc ? (
        <img
          src={fallbackSrc}
          alt={alt}
          width={size}
          height={size}
          className="object-cover w-full h-full"
          loading="lazy"
        />
      ) : src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${size}px`}
          className="object-cover"
          loading="lazy"
          onError={handleError}
          data-image-path={dataImagePath}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">IMG</div>
      )}
    </div>
  );
};

export { Thumb };


