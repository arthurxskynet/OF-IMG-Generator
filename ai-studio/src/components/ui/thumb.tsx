"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface ThumbProps {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
  dataImagePath?: string;
  dataRowId?: string;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
  ariaGrabbed?: boolean;
}

const Thumb = ({
  src,
  alt,
  size = 96,
  className,
  dataImagePath,
  dataRowId,
  draggable = false,
  onDragStart,
  onDragEnd,
  ariaGrabbed,
}: ThumbProps) => {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-muted shadow-xs",
        className,
      )}
      style={{ width: size, height: size }}
      data-image-path={dataImagePath}
      data-row-id={dataRowId}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      aria-grabbed={ariaGrabbed}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${size}px`}
          className="object-cover"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">IMG</div>
      )}
    </div>
  );
};

export { Thumb };


