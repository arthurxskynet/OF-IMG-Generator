"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface ThumbProps {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
}

const Thumb = ({ src, alt, size = 96, className }: ThumbProps) => {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-muted shadow-xs",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">IMG</div>
      )}
    </div>
  );
};

export { Thumb };


