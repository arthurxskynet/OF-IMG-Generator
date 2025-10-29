import { GeneratedImage, Model, ModelRow } from "@/types/jobs";

export interface ModelRowWithImages extends ModelRow {
  generated_images?: GeneratedImage[];
}

export interface ModelRowsPageCounts {
  totalRows: number;
  totalImages: number;
}

export interface ModelRowsPagePagination {
  rowLimit: number;
  rowOffset: number;
  imageLimit: number;
  sort: "oldest" | "newest";
  rowsFetched: number;
  nextRowOffset: number;
  hasMoreRows: boolean;
}

export interface ModelRowsPage {
  model: Model;
  rows: ModelRowWithImages[];
  counts: ModelRowsPageCounts;
  pagination: ModelRowsPagePagination;
}

export const DEFAULT_ROW_LIMIT = 20;
export const DEFAULT_IMAGE_LIMIT = 8;
export const MAX_ROW_LIMIT = 100;
export const MAX_IMAGE_LIMIT = 50;
