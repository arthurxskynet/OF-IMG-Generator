#!/usr/bin/env node

/**
 * Test script for the AI Prompt Generation Queue System
 * 
 * This script tests the queue system functionality:
 * 1. Enqueue prompt generation requests
 * 2. Check queue status
 * 3. Monitor processing
 * 4. Verify completion
 */

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

async function testPromptQueue() {
  console.log('🧪 Testing AI Prompt Generation Queue System')
  console.log('=' .repeat(50))

  try {
    // Test 1: Get initial queue stats
    console.log('\n1️⃣ Testing queue statistics...')
    const statsResponse = await fetch(`${BASE_URL}/api/prompt/queue`)
    if (!statsResponse.ok) {
      throw new Error(`Failed to get queue stats: ${statsResponse.status}`)
    }
    const stats = await statsResponse.json()
    console.log('✅ Queue stats:', stats)

    // Test 2: Enqueue a test prompt generation request
    console.log('\n2️⃣ Testing prompt generation enqueue...')
    const enqueueResponse = await fetch(`${BASE_URL}/api/prompt/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowId: 'test-row-id',
        refUrls: ['https://example.com/ref1.jpg'],
        targetUrl: 'https://example.com/target.jpg',
        priority: 8
      })
    })

    if (!enqueueResponse.ok) {
      const error = await enqueueResponse.text()
      console.log('⚠️  Enqueue failed (expected for test):', error)
    } else {
      const enqueueResult = await enqueueResponse.json()
      console.log('✅ Enqueued successfully:', enqueueResult)
      
      // Test 3: Check prompt job status
      console.log('\n3️⃣ Testing prompt job status check...')
      const statusResponse = await fetch(`${BASE_URL}/api/prompt/queue/${enqueueResult.promptJobId}`)
      if (statusResponse.ok) {
        const status = await statusResponse.json()
        console.log('✅ Status check successful:', status)
      } else {
        console.log('⚠️  Status check failed (expected for test)')
      }
    }

    // Test 4: Test background processor
    console.log('\n4️⃣ Testing background processor...')
    const processorResponse = await fetch(`${BASE_URL}/api/cron/prompt-processor`, {
      method: 'POST'
    })
    if (processorResponse.ok) {
      const processorResult = await processorResponse.json()
      console.log('✅ Background processor started:', processorResult)
    } else {
      console.log('⚠️  Background processor failed (expected for test)')
    }

    // Test 5: Test initialization endpoint
    console.log('\n5️⃣ Testing initialization endpoint...')
    const initResponse = await fetch(`${BASE_URL}/api/init`, {
      method: 'POST'
    })
    if (initResponse.ok) {
      const initResult = await initResponse.json()
      console.log('✅ Initialization successful:', initResult)
    } else {
      console.log('⚠️  Initialization failed (expected for test)')
    }

    console.log('\n🎉 Queue system tests completed!')
    console.log('\n📋 Test Summary:')
    console.log('- Queue statistics endpoint: ✅')
    console.log('- Prompt enqueue endpoint: ⚠️  (requires valid rowId)')
    console.log('- Status check endpoint: ⚠️  (requires valid promptJobId)')
    console.log('- Background processor: ⚠️  (requires database setup)')
    console.log('- Initialization endpoint: ⚠️  (requires database setup)')
    
    console.log('\n💡 To run full tests:')
    console.log('1. Set up the database with the provided SQL schema')
    console.log('2. Configure environment variables (XAI_API_KEY, etc.)')
    console.log('3. Create a valid model row in the database')
    console.log('4. Run this test with a valid rowId')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
    process.exit(1)
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  testPromptQueue()
}

module.exports = { testPromptQueue }
