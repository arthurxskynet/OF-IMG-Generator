# AI Prompt Generation Queue System

This document describes the implementation of a robust queue system for AI prompt generation using Grok, ensuring all requests complete reliably with proper error handling and retry mechanisms.

## Overview

The queue system addresses the following challenges:
- **Reliability**: Ensures all prompt generation requests complete, even if Grok API is slow or fails
- **Scalability**: Handles multiple concurrent requests without overwhelming the API
- **User Experience**: Provides real-time feedback and estimated wait times
- **Error Handling**: Implements exponential backoff retry logic with fallback mechanisms

## Architecture

### Components

1. **Prompt Generation Queue** (`prompt_generation_jobs` table)
   - Stores queued prompt generation requests
   - Tracks status, retry counts, and priority
   - Links to main job system

2. **Queue Service** (`src/lib/prompt-queue.ts`)
   - Background processing service
   - Handles job claiming, processing, and completion
   - Implements retry logic with exponential backoff

3. **API Endpoints**
   - `/api/prompt/queue` - Enqueue requests and get stats
   - `/api/prompt/queue/[promptJobId]` - Check status and cancel jobs
   - `/api/cron/prompt-processor` - Background processor trigger

4. **Integration Points**
   - Job creation with optional AI prompt generation
   - Dispatch system checks for prompt completion
   - Frontend polling for real-time updates

## Database Schema

### New Tables

```sql
-- Prompt generation queue
create table public.prompt_generation_jobs (
  id uuid primary key default uuid_generate_v4(),
  row_id uuid not null references public.model_rows(id) on delete cascade,
  model_id uuid not null references public.models(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ref_urls text[], -- array of reference image URLs
  target_url text not null, -- target image URL
  status text not null default 'queued', -- 'queued'|'processing'|'completed'|'failed'
  generated_prompt text, -- the AI-generated prompt
  error text, -- error message if failed
  retry_count int not null default 0,
  max_retries int not null default 3,
  priority int not null default 5, -- 1-10, higher = more priority
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Add columns to existing jobs table
alter table public.jobs 
add column prompt_job_id uuid references public.prompt_generation_jobs(id),
add column prompt_status text default 'pending'; -- 'pending'|'generating'|'completed'|'failed'
```

### Database Functions

- `claim_prompt_jobs(limit)` - Atomically claim jobs for processing
- `update_prompt_job_status(job_id, status, prompt, error)` - Update job status
- `get_prompt_queue_stats()` - Get queue statistics

## API Usage

### Enqueue Prompt Generation

```typescript
// Enqueue a prompt generation request
const response = await fetch('/api/prompt/queue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rowId: 'uuid',
    refUrls: ['url1', 'url2'], // optional
    targetUrl: 'url',
    priority: 8 // 1-10, higher = more priority
  })
})

const { promptJobId, estimatedWaitTime } = await response.json()
```

### Check Status

```typescript
// Check prompt generation status
const response = await fetch(`/api/prompt/queue/${promptJobId}`)
const { status, generatedPrompt, error } = await response.json()

if (status === 'completed') {
  // Use generatedPrompt
} else if (status === 'failed') {
  // Handle error
}
```

### Create Job with AI Prompt

```typescript
// Create job with AI prompt generation
const response = await fetch('/api/jobs/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    rowId: 'uuid',
    useAiPrompt: true
  })
})
```

## Queue Processing

### Background Service

The queue service runs in the background and:

1. **Claims Jobs**: Atomically claims up to 3 jobs at a time
2. **Processes**: Calls Grok API with retry logic
3. **Updates**: Updates job status and dependent jobs
4. **Retries**: Implements exponential backoff for failed requests

### Retry Logic

```typescript
const retryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2
}

// Delay calculation: min(baseDelay * (2^retryCount), maxDelay)
```

### Priority System

- **1-3**: Low priority (background tasks)
- **4-6**: Normal priority (default)
- **7-9**: High priority (user-initiated)
- **10**: Critical priority (urgent requests)

## Integration with Existing System

### Job Creation Flow

1. User clicks "AI Generate" button
2. Frontend calls `/api/jobs/create` with `useAiPrompt: true`
3. Backend enqueues prompt generation job
4. Main job is created with `prompt_status: 'generating'`
5. Dispatch system waits for prompt completion
6. Once prompt is ready, job proceeds normally

### Dispatch Integration

The dispatch system now checks for prompt completion:

```typescript
if (job.prompt_job_id && job.prompt_status === 'generating') {
  // Check prompt generation status
  const promptJob = await getPromptStatus(job.prompt_job_id)
  
  if (promptJob.status === 'completed') {
    // Update job with generated prompt and proceed
  } else if (promptJob.status === 'failed') {
    // Mark job as failed
  } else {
    // Requeue job and wait
  }
}
```

