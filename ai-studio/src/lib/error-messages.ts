/**
 * User-friendly error messages and actionable guidance
 * Maps error categories to user-facing notifications
 */

import { ErrorCategory } from './error-categorization'

export interface ErrorNotification {
  title: string
  description: string
  action?: string // Optional action user can take
  variant: 'destructive' | 'default'
}

/**
 * Get user-friendly error notification for an error category
 */
export function getErrorNotification(
  category: ErrorCategory,
  originalMessage?: string,
  details?: Record<string, any>
): ErrorNotification {
  const baseMessage = originalMessage || 'An error occurred'

  switch (category) {
    case ErrorCategory.CREDITS_INSUFFICIENT:
      return {
        title: 'Insufficient Credits',
        description: 'Your account does not have enough credits to complete this generation. Please add credits to your account.',
        action: 'Add credits to continue',
        variant: 'destructive'
      }

    case ErrorCategory.QUOTA_EXCEEDED:
      return {
        title: 'Quota Exceeded',
        description: 'You have reached your generation quota limit. Please wait or upgrade your plan.',
        action: 'Check your plan limits',
        variant: 'destructive'
      }

    case ErrorCategory.DIMENSIONS_INVALID:
      return {
        title: 'Invalid Dimensions',
        description: 'The image dimensions are invalid. Dimensions must be between 1024 and 4096 pixels on each side.',
        action: 'Adjust dimensions and try again',
        variant: 'destructive'
      }

    case ErrorCategory.DIMENSIONS_OUT_OF_RANGE:
      return {
        title: 'Dimensions Out of Range',
        description: `The requested dimensions (${details?.width || '?'}x${details?.height || '?'}) are outside the valid range. Dimensions must be between 1024 and 4096 pixels.`,
        action: 'Adjust dimensions to be within 1024-4096 pixels',
        variant: 'destructive'
      }

    case ErrorCategory.PROMPT_EMPTY:
      return {
        title: 'Missing Prompt',
        description: 'No prompt was provided for this generation. Please add a prompt before generating.',
        action: 'Add a prompt and try again',
        variant: 'destructive'
      }

    case ErrorCategory.PROMPT_GENERATION_FAILED:
      return {
        title: 'Prompt Generation Failed',
        description: 'The AI prompt generation service encountered an error. Please try using a manual prompt instead.',
        action: 'Enter a manual prompt',
        variant: 'destructive'
      }

    case ErrorCategory.IMAGE_MISSING:
      return {
        title: 'Image Not Found',
        description: 'The required image file could not be found or accessed. The file may have been deleted or moved.',
        action: 'Re-upload the image and try again',
        variant: 'destructive'
      }

    case ErrorCategory.IMAGE_PATH_INVALID:
      return {
        title: 'Invalid Image Path',
        description: 'The image path is invalid or corrupted. Please re-upload the image.',
        action: 'Re-upload the image',
        variant: 'destructive'
      }

    case ErrorCategory.REQUEST_MALFORMED:
      return {
        title: 'Invalid Request',
        description: 'The generation request is malformed or missing required information.',
        action: 'Check your settings and try again',
        variant: 'destructive'
      }

    case ErrorCategory.NETWORK_ERROR:
      return {
        title: 'Network Error',
        description: 'A network connection error occurred. Please check your internet connection and try again.',
        action: 'Retry the generation',
        variant: 'destructive'
      }

    case ErrorCategory.TIMEOUT:
      return {
        title: 'Request Timed Out',
        description: 'The generation request took too long to process and timed out. This may be due to high server load.',
        action: 'Try again in a few moments',
        variant: 'destructive'
      }

    case ErrorCategory.RATE_LIMITED:
      return {
        title: 'Rate Limit Exceeded',
        description: 'Too many requests have been made. Please wait a moment before trying again.',
        action: 'Wait a few seconds and retry',
        variant: 'destructive'
      }

    case ErrorCategory.API_BAD_REQUEST:
      return {
        title: 'Invalid Request',
        description: 'The request was rejected by the API. Please check your settings and try again.',
        action: 'Review your generation settings',
        variant: 'destructive'
      }

    case ErrorCategory.API_UNAUTHORIZED:
      return {
        title: 'Authentication Failed',
        description: 'The API authentication failed. Please contact support if this issue persists.',
        action: 'Contact support',
        variant: 'destructive'
      }

    case ErrorCategory.API_FORBIDDEN:
      return {
        title: 'Access Forbidden',
        description: 'You do not have permission to perform this action. Please check your account permissions.',
        action: 'Check your account access',
        variant: 'destructive'
      }

    case ErrorCategory.API_SERVER_ERROR:
      return {
        title: 'Server Error',
        description: 'The generation service encountered an internal error. Please try again in a few moments.',
        action: 'Retry the generation',
        variant: 'destructive'
      }

    case ErrorCategory.PROVIDER_ID_MISSING:
      return {
        title: 'Generation Failed to Start',
        description: 'The generation job could not be started. The service may be experiencing issues.',
        action: 'Try again in a few moments',
        variant: 'destructive'
      }

    case ErrorCategory.DATABASE_ERROR:
      return {
        title: 'Database Error',
        description: 'A database error occurred while processing your request. Please try again.',
        action: 'Retry the operation',
        variant: 'destructive'
      }

    case ErrorCategory.UNKNOWN:
    default:
      return {
        title: 'Generation Failed',
        description: baseMessage || 'An unexpected error occurred. Please try again or contact support if the issue persists.',
        action: 'Try again or contact support',
        variant: 'destructive'
      }
  }
}

/**
 * Format error message for display
 * Combines category-based message with original error details when helpful
 */
export function formatErrorMessage(
  category: ErrorCategory,
  originalMessage?: string,
  details?: Record<string, any>
): string {
  const notification = getErrorNotification(category, originalMessage, details)
  
  // If we have a specific original message that's different from the category message,
  // append it for additional context (but keep it concise)
  if (originalMessage && 
      originalMessage.length < 100 && 
      !notification.description.includes(originalMessage)) {
    return `${notification.description} (${originalMessage})`
  }
  
  return notification.description
}


