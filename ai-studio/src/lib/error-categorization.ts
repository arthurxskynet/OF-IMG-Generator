/**
 * Error Categorization System for Wave Speed API Requests
 * Categorizes errors into specific types for better user feedback and debugging
 */

export enum ErrorCategory {
  CREDITS_INSUFFICIENT = 'credits_insufficient',
  QUOTA_EXCEEDED = 'quota_exceeded',
  DIMENSIONS_INVALID = 'dimensions_invalid',
  DIMENSIONS_OUT_OF_RANGE = 'dimensions_out_of_range',
  PROMPT_EMPTY = 'prompt_empty',
  PROMPT_GENERATION_FAILED = 'prompt_generation_failed',
  IMAGE_MISSING = 'image_missing',
  IMAGE_PATH_INVALID = 'image_path_invalid',
  REQUEST_MALFORMED = 'request_malformed',
  NETWORK_ERROR = 'network_error',
  TIMEOUT = 'timeout',
  RATE_LIMITED = 'rate_limited',
  API_BAD_REQUEST = 'api_bad_request',
  API_UNAUTHORIZED = 'api_unauthorized',
  API_FORBIDDEN = 'api_forbidden',
  API_SERVER_ERROR = 'api_server_error',
  PROVIDER_ID_MISSING = 'provider_id_missing',
  DATABASE_ERROR = 'database_error',
  UNKNOWN = 'unknown'
}

export interface CategorizedError {
  category: ErrorCategory
  message: string
  originalError?: any
  details?: Record<string, any>
}

/**
 * Categorize an error from various sources (API responses, exceptions, etc.)
 */
export function categorizeError(error: any, context?: {
  httpStatus?: number
  errorMessage?: string
  errorCode?: string | number
  responseData?: any
}): CategorizedError {
  const errorMessage = (
    error?.message ||
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.response?.data?.detail ||
    context?.errorMessage ||
    String(error || 'Unknown error')
  ).toLowerCase()

  const httpStatus = error?.response?.status || context?.httpStatus
  const errorCode = error?.code || context?.errorCode
  const responseData = error?.response?.data || context?.responseData

  // Network/Connection Errors
  if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT' || errorCode === 'ENOTFOUND') {
    return {
      category: ErrorCategory.NETWORK_ERROR,
      message: error?.message || 'Network connection error',
      originalError: error,
      details: { code: errorCode }
    }
  }

  // HTTP Status Code Based Categorization
  if (httpStatus) {
    switch (httpStatus) {
      case 400:
        // Check if it's dimension-related
        if (errorMessage.includes('dimension') || errorMessage.includes('size') || errorMessage.includes('width') || errorMessage.includes('height')) {
          return {
            category: ErrorCategory.DIMENSIONS_INVALID,
            message: errorMessage || 'Invalid dimensions',
            originalError: error,
            details: { httpStatus, responseData }
          }
        }
        return {
          category: ErrorCategory.API_BAD_REQUEST,
          message: errorMessage || 'Invalid request',
          originalError: error,
          details: { httpStatus, responseData }
        }
      case 401:
        return {
          category: ErrorCategory.API_UNAUTHORIZED,
          message: errorMessage || 'Authentication failed',
          originalError: error,
          details: { httpStatus, responseData }
        }
      case 402:
        return {
          category: ErrorCategory.CREDITS_INSUFFICIENT,
          message: errorMessage || 'Payment required',
          originalError: error,
          details: { httpStatus, responseData }
        }
      case 403:
        return {
          category: ErrorCategory.API_FORBIDDEN,
          message: errorMessage || 'Access forbidden',
          originalError: error,
          details: { httpStatus, responseData }
        }
      case 429:
        return {
          category: ErrorCategory.RATE_LIMITED,
          message: errorMessage || 'Rate limit exceeded',
          originalError: error,
          details: { httpStatus, responseData }
        }
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          category: ErrorCategory.API_SERVER_ERROR,
          message: errorMessage || 'Server error',
          originalError: error,
          details: { httpStatus, responseData }
        }
    }
  }

  // Credits/Quota Errors
  if (
    errorMessage.includes('insufficient') ||
    errorMessage.includes('balance') ||
    errorMessage.includes('quota') ||
    errorMessage.includes('credit') ||
    errorMessage.includes('payment') ||
    errorMessage.includes('billing') ||
    errorMessage.includes('account suspended')
  ) {
    if (errorMessage.includes('quota') || errorMessage.includes('limit exceeded')) {
      return {
        category: ErrorCategory.QUOTA_EXCEEDED,
        message: errorMessage || 'Quota exceeded',
        originalError: error,
        details: { httpStatus, responseData }
      }
    }
    return {
      category: ErrorCategory.CREDITS_INSUFFICIENT,
      message: errorMessage || 'Insufficient credits',
      originalError: error,
      details: { httpStatus, responseData }
    }
  }

  // Dimension Errors
  if (
    errorMessage.includes('dimension') ||
    errorMessage.includes('size') ||
    errorMessage.includes('width') ||
    errorMessage.includes('height') ||
    errorMessage.includes('aspect ratio') ||
    errorMessage.includes('resolution')
  ) {
    if (errorMessage.includes('out of range') || errorMessage.includes('invalid range')) {
      return {
        category: ErrorCategory.DIMENSIONS_OUT_OF_RANGE,
        message: errorMessage || 'Dimensions out of valid range (1024-4096)',
        originalError: error,
        details: { httpStatus, responseData }
      }
    }
    return {
      category: ErrorCategory.DIMENSIONS_INVALID,
      message: errorMessage || 'Invalid dimensions',
      originalError: error,
      details: { httpStatus, responseData }
    }
  }

  // Prompt Errors
  if (
    errorMessage.includes('prompt') ||
    errorMessage.includes('empty prompt') ||
    errorMessage.includes('no prompt') ||
    errorMessage.includes('missing prompt')
  ) {
    if (errorMessage.includes('generation failed') || errorMessage.includes('failed to generate')) {
      return {
        category: ErrorCategory.PROMPT_GENERATION_FAILED,
        message: errorMessage || 'Prompt generation failed',
        originalError: error,
        details: { httpStatus, responseData }
      }
    }
    return {
      category: ErrorCategory.PROMPT_EMPTY,
      message: errorMessage || 'Prompt is empty or missing',
      originalError: error,
      details: { httpStatus, responseData }
    }
  }

  // Image Errors
  if (
    errorMessage.includes('image') ||
    errorMessage.includes('target') ||
    errorMessage.includes('reference')
  ) {
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('cannot be accessed') ||
      errorMessage.includes('does not exist')
    ) {
      return {
        category: ErrorCategory.IMAGE_MISSING,
        message: errorMessage || 'Image not found or missing',
        originalError: error,
        details: { httpStatus, responseData }
      }
    }
    if (
      errorMessage.includes('invalid path') ||
      errorMessage.includes('path failed') ||
      errorMessage.includes('normalize') ||
      errorMessage.includes('invalid image path')
    ) {
      return {
        category: ErrorCategory.IMAGE_PATH_INVALID,
        message: errorMessage || 'Invalid image path',
        originalError: error,
        details: { httpStatus, responseData }
      }
    }
  }

  // Timeout Errors
  if (
    errorMessage.includes('timeout') ||
    errorMessage.includes('timed out') ||
    errorMessage.includes('stuck') ||
    errorMessage.includes('no provider request id') ||
    errorMessage.includes('submitted without provider')
  ) {
    return {
      category: ErrorCategory.TIMEOUT,
      message: errorMessage || 'Request timed out',
      originalError: error,
      details: { httpStatus, responseData }
    }
  }

  // Provider ID Missing
  if (
    errorMessage.includes('no provider') ||
    errorMessage.includes('provider id') ||
    errorMessage.includes('provider_request_id') ||
    errorMessage.includes('request id')
  ) {
    return {
      category: ErrorCategory.PROVIDER_ID_MISSING,
      message: errorMessage || 'Provider request ID missing',
      originalError: error,
      details: { httpStatus, responseData }
    }
  }

  // Request Structure Errors
  if (
    errorMessage.includes('malformed') ||
    errorMessage.includes('invalid request') ||
    errorMessage.includes('bad request') ||
    errorMessage.includes('invalid payload')
  ) {
    return {
      category: ErrorCategory.REQUEST_MALFORMED,
      message: errorMessage || 'Invalid request structure',
      originalError: error,
      details: { httpStatus, responseData }
    }
  }

  // Database Errors
  if (
    errorMessage.includes('database') ||
    errorMessage.includes('sql') ||
    errorMessage.includes('constraint') ||
    errorMessage.includes('foreign key') ||
    error?.code?.startsWith('PGRST') ||
    error?.code?.startsWith('23')
  ) {
    return {
      category: ErrorCategory.DATABASE_ERROR,
      message: errorMessage || 'Database error',
      originalError: error,
      details: { httpStatus, responseData, dbCode: error?.code }
    }
  }

  // Rate Limiting (additional check)
  if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
    return {
      category: ErrorCategory.RATE_LIMITED,
      message: errorMessage || 'Rate limit exceeded',
      originalError: error,
      details: { httpStatus, responseData }
    }
  }

  // Unknown/Default
  return {
    category: ErrorCategory.UNKNOWN,
    message: errorMessage || 'An unknown error occurred',
    originalError: error,
    details: { httpStatus, responseData, errorCode }
  }
}

