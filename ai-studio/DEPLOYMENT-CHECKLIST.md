# AI Prompt Queue System - Deployment Checklist

## Pre-Deployment Setup

### 1. Database Migration
- [ ] Run the SQL schema migration (`sql/prompt-queue-schema.sql`)
- [ ] Verify new tables are created:
  - `prompt_generation_jobs`
  - New columns in `jobs` table (`prompt_job_id`, `prompt_status`)
- [ ] Verify database functions are created:
  - `claim_prompt_jobs(limit)`
  - `update_prompt_job_status(job_id, status, prompt, error)`
  - `get_prompt_queue_stats()`
- [ ] Test database functions with sample data

### 2. Environment Variables
- [ ] Set `XAI_API_KEY` for Grok API access
- [ ] Verify `WAVESPEED_API_KEY` is configured
- [ ] Set `WAVESPEED_API_BASE` (defaults to https://api.wavespeed.ai)
- [ ] Test API connectivity

### 3. Code Deployment
- [ ] Deploy new TypeScript files:
  - `src/types/prompt-queue.ts`
  - `src/lib/prompt-queue.ts`
  - `src/app/api/prompt/queue/route.ts`
  - `src/app/api/prompt/queue/[promptJobId]/route.ts`
  - `src/app/api/cron/prompt-processor/route.ts`
  - `src/app/api/init/route.ts`
- [ ] Deploy updated files:
  - `src/app/api/jobs/create/route.ts`
  - `src/app/api/dispatch/route.ts`
  - `src/types/jobs.ts`
  - `src/components/model-workspace.tsx`
- [ ] Verify no TypeScript compilation errors
- [ ] Run linting checks

## Post-Deployment Verification

### 4. Service Initialization
- [ ] Call initialization endpoint: `POST /api/init`
- [ ] Verify prompt queue service starts successfully
- [ ] Check background processing is active
- [ ] Monitor logs for any startup errors

### 5. API Endpoint Testing
- [ ] Test queue statistics: `GET /api/prompt/queue`
- [ ] Test prompt enqueue: `POST /api/prompt/queue`
- [ ] Test status check: `GET /api/prompt/queue/[promptJobId]`
- [ ] Test job cancellation: `DELETE /api/prompt/queue/[promptJobId]`
- [ ] Test background processor: `POST /api/cron/prompt-processor`

### 6. Integration Testing
- [ ] Test job creation with AI prompt: `POST /api/jobs/create` with `useAiPrompt: true`
- [ ] Verify prompt generation is queued
- [ ] Test dispatch system handles prompt completion
- [ ] Verify jobs proceed after prompt generation
- [ ] Test error handling for failed prompt generation

### 7. Frontend Testing
- [ ] Verify "AI Generate" button appears in UI
- [ ] Test AI prompt generation flow
- [ ] Verify status polling works correctly
- [ ] Test error handling and user feedback
- [ ] Verify queue position display
- [ ] Test cancellation functionality

## Monitoring Setup

### 8. Queue Monitoring
- [ ] Set up queue depth monitoring
- [ ] Monitor processing rate
- [ ] Track error rates
- [ ] Set up alerts for queue backlog
- [ ] Monitor average wait times

### 9. Performance Monitoring
- [ ] Monitor Grok API response times
- [ ] Track retry rates
- [ ] Monitor database performance
- [ ] Set up error rate alerts
- [ ] Track user experience metrics

### 10. Logging Configuration
- [ ] Verify queue processing logs
- [ ] Monitor error logs
- [ ] Set up log aggregation
- [ ] Configure log retention
- [ ] Set up log-based alerts

## Production Readiness

### 11. Load Testing
- [ ] Test with multiple concurrent requests
- [ ] Verify queue handles high load
- [ ] Test retry mechanisms under load
- [ ] Verify database performance under load
- [ ] Test error recovery scenarios

### 12. Backup and Recovery
- [ ] Verify database backups include new tables
- [ ] Test recovery procedures
- [ ] Document rollback procedures
- [ ] Test data migration scripts
- [ ] Verify backup integrity

### 13. Security Review
- [ ] Verify API authentication
- [ ] Check authorization for queue operations
- [ ] Review error message security
- [ ] Verify input validation
- [ ] Check rate limiting

## Documentation

### 14. User Documentation
- [ ] Update user guides with AI prompt features
- [ ] Document new UI elements
- [ ] Create troubleshooting guides
- [ ] Update API documentation
- [ ] Create FAQ section

### 15. Developer Documentation
- [ ] Update API documentation
- [ ] Document queue system architecture
- [ ] Create development setup guide
- [ ] Document monitoring procedures
- [ ] Update deployment procedures

## Rollback Plan

### 16. Rollback Preparation
- [ ] Document rollback steps
- [ ] Prepare database rollback scripts
- [ ] Test rollback procedures
- [ ] Prepare feature flags for quick disable
- [ ] Document data migration rollback

### 17. Emergency Procedures
- [ ] Document emergency stop procedures
- [ ] Prepare queue drain procedures
- [ ] Document data recovery steps
- [ ] Prepare communication templates
- [ ] Test emergency procedures

## Success Criteria

### 18. Performance Metrics
- [ ] Queue processing rate > 10 jobs/minute
- [ ] Average wait time < 2 minutes
- [ ] Error rate < 5%
- [ ] API response time < 500ms
- [ ] User satisfaction > 90%

### 19. Reliability Metrics
- [ ] Queue uptime > 99.9%
- [ ] Job completion rate > 95%
- [ ] Retry success rate > 80%
- [ ] Data consistency verified
- [ ] No data loss incidents

## Post-Deployment Tasks

### 20. Cleanup
- [ ] Remove test data
- [ ] Clean up temporary files
- [ ] Update monitoring dashboards
- [ ] Schedule regular maintenance
- [ ] Plan future enhancements

### 21. Team Training
- [ ] Train support team on new features
- [ ] Update troubleshooting procedures
- [ ] Train developers on queue system
- [ ] Update monitoring procedures
- [ ] Schedule knowledge transfer sessions

## Verification Commands

```bash
# Test queue system
node test-prompt-queue.js

# Check database schema
psql -d your_database -f sql/prompt-queue-schema.sql --dry-run

# Test API endpoints
curl -X GET http://localhost:3000/api/prompt/queue
curl -X POST http://localhost:3000/api/init

# Check service status
curl -X GET http://localhost:3000/api/init
```

## Emergency Contacts

- **Database Issues**: [Database Admin]
- **API Issues**: [API Team Lead]
- **Frontend Issues**: [Frontend Team Lead]
- **Infrastructure**: [DevOps Team]
- **Product Issues**: [Product Manager]

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Verified By**: _______________
**Sign-off**: _______________
