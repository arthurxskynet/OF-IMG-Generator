import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Buffer } from "node:buffer"
import { createServer } from "@/lib/supabase-server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { deleteStorageFile } from "@/lib/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const CreateAssetSchema = z.object({
  bucket: z.string().min(1),
  objectPath: z.string().min(1),
  label: z.string().optional().nullable()
})

const CopyAssetSchema = z.object({
  action: z.literal("copy-to-targets"),
  assetId: z.string().uuid()
})

type RouteParams = { modelId: string }

const normalizeObjectPath = (bucket: string, objectPath: string) => {
  if (!objectPath) return objectPath
  if (objectPath.startsWith(`${bucket}/`)) return objectPath
  const cleaned = objectPath.replace(/^\/+/, "")
  return `${bucket}/${cleaned}`
}

const parseLibraryDragLabel = (label?: string | null) => {
  if (label === undefined) return null
  return label === null ? null : label
}

export async function GET(_: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { modelId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: assets, error } = await supabase
    .from("model_library_assets")
    .select("*")
    .eq("model_id", modelId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Failed to fetch model library assets:", error)
    return NextResponse.json({ error: "Failed to load library assets" }, { status: 500 })
  }

  return NextResponse.json({ assets: assets ?? [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { modelId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const parsedCopy = CopyAssetSchema.safeParse(body)
  if (parsedCopy.success) {
    const { assetId } = parsedCopy.data

    const { data: asset, error: fetchError } = await supabase
      .from("model_library_assets")
      .select("*")
      .eq("id", assetId)
      .eq("model_id", modelId)
      .single()

    if (fetchError || !asset) {
      return NextResponse.json({ error: "Library asset not found" }, { status: 404 })
    }

    const [sourceBucket, ...rest] = String(asset.object_path).split("/")
    const sourceKey = rest.join("/")

    if (!sourceBucket || !sourceKey) {
      return NextResponse.json({ error: "Invalid library asset path" }, { status: 400 })
    }

    const { data: file, error: downloadError } = await supabaseAdmin
      .storage
      .from(sourceBucket)
      .download(sourceKey)

    if (downloadError || !file) {
      console.error("Failed to download library asset for copy:", downloadError)
      return NextResponse.json({ error: "Failed to read library asset" }, { status: 500 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const originalName = sourceKey.split("/").pop() ?? "asset"
    const extension = originalName.includes(".") ? originalName.slice(originalName.lastIndexOf(".")) : ""
    const newKey = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`

    const { error: uploadError } = await supabaseAdmin
      .storage
      .from("targets")
      .upload(newKey, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false
      })

    if (uploadError) {
      console.error("Failed to copy library asset to targets:", uploadError)
      return NextResponse.json({ error: "Failed to copy asset" }, { status: 500 })
    }

    return NextResponse.json({ objectPath: `targets/${newKey}` })
  }

  const parsedCreate = CreateAssetSchema.safeParse(body)
  if (!parsedCreate.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsedCreate.error.format() }, { status: 400 })
  }

  const { bucket, objectPath, label } = parsedCreate.data
  const normalizedPath = normalizeObjectPath(bucket, objectPath)

  const { data: asset, error } = await supabase
    .from("model_library_assets")
    .insert({
      model_id: modelId,
      created_by: user.id,
      bucket,
      object_path: normalizedPath,
      label: parseLibraryDragLabel(label),
      updated_at: new Date().toISOString()
    })
    .select()
    .single()

  if (error || !asset) {
    console.error("Failed to save library asset metadata:", error)
    return NextResponse.json({ error: "Failed to save library asset" }, { status: 500 })
  }

  return NextResponse.json({ asset })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { modelId } = await params
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const assetId = url.searchParams.get("assetId")

  if (!assetId) {
    return NextResponse.json({ error: "Missing assetId" }, { status: 400 })
  }

  const { data: asset, error: fetchError } = await supabase
    .from("model_library_assets")
    .select("*")
    .eq("id", assetId)
    .eq("model_id", modelId)
    .single()

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Library asset not found" }, { status: 404 })
  }

  const { error: deleteError } = await supabase
    .from("model_library_assets")
    .delete()
    .eq("id", assetId)

  if (deleteError) {
    console.error("Failed to delete library asset record:", deleteError)
    return NextResponse.json({ error: "Failed to delete library asset" }, { status: 500 })
  }

  try {
    const { count: remainingAssets } = await supabaseAdmin
      .from("model_library_assets")
      .select("id", { count: "exact", head: true })
      .eq("object_path", asset.object_path)

    const { count: referencedRows } = await supabaseAdmin
      .from("model_rows")
      .select("id", { count: "exact", head: true })
      .contains("ref_image_urls", [asset.object_path])

    const totalReferences = (remainingAssets ?? 0) + (referencedRows ?? 0)

    if (totalReferences === 0) {
      await deleteStorageFile(String(asset.object_path)).catch((storageError) => {
        console.warn("Failed to remove storage file for library asset:", storageError)
      })
    }
  } catch (err) {
    console.warn("Failed to evaluate storage cleanup for library asset:", err)
  }

  return NextResponse.json({ ok: true })
}