/**
 * Categorize error from WaveSpeed API response
 */
export function categorizeWaveSpeedError(response: any, error?: any): CategorizedError {
  const responseCode = response?.code
  const responseMessage = response?.message || response?.error
  const responseData = response?.data

  // Check WaveSpeed specific error codes
  if (responseCode) {
    // WaveSpeed might return specific error codes for credits/quota
    if (responseCode === 402 || responseCode === 'PAYMENT_REQUIRED') {
      return {
        category: ErrorCategory.CREDITS_INSUFFICIENT,
        message: responseMessage || 'Insufficient credits',
        originalError: error,
        details: { responseCode, responseData }
      }
    }
  }

  // Use general categorization with context
  return categorizeError(error || response, {
    httpStatus: response?.status,
    errorMessage: responseMessage,
    errorCode: responseCode,
    responseData
  })
}

/**
 * Check if dimensions are valid (1024-4096 range)
 */
export function validateDimensions(width: number, height: number): {
  valid: boolean
  category?: ErrorCategory
  message?: string
} {
  const minDim = 1024
  const maxDim = 4096

  if (width < minDim || width > maxDim || height < minDim || height > maxDim) {
    return {
      valid: false,
      category: ErrorCategory.DIMENSIONS_OUT_OF_RANGE,
      message: `Dimensions must be between ${minDim} and ${maxDim} pixels. Got ${width}x${height}`
    }
  }

  return { valid: true }
}

/**
 * Check if prompt is valid
 */
export function validatePrompt(prompt: string | null | undefined): {
  valid: boolean
  category?: ErrorCategory
  message?: string
} {
  if (!prompt || prompt.trim().length === 0) {
    return {
      valid: false,
      category: ErrorCategory.PROMPT_EMPTY,
      message: 'Prompt cannot be empty'
    }
  }

  if (prompt.trim().length < 5) {
    return {
      valid: false,
      category: ErrorCategory.PROMPT_EMPTY,
      message: 'Prompt is too short (minimum 5 characters)'
    }
  }

  return { valid: true }
}


