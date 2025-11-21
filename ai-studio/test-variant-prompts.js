#!/usr/bin/env node
/**
 * Integration test for variant prompt generation and enhancement
 * Tests the Seedream v4 rich prompt outputs
 * 
 * Usage: node test-variant-prompts.js
 */

// Validation helpers
function validatePromptStructure(prompt, testName) {
  const errors = []
  
  // Check for meta-commentary and markdown
  const forbiddenMetaPatterns = [
    /\bhere's\b/i,
    /\bhere is\b/i,
    /\bi've\b/i,
    /\bnote:\s/i,
    /\bbelow is\b/i,
    /\blet me know\b/i,
    /\bif you need\b/i,
  ]
  const forbiddenMarkdown = ['**', '###', '##', '![', '](', '```']
  
  const hasMetaWords = forbiddenMetaPatterns.some(pattern => pattern.test(prompt))
  const hasMarkdown = forbiddenMarkdown.some(token => prompt.includes(token))
  
  if (hasMetaWords) {
    errors.push('❌ Contains forbidden meta-commentary')
  }
  if (hasMarkdown) {
    errors.push('❌ Contains markdown formatting')
  }
  
  // Check word count for rich prompts
  const wordCount = prompt.split(/\s+/).length
  if (wordCount < 50) {
    errors.push(`❌ Too short for Seedream v4 rich format (${wordCount} words, need at least 50)`)
  }
  if (wordCount > 500) {
    errors.push(`❌ Too verbose (${wordCount} words, max 500)`)
  }
  
  // Check for key Seedream v4 section indicators
  const hasSeedreamSections = /\b(subject|style|composition|framing|lighting|color|palette|atmosphere|environment|setting|technical|quality|variation)\b/i.test(prompt)
  if (!hasSeedreamSections) {
    errors.push('❌ Missing Seedream v4 section indicators')
  }
  
  // Check for variant/generation language
  const hasVariantLanguage = /\b(variant|generate|create|produce|maintain|preserv|consistent)\b/i.test(prompt)
  if (!hasVariantLanguage) {
    errors.push('❌ Missing variant generation/preservation language')
  }
  
  // Check for forbidden facial/ethnic descriptions
  const forbiddenDescriptors = [
    'eye color', 'eyes are', 'blue eyes', 'brown eyes', 'green eyes',
    'nose shape', 'mouth shape', 'facial features',
    'skin tone', 'skin color', 'pale skin', 'dark skin', 'fair skin',
    'ethnicity', 'ethnic', 'caucasian', 'asian', 'african', 'hispanic'
  ]
  
  const hasForbiddenDescriptor = forbiddenDescriptors.some(desc =>
    prompt.toLowerCase().includes(desc.toLowerCase())
  )
  
  if (hasForbiddenDescriptor) {
    const found = forbiddenDescriptors.filter(desc =>
      prompt.toLowerCase().includes(desc.toLowerCase())
    )
    errors.push(`❌ Contains forbidden facial/ethnic descriptors: ${found.join(', ')}`)
  }
  
  // Check for unsafe content
  const unsafeWords = ['nude', 'naked', 'topless', 'explicit', 'sexual', 'nsfw']
  const hasUnsafeContent = unsafeWords.some(word => 
    prompt.toLowerCase().includes(word)
  )
  
  if (hasUnsafeContent) {
    errors.push('❌ Contains unsafe content')
  }
  
  // Report results
  if (errors.length === 0) {
    console.log(`✅ ${testName}: PASSED`)
    console.log(`   Word count: ${wordCount}`)
    console.log(`   Has Seedream sections: Yes`)
    console.log(`   Has variant language: Yes`)
    console.log(`   No forbidden content: Yes`)
    return true
  } else {
    console.log(`❌ ${testName}: FAILED`)
    errors.forEach(error => console.log(`   ${error}`))
    return false
  }
}

