import { createServer } from "@/lib/supabase-server"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { VariantsRowsWorkspace } from "@/components/variants/variants-rows-workspace"
import { VariantRow } from "@/types/variants"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink } from "lucide-react"

export const dynamic = 'force-dynamic'
export const revalidate = 0

const VariantsPage = async () => {
  const supabase = await createServer()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return notFound()
  }

  // Fetch variant rows with images
  // Gracefully handle if tables don't exist yet
  let variantRows: VariantRow[] = []
  const variantsByModel = new Map<string | null, VariantRow[]>()
  
  try {
    // Fetch variant rows with model data - use separate query for images to avoid any nested query limits
    const { data: rows, error } = await supabase
      .from('variant_rows')
      .select(`
        *,
        output_width,
        output_height,
        match_target_ratio,
        model:models(id, name)
      `)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch variant rows:', error)
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        console.warn('variant_rows table does not exist yet. Please run migrations.')
        variantRows = []
      }
    } else if (rows && rows.length > 0) {
      // Fetch all variant_row_images separately to ensure we get all images
      const rowIds = rows.map(r => r.id)
      const { data: images, error: imagesError } = await supabase
        .from('variant_row_images')
        .select('*')
        .in('variant_row_id', rowIds)
        // Order by position for reference images, but we'll sort generated images by created_at in the component
        .order('position', { ascending: true })
        .order('created_at', { ascending: false, nullsFirst: false })
      
      const allImages = images || []
      
      if (imagesError) {
        console.error('Failed to fetch variant row images:', imagesError)
      }

      // Attach images to their respective rows
      const rowsWithImages = rows.map(row => {
        const rowImages = allImages.filter(img => img.variant_row_id === row.id)
        return {
          ...row,
          variant_row_images: rowImages
        }
      })

      variantRows = rowsWithImages.map(row => {
        // Validate and normalize variant_row_images
        const images = (row as any).variant_row_images || []
        const validatedImages = images.map((img: any) => {
          // Ensure is_generated is explicitly boolean (never null/undefined)
          // Default to false if null/undefined (reference image)
          const isGenerated = img.is_generated === true
          return {
            ...img,
            is_generated: isGenerated
          }
        })
        
        return {
          ...row,
          variant_row_images: validatedImages
        }
      })
      
      // Log validation results for debugging
      const totalImages = variantRows.reduce((sum, row) => sum + (row.variant_row_images?.length || 0), 0)
      const generatedImages = variantRows.reduce((sum, row) => 
        sum + (row.variant_row_images?.filter((img: any) => img.is_generated === true).length || 0), 0)
      const referenceImages = totalImages - generatedImages
      
      console.log('[VariantsPage] Fetched variant rows with validated images', {
        rowCount: variantRows.length,
        totalImages,
        generatedImages,
        referenceImages
      })
    }

    // Separately fetch jobs for status tracking (used by polling hook)
    // Note: Images are displayed from variant_row_images, not from jobs.generated_images
    if (variantRows.length > 0) {
      const variantRowIds = variantRows.map(r => r.id)
      
      const { data: jobs } = await supabase
        .from('jobs')
        .select(`
          id,
          row_id,
          variant_row_id,
          status,
          created_at
        `)
        .in('variant_row_id', variantRowIds)
        .order('created_at', { ascending: false })
      
      // Attach jobs to their respective variant rows for status tracking
      if (jobs) {
        variantRows.forEach(row => {
          (row as any).jobs = jobs.filter(j => j.variant_row_id === row.id)
        })
      }
    }

    // Group variants by model_id
    variantRows.forEach(row => {
      const modelId = row.model_id || null
      if (!variantsByModel.has(modelId)) {
        variantsByModel.set(modelId, [])
      }
      variantsByModel.get(modelId)!.push(row)
    })
  } catch (error) {
    console.error('Error fetching variant data:', error)
    variantRows = []
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Enhanced Header */}
      <div className="relative pt-6 pb-4">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5 rounded-2xl blur-3xl" />
        <div className="relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl p-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                Variants
              </h1>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{variantRows.length}</span> variant row{variantRows.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pb-6 space-y-6">
        <Suspense fallback={
          <div className="flex items-center justify-center p-12">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
              <p className="text-sm text-muted-foreground">Loading workspace...</p>
            </div>
          </div>
        }>
          {/* Group variants by model */}
          {Array.from(variantsByModel.entries()).map(([modelId, rows]) => {
            if (modelId === null) {
              // Orphaned variants (no model_id)
              return (
                <Card key="orphaned" className="border-dashed">
                  <CardHeader>
                    <CardTitle className="text-lg">Orphaned Variants</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Variants not associated with any model
                    </p>
                  </CardHeader>
                  <CardContent>
                    <VariantsRowsWorkspace initialRows={rows} />
                  </CardContent>
                </Card>
              )
            }

            // Variants grouped by model
            const model = rows[0]?.model
            const modelName = model?.name || 'Unknown Model'
            
            return (
              <Card key={modelId}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{modelName}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {rows.length} variant row{rows.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/models/${modelId}?tab=variants`}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        View in Model
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <VariantsRowsWorkspace initialRows={rows} modelId={modelId} />
                </CardContent>
              </Card>
            )
          })}

          {/* Empty state */}
          {variantRows.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">
                  No variants yet. Create variants from a model page or add images to get started.
                </p>
              </CardContent>
            </Card>
          )}
        </Suspense>
      </div>
    </div>
  )
}

export default VariantsPage

