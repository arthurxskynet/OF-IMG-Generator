/**
 * Hook for displaying categorized error notifications
 * Provides consistent error display across components
 */

import { useToast } from '@/hooks/use-toast'
import { categorizeError, ErrorCategory } from '@/lib/error-categorization'
import { getErrorNotification } from '@/lib/error-messages'

/**
 * Parse error category from error message string
 * Error messages are stored as "category: message" format
 */
function parseErrorCategory(errorMessage: string): {
  category: ErrorCategory
  message: string
} {
  // Check if error message contains category prefix
  const categoryMatch = errorMessage.match(/^([a-z_]+):\s*(.+)$/)
  if (categoryMatch) {
    const [, categoryStr, message] = categoryMatch
    // Validate category exists in enum
    if (Object.values(ErrorCategory).includes(categoryStr as ErrorCategory)) {
      return {
        category: categoryStr as ErrorCategory,
        message: message.trim()
      }
    }
  }
  
  // If no category prefix, try to categorize the error
  const categorized = categorizeError({ message: errorMessage })
  return {
    category: categorized.category,
    message: categorized.message
  }
}

/**
 * Hook for displaying error notifications
 */
export function useErrorNotification() {
  const { toast } = useToast()

  /**
   * Show error notification from error message string
   * Handles both categorized errors (format: "category: message") and plain error messages
   */
  const showError = (errorMessage: string | Error, details?: Record<string, any>) => {
    const message = errorMessage instanceof Error ? errorMessage.message : errorMessage
    const { category, message: parsedMessage } = parseErrorCategory(message)
    
    const notification = getErrorNotification(category, parsedMessage, details)
    
    toast({
      title: notification.title,
      description: notification.description,
      variant: notification.variant
    })
  }

  /**
   * Show error notification from error category directly
   */
  const showErrorByCategory = (
    category: ErrorCategory,
    originalMessage?: string,
    details?: Record<string, any>
  ) => {
    const notification = getErrorNotification(category, originalMessage, details)
    
    toast({
      title: notification.title,
      description: notification.description,
      variant: notification.variant
    })
  }

  /**
   * Show error notification from API error response
   */
  const showApiError = (error: any, context?: {
    httpStatus?: number
    errorCode?: string | number
    responseData?: any
  }) => {
    const categorized = categorizeError(error, context)
    const notification = getErrorNotification(
      categorized.category,
      categorized.message,
      categorized.details
    )
    
    toast({
      title: notification.title,
      description: notification.description,
      variant: notification.variant
    })
  }

  return {
    showError,
    showErrorByCategory,
    showApiError
  }
}