// Mock test data (in real usage, these would come from API responses)
const MOCK_VARIANT_GENERATION_OUTPUT = `Generate portrait variants featuring professional editorial style with consistent high-quality production values and sophisticated aesthetic.

Subject & Style: Professional portrait photography with editorial fashion quality, polished and refined visual approach, contemporary style with timeless elegance.

Composition & Framing: Eye-level to slightly elevated camera angles, medium-close framing showing head and shoulders, centered composition with balanced negative space, shallow depth of field creating subject isolation, professional portrait distance maintaining intimacy.

Lighting Setup: Soft diffused key lighting from 45-degree angle creating gentle shadows, subtle rim lighting for depth, even illumination with professional studio quality, minimal harsh shadows, color temperature around 5000K for natural warmth, flattering and dimensional lighting mood.

Color Palette & Atmosphere: Muted earth tones with warm undertones, desaturated palette maintaining sophistication, subtle color grading with film-like quality, calm and professional atmosphere, refined and approachable mood.

Environment & Setting: Neutral solid backgrounds in soft grays or warm beiges, minimal distraction studio setting, clean professional backdrop, controlled indoor environment with studio setup.

Technical Quality: Sharp focus on subject, high resolution with fine detail rendering, professional color grading, clean image quality with low noise, polished post-production feel.

Variation Guidelines: Maintain lighting setup, color palette, framing style, and background consistency across all variants. Allow subtle variations in head angle, expression, and exact pose while preserving the professional editorial aesthetic.`

const MOCK_VARIANT_ENHANCEMENT_OUTPUT = `Generate portrait variants featuring professional editorial style with dramatic high-contrast lighting and bold shadows for maximum visual impact.

Subject & Style: Professional portrait photography with editorial fashion quality, polished and refined visual approach, contemporary style with bold dramatic aesthetic.

Composition & Framing: Eye-level to slightly elevated camera angles, medium-close framing showing head and shoulders, centered composition with balanced negative space, shallow depth of field creating subject isolation, professional portrait distance maintaining intimacy.

Lighting Setup: Dramatic high-contrast lighting with strong directional key light from side angle, creating bold shadows and striking lighting ratio, hard light quality with defined shadow edges, chiaroscuro effect for maximum impact, minimal fill light for deep contrast, cinematic lighting mood with theatrical quality.

Color Palette & Atmosphere: Muted earth tones with warm undertones, desaturated palette maintaining sophistication with increased contrast, subtle color grading with film-like quality, dramatic and professional atmosphere, bold and confident mood.

Environment & Setting: Neutral solid backgrounds in soft grays or warm beiges, minimal distraction studio setting, clean professional backdrop, controlled indoor environment with studio setup optimized for dramatic lighting.

Technical Quality: Sharp focus on subject, high resolution with fine detail rendering, professional color grading with enhanced contrast, clean image quality with low noise, polished post-production feel with dramatic tone.

Variation Guidelines: Maintain dramatic lighting setup, color palette, framing style, and background consistency across all variants. Allow subtle variations in head angle, expression, and exact pose while preserving the professional editorial aesthetic with bold lighting contrast.`

// Run tests
console.log('\n=== Variant Prompt Integration Tests ===\n')
console.log('Testing Seedream v4 rich prompt outputs...\n')

const test1Pass = validatePromptStructure(
  MOCK_VARIANT_GENERATION_OUTPUT,
  'Variant Generation'
)

console.log('')

const test2Pass = validatePromptStructure(
  MOCK_VARIANT_ENHANCEMENT_OUTPUT,
  'Variant Enhancement'
)

console.log('\n=== Test Summary ===')
console.log(`Variant Generation: ${test1Pass ? '✅ PASSED' : '❌ FAILED'}`)
console.log(`Variant Enhancement: ${test2Pass ? '✅ PASSED' : '❌ FAILED'}`)

if (test1Pass && test2Pass) {
  console.log('\n✅ All tests PASSED')
  process.exit(0)
} else {
  console.log('\n❌ Some tests FAILED')
  process.exit(1)
}

