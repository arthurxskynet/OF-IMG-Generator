import { SupabaseClient } from "@supabase/supabase-js";
import { GeneratedImage } from "@/types/jobs";
import {
  DEFAULT_IMAGE_LIMIT,
  DEFAULT_ROW_LIMIT,
  MAX_IMAGE_LIMIT,
  MAX_ROW_LIMIT,
  ModelRowWithImages,
  ModelRowsPage,
} from "@/types/model-api";

interface FetchModelRowsOptions {
  sort?: string | null;
  rowLimit?: number;
  rowOffset?: number;
  imageLimit?: number;
}

const clampNumber = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

const dedupeImages = (images?: GeneratedImage[] | null) => {
  if (!Array.isArray(images)) {
    return [] as GeneratedImage[];
  }
  const seen = new Set<string>();
  const deduped: GeneratedImage[] = [];
  for (const image of images) {
    if (!image) continue;
    const key = image.id || image.output_url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(image);
  }
  deduped.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return deduped;
};

const dedupeRows = (rows: ModelRowWithImages[]) => {
  const seen = new Map<string, ModelRowWithImages>();
  for (const row of rows) {
    if (!row?.id) continue;
    const existing = seen.get(row.id);
    if (!existing) {
      seen.set(row.id, {
        ...row,
        generated_images: dedupeImages(row.generated_images)
      });
      continue;
    }

    seen.set(row.id, {
      ...existing,
      ...row,
      generated_images: dedupeImages(row.generated_images ?? existing.generated_images)
    });
  }
  return Array.from(seen.values());
};

type GenericSupabaseClient = SupabaseClient<any, any, any, any, any>;

export async function fetchModelRowsPage(
  supabase: GenericSupabaseClient,
  modelId: string,
  options: FetchModelRowsOptions = {}
): Promise<ModelRowsPage | null> {
  const sortOrder = options.sort === "oldest" ? "oldest" : "newest";
  const rowLimit = clampNumber(options.rowLimit ?? DEFAULT_ROW_LIMIT, 1, MAX_ROW_LIMIT);
  const rowOffset = Math.max(0, options.rowOffset ?? 0);
  const imageLimit = clampNumber(options.imageLimit ?? DEFAULT_IMAGE_LIMIT, 1, MAX_IMAGE_LIMIT);
  const rowRangeEnd = rowOffset + rowLimit - 1;

  const query = supabase
    .from("models")
    .select(
      `
        *,
        model_rows (
          id,
          model_id,
          ref_image_urls,
          target_image_url,
          prompt_override,
          status,
          created_at,
          updated_at,
          generated_images (
            id,
            output_url,
            is_favorited,
            created_at
          )
        )
      `
    )
    .eq("id", modelId)
    .order("created_at", {
      referencedTable: "model_rows",
      ascending: sortOrder === "oldest"
    })
    .range(rowOffset, rowRangeEnd, { foreignTable: "model_rows" })
    .limit(imageLimit, { foreignTable: "model_rows.generated_images" });

  const { data: model, error: modelError } = await query.single();

  if (modelError) {
    console.error("Failed to fetch model:", modelError);
    return null;
  }

  if (!model) {
    return null;
  }

  const rawRows = Array.isArray(model.model_rows)
    ? (model.model_rows as ModelRowWithImages[])
    : ([] as ModelRowWithImages[]);

  const rows = dedupeRows(rawRows);

  rows.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return sortOrder === "oldest" ? dateA - dateB : dateB - dateA;
  });

  const [{ count: totalRows, error: rowsCountError }, { count: totalImages, error: imagesCountError }] = await Promise.all([
    supabase
      .from("model_rows")
      .select("id", { count: "exact", head: true })
      .eq("model_id", modelId),
    supabase
      .from("generated_images")
      .select("id", { count: "exact", head: true })
      .eq("model_id", modelId)
  ]);

  if (rowsCountError) {
    console.error("Failed to count model rows:", rowsCountError);
  }

  if (imagesCountError) {
    console.error("Failed to count generated images:", imagesCountError);
  }

  const resolvedTotalRows = typeof totalRows === "number" ? totalRows : rowOffset + rows.length;
  const fallbackImageCount = rows.reduce(
    (total, row) => total + ((row.generated_images?.length ?? 0)),
    0
  );
  const resolvedTotalImages = typeof totalImages === "number" ? totalImages : fallbackImageCount;

  const restModel = { ...model } as typeof model;
  delete (restModel as Record<string, unknown>).model_rows;

  return {
    model: restModel,
    rows,
    counts: {
      totalRows: resolvedTotalRows,
      totalImages: resolvedTotalImages
    },
    pagination: {
      rowLimit,
      rowOffset,
      imageLimit,
      sort: sortOrder,
      rowsFetched: rows.length,
      nextRowOffset: rowOffset + rows.length,
      hasMoreRows: rowOffset + rows.length < resolvedTotalRows
    }
  };
}
