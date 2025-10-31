#!/usr/bin/env node

/**
 * Script to migrate ALL images to have thumbnails
 * Runs batches until all images are processed
 */

const BATCH_SIZE = 50; // Process 50 images at a time (smaller batches)
const BASE_URL = process.env.MIGRATION_URL || 'http://localhost:3000';
const MAX_ITERATIONS = 1000; // Prevent infinite loops

async function checkStatus() {
  const response = await fetch(`${BASE_URL}/api/debug/test-thumbnails`);
  if (!response.ok) {
    throw new Error(`Failed to check status: ${response.status}`);
  }
  const data = await response.json();
  return {
    totalImages: data.totalImages,
    imagesWithThumbs: data.imagesWithThumbs,
    remaining: data.totalImages - data.imagesWithThumbs
  };
}

async function migrateBatch(offset) {
  const response = await fetch(`${BASE_URL}/api/admin/generate-thumbnails`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      batchSize: BATCH_SIZE,
      offset: offset
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  
  return await response.json();
}

async function migrateAll() {
  console.log('🚀 Starting comprehensive thumbnail migration...\n');
  
  try {
    // Check initial status
    let status = await checkStatus();
    console.log(`📊 Initial Status:`);
    console.log(`   Total Images: ${status.totalImages}`);
    console.log(`   With Thumbnails: ${status.imagesWithThumbs}`);
    console.log(`   Remaining: ${status.remaining}\n`);
    
    if (status.remaining === 0) {
      console.log('✅ All images already have thumbnails!');
      return;
    }
    
    let totalProcessed = 0;
    let totalFailed = 0;
    let offset = 0; // Always start from offset 0 (API filters for images without thumbnails)
    let iterations = 0;
    let consecutiveZeroProcessed = 0; // Track consecutive batches with 0 processed
    
    while (status.remaining > 0 && iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`\n📦 Processing batch ${iterations} at offset ${offset}...`);
      
      const result = await migrateBatch(offset);
      
      const processed = result.processed || 0;
      const failed = result.failed || 0;
      const totalInBatch = result.total || 0;
      
      // If we processed 0 images, increment counter
      if (processed === 0) {
        consecutiveZeroProcessed++;
        console.log(`   ⚠️  No images processed (total remaining: ${totalInBatch})`);
        
        // If we've had 3 consecutive batches with 0 processed, break
        if (consecutiveZeroProcessed >= 3) {
          console.log(`   ⚠️  Stopping: 3 consecutive batches with no images processed`);
          break;
        }
      } else {
        consecutiveZeroProcessed = 0; // Reset counter
      }
      
      if (result.errors && result.errors.length > 0) {
        console.log(`   ⚠️  Batch completed with ${result.errors.length} errors:`);
        result.errors.slice(0, 3).forEach(err => console.log(`      - ${err}`));
        if (result.errors.length > 3) {
          console.log(`      ... and ${result.errors.length - 3} more`);
        }
      }
      
      totalProcessed += processed;
      totalFailed += failed;
      
      const progress = Math.round(((status.imagesWithThumbs + totalProcessed) / status.totalImages) * 100);
      console.log(`   ✅ Processed: ${processed}/${totalInBatch}`);
      console.log(`   📈 Overall Progress: ${progress}% (${status.imagesWithThumbs + totalProcessed}/${status.totalImages})`);
      
      // If we processed fewer than batch size, we're likely done (or hit the end)
      // But we still increment offset in case there are more
      offset += BATCH_SIZE;
      
      // Recheck status to see actual remaining count
      status = await checkStatus();
      
      console.log(`   📊 Status: ${status.remaining} remaining, ${status.imagesWithThumbs} with thumbnails`);
      
      // If no more images need processing, break
      if (status.remaining === 0) {
        console.log(`   ✅ All images now have thumbnails!`);
        break;
      }
      
      // If total remaining hasn't decreased, we might be stuck
      if (processed === 0 && totalInBatch === 0) {
        console.log(`   ⚠️  No images found at this offset, stopping`);
        break;
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    if (iterations >= MAX_ITERATIONS) {
      console.log(`\n⚠️  Reached maximum iterations (${MAX_ITERATIONS}), stopping`);
    }
    
    // Final status check
    const finalStatus = await checkStatus();
    
    console.log('\n' + '='.repeat(50));
    console.log('✨ Migration Complete!');
    console.log('='.repeat(50));
    console.log(`📊 Final Status:`);
    console.log(`   Total Images: ${finalStatus.totalImages}`);
    console.log(`   With Thumbnails: ${finalStatus.imagesWithThumbs}`);
    console.log(`   Coverage: ${Math.round((finalStatus.imagesWithThumbs / finalStatus.totalImages) * 100)}%`);
    console.log(`   Remaining: ${finalStatus.remaining}`);
    console.log(`   Processed in this run: ${totalProcessed}`);
    console.log(`   Batches run: ${iterations}`);
    if (totalFailed > 0) {
      console.log(`   ⚠️  Failed: ${totalFailed}`);
    }
    console.log('='.repeat(50) + '\n');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

migrateAll().catch(console.error);

