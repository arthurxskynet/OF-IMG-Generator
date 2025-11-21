#!/usr/bin/env node

/**
 * Test script for Rich Seedream-style prompts
 * 
 * This script helps test the new rich prompt generation by:
 * - Testing both rich and legacy modes
 * - Testing face-swap and target-only modes
 * - Testing different swap modes (face vs face-hair)
 * - Logging detailed output for analysis
 * 
 * Usage:
 *   node test-rich-prompts.js
 * 
 * Requirements:
 *   - XAI_API_KEY environment variable set
 *   - Test image URLs (public or signed URLs)
 */

// This script demonstrates how to test the prompt generation
// In a real test, you would import the actual functions from the TypeScript source

console.log('╔═══════════════════════════════════════════════════════════╗')
console.log('║   Rich Seedream Prompts - Test Script                    ║')
console.log('╚═══════════════════════════════════════════════════════════╝')
console.log('')

// Check environment
const hasApiKey = !!process.env.XAI_API_KEY
const richPromptsEnabled = process.env.PROMPT_USE_RICH_STYLE !== 'false'
const llmFaceswapEnabled = process.env.PROMPT_USE_LLM_FACESWAP !== 'false'

console.log('Environment Configuration:')
console.log('─────────────────────────────────────────────────────')
console.log(`  XAI_API_KEY:              ${hasApiKey ? '✓ Set' : '✗ Not set'}`)
console.log(`  PROMPT_USE_RICH_STYLE:    ${richPromptsEnabled ? '✓ Enabled (rich)' : '✗ Disabled (legacy)'}`)
console.log(`  PROMPT_USE_LLM_FACESWAP:  ${llmFaceswapEnabled ? '✓ Enabled' : '✗ Disabled'}`)
console.log('')

if (!hasApiKey) {
  console.error('❌ ERROR: XAI_API_KEY environment variable is not set')
  console.error('   Please set your xAI API key to run this test.')
  console.error('   Example: export XAI_API_KEY="your-api-key-here"')
  process.exit(1)
}

if (!llmFaceswapEnabled) {
  console.warn('⚠️  WARNING: LLM face-swap is disabled')
  console.warn('   Set PROMPT_USE_LLM_FACESWAP=true to test LLM-based prompts')
  console.warn('')
}

console.log('Test Scenarios:')
console.log('─────────────────────────────────────────────────────')
console.log('  1. Face-swap with 1 reference (face mode)')
console.log('  2. Face-swap with 1 reference (face-hair mode)')
console.log('  3. Face-swap with 2+ references (face-hair mode)')
console.log('  4. Target-only enhancement (no references)')
console.log('')

console.log('To run actual tests:')
console.log('─────────────────────────────────────────────────────')
console.log('  1. Via API endpoint:')
console.log('     POST /api/prompt/generate')
console.log('     Body: { rowId: "your-row-id", swapMode: "face" | "face-hair" }')
console.log('')
console.log('  2. Via queue system:')
console.log('     POST /api/prompt/queue')
console.log('     Body: { rowId: "your-row-id", swapMode: "face" | "face-hair" }')
console.log('')
console.log('  3. Direct function call (in code):')
console.log('     import { generatePromptWithGrok } from "@/lib/ai-prompt-generator"')
console.log('     const prompt = await generatePromptWithGrok(refUrls, targetUrl, swapMode)')
console.log('')

console.log('Expected Output (Rich Mode):')
console.log('─────────────────────────────────────────────────────')
console.log('  • Prompt length: 150-350 words')
console.log('  • Contains sections: Reference usage, Subject details, Scene,')
console.log('    Environment, Lighting, Camera, Atmosphere, Colors, Quality')
console.log('  • NO facial features, skin tone, or ethnicity descriptions')
console.log('  • NO hair descriptions (in face-only mode)')
console.log('  • Detailed clothing, pose, and scene descriptions')
console.log('  • Technical lighting and camera terminology')
console.log('')

console.log('Expected Output (Legacy Mode):')
console.log('─────────────────────────────────────────────────────')
console.log('  • Prompt length: under 50 words')
console.log('  • Single sentence format')
console.log('  • Simple swap instruction only')
console.log('  • Example: "Swap the face and hair from the first image of')
console.log('    professional businessman onto the second image of casual')
console.log('    outdoor person; leave everything else unchanged."')
console.log('')

console.log('Monitoring Logs:')
console.log('─────────────────────────────────────────────────────')
console.log('  Watch for these log entries in your application:')
console.log('')
console.log('  • "[generatePromptWithGrok] Entry point:"')
console.log('    - Shows input parameters and mode selection')
console.log('')
console.log('  • "[model-name] sending face-swap request to Grok:"')
console.log('    - Shows promptStyle: "rich-seedream" or "legacy-concise"')
console.log('    - Shows maxTokens, temperature, and other parameters')
console.log('')
console.log('  • "[model-name] generated prompt:"')
console.log('    - Shows the full generated prompt')
console.log('    - Shows prompt length and word count')
console.log('')
console.log('  • "[model-name] starting validation:"')
console.log('    - Shows validation being applied')
console.log('    - Any validation failures will be logged here')
console.log('')
console.log('  • "[model-name] prompt generation successful:"')
console.log('    - Confirms successful generation and validation')
console.log('')

console.log('Testing Checklist:')
console.log('─────────────────────────────────────────────────────')
const checklist = [
  'Create a test model with reference image(s)',
  'Upload a target image',
  'Generate prompt via API or UI',
  'Check application logs for detailed output',
  'Verify prompt format matches expected output',
  'Run prompt through Seedream v4 to generate image',
  'Assess image quality (face fidelity, background, etc.)',
  'Test with swapMode: "face" (no hair swap)',
  'Test with swapMode: "face-hair" (full swap)',
  'Test target-only mode (no reference images)',
  'Compare rich vs legacy mode quality',
  'Monitor for validation errors or model fallbacks'
]

checklist.forEach((item, index) => {
  console.log(`  ${index + 1}. [ ] ${item}`)
})

console.log('')
console.log('Rollback (if needed):')
console.log('─────────────────────────────────────────────────────')
console.log('  export PROMPT_USE_RICH_STYLE=false')
console.log('  # Redeploy or restart application')
console.log('')

console.log('For more information, see:')
console.log('  • RICH-PROMPTS-ROLLOUT-GUIDE.md - Detailed rollout guide')
console.log('  • NEW-SEEDREAM-PROMPT-SPEC.md - Prompt specification & examples')
console.log('  • CURRENT-PROMPT-ANALYSIS.md - Legacy system analysis')
console.log('')

console.log('═══════════════════════════════════════════════════════════')
console.log('')

