import { createServer } from "@/lib/supabase-server"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { VariantsRowsWorkspace } from "@/components/variants/variants-rows-workspace"
import { VariantRow } from "@/types/variants"

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
  
  try {
    const { data: rows, error } = await supabase
      .from('variant_rows')
      .select(`
        *,
        output_width,
        output_height,
        variant_row_images (
          id,
          variant_row_id,
          output_path,
          thumbnail_path,
          source_row_id,
          position,
          is_favorited,
          is_generated,
          created_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .order('position', { referencedTable: 'variant_row_images', ascending: true })

    if (error) {
      console.error('Failed to fetch variant rows:', error)
      // If table doesn't exist, return empty array
      if (error.code === '42P01') {
        console.warn('variant_rows table does not exist yet. Please run migrations.')
        variantRows = []
      }
    } else {
      variantRows = rows || []
    }

    // Separately fetch generated images for each variant row
    // Jobs table uses variant_row_id to link to variant_rows
    if (variantRows.length > 0) {
      const variantRowIds = variantRows.map(r => r.id)
      
      const { data: jobs } = await supabase
        .from('jobs')
        .select(`
          id,
          row_id,
          variant_row_id,
          status,
          created_at,
          generated_images (
            id,
            output_url,
            thumbnail_url,
            is_favorited,
            created_at
          )
        `)
        .in('variant_row_id', variantRowIds)
        .order('created_at', { ascending: false })
      
      // Attach jobs to their respective variant rows
      if (jobs) {
        variantRows.forEach(row => {
          (row as any).jobs = jobs.filter(j => j.variant_row_id === row.id)
        })
      }
    }
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
      <div className="pb-6">
        <Suspense fallback={
          <div className="flex items-center justify-center p-12">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
              <p className="text-sm text-muted-foreground">Loading workspace...</p>
            </div>
          </div>
        }>
          <VariantsRowsWorkspace initialRows={variantRows} />
        </Suspense>
      </div>
    </div>
  )
}

export default VariantsPage

