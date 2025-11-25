# Variants Rows Workspace - Logic Review & Fixes

## Issues Found and Fixes Needed

### 1. Missing Throttling in refreshRowData (Line 227)
**Issue**: `refreshRowData` doesn't have throttling logic even though refs are declared.
**Fix**: Add throttling check at the start of the function.

### 2. Remaining router.refresh() Calls (Lines 643, 1406)
**Issue**: Two `router.refresh()` calls still exist causing server-side re-renders.
**Fix**: Remove both calls and use client-side state updates only.

### 3. Inconsistent Refresh Patterns
**Issue**: Some handlers use `refreshRowData()` directly, others use `scheduleRefresh()`.
**Fix**: Standardize to use `scheduleRefresh()` for all debounced refreshes.

### 4. UPDATE Handler Uses setTimeout Instead of Debounced Refresh (Line 843)
**Issue**: UPDATE handler for variant_row_images uses `setTimeout` instead of debounced refresh.
**Fix**: Use the same debounced pattern as INSERT handler.

### 5. Missing Cleanup for refreshTimeout
**Issue**: `refreshTimeout` is not cleaned up on unmount.
**Fix**: Add cleanup in useEffect return function.

### 6. Missing Error Handling
**Issue**: Some async operations don't have proper error handling.
**Fix**: Add try-catch blocks where missing.

## Manual Fixes Required

### Fix 1: Add throttling to refreshRowData (around line 227)
Replace the function start with:
```typescript
const refreshRowData = useCallback(async () => {
  const now = Date.now()
  const timeSinceLastRefresh = now - lastRefreshTimeRef.current
  
  // Prevent rapid successive refreshes (throttle to at most once per 2 seconds)
  if (timeSinceLastRefresh < 2000 || isRefreshingRef.current) {
    return
  }
  
  isRefreshingRef.current = true
  lastRefreshTimeRef.current = now
  
  try {
    // ... existing code ...
```

And add finally block before the closing:
```typescript
  } finally {
    isRefreshingRef.current = false
  }
}, [modelId])
```

### Fix 2: Remove router.refresh() on line 643
Replace:
```typescript
      // Immediate refresh without delay
      refreshRowData().catch(() => {})
      
      // Refresh server-side cache to ensure parent Server Component refetches data
      router.refresh()
```
With:
```typescript
      // FIXED: Use debounced refresh instead of immediate to prevent rapid successive calls
      scheduleRefresh()
      
      // FIXED: Removed router.refresh() to prevent server-side re-renders that cause loops
```

### Fix 3: Remove router.refresh() on line 1406
Replace:
```typescript
      // Refresh server-side cache to ensure parent Server Component refetches data
      router.refresh()
```
With:
```typescript
      // FIXED: Removed router.refresh() - client-side state update is sufficient
      // Realtime subscriptions will handle updates from other clients
```

### Fix 4: Fix UPDATE handler (around line 843)
Replace:
```typescript
        // Refresh the specific row to show updated image
        const variantRowId = String(updatedImage.variant_row_id)
        if (variantRowId) {
          setTimeout(() => {
            refreshSingleRow(variantRowId).catch(() => {})
          }, 200)
        }
```
With:
```typescript
        // Refresh the specific row to show updated image
        // FIXED: Use debounced refresh instead of immediate to prevent rapid successive calls
        const variantRowId = String(updatedImage.variant_row_id)
        if (variantRowId) {
          // Debounce to batch multiple image updates
          if (refreshTimeout.current) window.clearTimeout(refreshTimeout.current)
          refreshTimeout.current = window.setTimeout(() => {
            refreshSingleRow(variantRowId).catch(() => {})
            refreshTimeout.current = null
          }, 500)
        }
```

### Fix 5: Replace refreshRowData() with scheduleRefresh() (around line 1268)
Replace:
```typescript
      // Refresh rows to show new ones
      await refreshRowData()
```
With:
```typescript
      // Refresh rows to show new ones
      // FIXED: Use debounced refresh to prevent rapid successive calls
      scheduleRefresh()
```

### Fix 6: Add cleanup for refreshTimeout
In the useEffect cleanup (around line 885), add:
```typescript
    return () => {
      cancelled = true
      // Clear refresh timeout
      if (refreshTimeout.current) {
        window.clearTimeout(refreshTimeout.current)
        refreshTimeout.current = null
      }
      // ... existing cleanup ...
```

## Summary

All fixes are focused on:
1. Preventing unnecessary server-side re-renders
2. Throttling/debouncing refresh calls to prevent loops
3. Consistent refresh patterns throughout the component
4. Proper cleanup of timeouts and subscriptions


