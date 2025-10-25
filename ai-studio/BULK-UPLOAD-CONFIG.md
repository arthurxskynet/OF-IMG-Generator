# Bulk Upload Configuration

This document describes the configuration options for the bulk upload functionality to resolve production issues.

## Environment Variables

Add these optional environment variables to your production environment to fine-tune bulk upload behavior:

```bash
# Bulk Upload Configuration
BULK_UPLOAD_BATCH_SIZE=2                    # Number of files to process simultaneously (default: 2)
BULK_UPLOAD_BATCH_DELAY_MS=1000            # Delay between batches in milliseconds (default: 1000)
BULK_UPLOAD_MAX_FILES=10                   # Maximum files per bulk upload (default: 10)
```

## Production Optimizations

### Server-Side Processing
- **Primary Method**: Uses `/api/upload/bulk` endpoint for server-side processing
- **Benefits**: 
  - Reduces client-side timeout issues
  - Better error handling and cleanup
  - Configurable batch processing
  - Atomic operations with rollback on failure

### Fallback Mechanism
- **Fallback**: If server-side processing fails, automatically falls back to improved client-side processing
- **Client-Side Improvements**:
  - Reduced batch size (2 files instead of 3)
  - Increased retry attempts (5 instead of 3)
  - Longer delays between operations
  - Better authentication token handling
  - Upload timeout protection (30 seconds)

### Error Handling
- **Row Creation**: Automatic cleanup of failed uploads
- **Storage Cleanup**: Removes uploaded files if row updates fail
- **Authentication**: Graceful handling of token refresh failures
- **Timeout Protection**: Prevents hanging uploads

## Troubleshooting

### Common Issues
1. **Timeout Errors**: Increase `BULK_UPLOAD_BATCH_DELAY_MS` or decrease `BULK_UPLOAD_BATCH_SIZE`
2. **Rate Limiting**: Increase delays between batches
3. **Memory Issues**: Reduce `BULK_UPLOAD_MAX_FILES` for large files

### Monitoring
- Check browser console for detailed error logs
- Monitor server logs for batch processing information
- Use network tab to identify timeout issues

## Vercel Configuration

For Vercel deployments, ensure your plan supports the required timeout:
- **Hobby Plan**: 10-second timeout (may need smaller batches)
- **Pro Plan**: 60-second timeout (recommended for bulk uploads)

Consider upgrading to Pro plan for better bulk upload performance.
