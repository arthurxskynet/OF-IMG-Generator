const fs = require('fs');
const path = './src/components/variants/variants-rows-workspace.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix 1: Replace temp rowId with actual row.id
content = content.replace(
  /rowId: `temp-\$\{globalIndex\}`/g,
  'rowId: row.id'
);

// Fix 2: Add cleanup logic for orphaned rows
const errorHandlerPattern = /} catch \(error\) \{\s*console\.error\(`Error uploading \$\{file\.name\}`: error\)/;
const cleanupCode = `} catch (error) {
            console.error(\`Error uploading \${file.name}:\`, error)
            
            // Clean up created row if it exists and upload failed
            if (createdRowId) {
              try {
                const { data: { session: cleanupSession } } = await supabase.auth.getSession()
                await fetch(\`/api/variants/rows/\${createdRowId}\`, {
                  method: 'DELETE',
                  headers: {
                    'Authorization': \`Bearer \${cleanupSession?.access_token || ''}\`
                  }
                })
                console.log(\`Cleaned up orphaned row \${createdRowId} for failed upload: \${file.name}\`)
              } catch (cleanupError) {
                console.error(\`Failed to cleanup row \${createdRowId}:\`, cleanupError)
              }
            }`;

// Add createdRowId variable declaration
content = content.replace(
  /const batchPromises = batch\.map\(async \(file, batchIndex\) => \{[\s\S]*?const globalIndex = i \+ batchIndex[\s\S]*?try \{/,
  (match) => match.replace(/try \{/, 'let createdRowId: string | null = null\n          \n          try {')
);

// Add createdRowId assignment after row creation
content = content.replace(
  /const \{ row \} = await rowResponse\.json\(\)/,
  'const { row } = await rowResponse.json()\n            createdRowId = row.id'
);

// Replace error handler
content = content.replace(
  /} catch \(error\) \{[\s\S]*?console\.error\(`Error uploading \$\{file\.name\}`: error\)[\s\S]*?Update bulk upload state to error/,
  cleanupCode + '\n            \n            // Update bulk upload state to error'
);

// Fix 3: Add auth refresh and timeout protection
content = content.replace(
  /\/\/ Create variant row first[\s\S]*?const \{ data: \{ session \} \} = await supabase\.auth\.getSession\(\)/,
  `// Refresh auth before operations
            await refreshAuth()
            const { data: { session } } = await supabase.auth.getSession()
            if (!session?.access_token) {
              throw new Error('No valid authentication session')
            }

            // Create variant row first`
);

// Add timeout protection for upload
content = content.replace(
  /\/\/ Upload image[\s\S]*?await retryWithBackoff\(async \(\) => \{[\s\S]*?return uploadImage\(file, 'refs', user\.id\)[\s\S]*?\}, 3, 1000\)\.then\(async \(uploadResult\) => \{/,
  `// Upload image with timeout protection
            const uploadPromise = retryWithBackoff(async () => {
              await refreshAuth()
              return uploadImage(file, 'refs', user.id)
            }, 3, 1000)
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Upload timeout after 30 seconds')), 30000)
            )
            
            const uploadResult = await Promise.race([uploadPromise, timeoutPromise]) as any

            // Refresh session before adding image
            await refreshAuth()
            const { data: { session: newSession } } = await supabase.auth.getSession()
            if (!newSession?.access_token) {
              throw new Error('No valid authentication session')
            }

            // Add image to variant row
            (async () => {
              const uploadResult = await uploadPromise`
);

// Fix progress updates
content = content.replace(
  /status: 'uploading', progress: 50/,
  'status: \'uploading\', progress: 25'
);

fs.writeFileSync(path, content);
console.log('Fixed variants bulk upload logic');