## Frontend Integration

### UI Components

- **AI Generate Button**: New button next to regular generate
- **Status Polling**: Real-time status updates
- **Progress Indicators**: Shows queue position and wait time
- **Error Handling**: User-friendly error messages

### Polling Strategy

```typescript
const pollPromptGeneration = async (rowId: string, promptJobId: string) => {
  const maxAttempts = 60 // 5 minutes max
  let attempts = 0

  const poll = async () => {
    const { status, generatedPrompt, error } = await checkStatus(promptJobId)
    
    if (status === 'completed') {
      // Update UI with generated prompt
    } else if (status === 'failed') {
      // Show error
    } else {
      // Continue polling
      setTimeout(poll, 5000)
    }
  }
  
  poll()
}
```

## Monitoring and Statistics

### Queue Statistics

```typescript
const stats = await fetch('/api/prompt/queue').then(r => r.json())
// Returns:
{
  totalQueued: 5,
  totalProcessing: 2,
  totalCompleted: 150,
  totalFailed: 3,
  averageWaitTime: 45, // seconds
  estimatedWaitTime: 30 // seconds
}
```

### Health Monitoring

- Queue depth monitoring
- Processing rate tracking
- Error rate analysis
- Average wait time calculation

## Error Handling

### Failure Scenarios

1. **Grok API Failure**: Retry with exponential backoff
2. **Network Timeout**: Retry with increased timeout
3. **Rate Limiting**: Respect rate limits and queue requests
4. **Invalid Images**: Validate URLs before processing
5. **Database Errors**: Handle concurrent access gracefully

### Fallback Mechanisms

1. **Model Fallback**: Try different Grok models in order
2. **Template Fallback**: Use predefined templates if all models fail
3. **Manual Prompt**: Allow users to provide manual prompts
4. **Graceful Degradation**: Continue with existing prompts if AI fails

## Performance Considerations

### Optimization Strategies

1. **Batch Processing**: Process multiple jobs in parallel
2. **Connection Pooling**: Reuse HTTP connections
3. **Caching**: Cache signed URLs and model responses
4. **Rate Limiting**: Respect API rate limits
5. **Queue Prioritization**: Process high-priority jobs first

### Scalability

- **Horizontal Scaling**: Multiple queue processors
- **Load Balancing**: Distribute load across instances
- **Database Optimization**: Proper indexing and query optimization
- **Memory Management**: Efficient job processing

## Deployment

### Environment Variables

```bash
XAI_API_KEY=your_grok_api_key
WAVESPEED_API_KEY=your_wavespeed_key
WAVESPEED_API_BASE=https://api.wavespeed.ai
```

### Database Migration

1. Run the SQL schema migration
2. Deploy the new code
3. Initialize the queue service
4. Monitor queue performance

### Initialization

```typescript
// Initialize background services
await fetch('/api/init', { method: 'POST' })
```

## Testing

### Test Scenarios

1. **Happy Path**: Successful prompt generation
2. **API Failure**: Grok API unavailable
3. **Network Issues**: Timeout and retry scenarios
4. **Concurrent Requests**: Multiple simultaneous requests
5. **Priority Handling**: Different priority levels
6. **Error Recovery**: Failed job recovery

### Monitoring

- Queue depth alerts
- Processing time monitoring
- Error rate tracking
- User experience metrics

## Future Enhancements

### Planned Features

1. **Webhook Support**: Real-time notifications
2. **Batch Processing**: Process multiple prompts together
3. **Advanced Retry**: Circuit breaker pattern
4. **Analytics**: Detailed usage analytics
5. **A/B Testing**: Compare different prompt strategies

### Performance Improvements

1. **Streaming**: Stream prompt generation results
2. **Caching**: Cache common prompt patterns
3. **Optimization**: Optimize prompt templates
4. **ML Integration**: Learn from user feedback

## Troubleshooting

### Common Issues

1. **Queue Not Processing**: Check service initialization
2. **High Wait Times**: Monitor queue depth and processing rate
3. **API Errors**: Check Grok API status and rate limits
4. **Database Locks**: Monitor concurrent access patterns

### Debug Commands

```sql
-- Check queue status
SELECT * FROM get_prompt_queue_stats();

-- View queued jobs
SELECT * FROM prompt_generation_jobs WHERE status = 'queued' ORDER BY priority DESC, created_at ASC;

-- Check failed jobs
SELECT * FROM prompt_generation_jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 10;
```

This queue system ensures reliable AI prompt generation while maintaining excellent user experience and system performance.
