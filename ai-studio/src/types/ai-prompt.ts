export interface PromptGenerationRequest {
  rowId: string
}

export interface PromptGenerationResponse {
  prompt: string
}

export interface GrokVisionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | GrokVisionContent[]
}

export interface GrokVisionContent {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

export interface GrokVisionRequest {
  model: string
  messages: GrokVisionMessage[]
  temperature: number
  max_tokens: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
}

export interface GrokVisionResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}
