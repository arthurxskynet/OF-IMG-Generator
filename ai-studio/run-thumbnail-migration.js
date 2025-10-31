#!/usr/bin/env node

/**
 * Script to run thumbnail migration for existing images
 * Usage: node run-thumbnail-migration.js [batchSize] [offset]
 */

// Use built-in fetch (Node.js 18+)

const BATCH_SIZE = parseInt(process.argv[2]) || 10;
const OFFSET = parseInt(process.argv[3]) || 0;

async function runMigration() {
  console.log(`Starting thumbnail migration with batch size ${BATCH_SIZE}, offset ${OFFSET}`);
  
  try {
    const response = await fetch('http://localhost:3000/api/admin/generate-thumbnails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        batchSize: BATCH_SIZE,
        offset: OFFSET
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log('Migration result:', result);
    
    if (result.total > 0) {
      const progress = Math.round((result.processed / result.total) * 100);
      console.log(`Progress: ${progress}% (${result.processed}/${result.total})`);
      
      if (result.failed > 0) {
        console.log(`Failed: ${result.failed} images`);
        if (result.errors && result.errors.length > 0) {
          console.log('Errors:', result.errors);
        }
      }
    }
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration().catch(console.error);

