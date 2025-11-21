import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

export async function POST(req: NextRequest) {
  try {
    const { prompt = "A beautiful landscape", images } = await req.json()
    
    if (!process.env.WAVESPEED_API_KEY) {
      return NextResponse.json({ error: 'WaveSpeed API key not configured' }, { status: 500 })
    }

    if (!images || images.length < 1) {
      return NextResponse.json({ error: 'Need at least 1 image for Seedream V4 Edit' }, { status: 400 })
    }

    const base = process.env.WAVESPEED_API_BASE || 'https://api.wavespeed.ai'
    
    console.log('[WaveSpeed Test] Making API call with:', {
      endpoint: `${base}/api/v3/bytedance/seedream-v4/edit`,
      prompt: prompt.substring(0, 100),
      imageCount: images.length
    })

    const resp = await axios.post(
      `${base}/api/v3/bytedance/seedream-v4/edit`,
      {
        prompt,
        images,
        size: "4096*4096",
        enable_sync_mode: false,
        enable_base64_output: false
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WAVESPEED_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 600_000
      }
    )

    console.log('[WaveSpeed Test] API Response:', {
      status: resp.status,
      statusText: resp.statusText,
      code: resp?.data?.code,
      message: resp?.data?.message,
      dataKeys: Object.keys(resp?.data?.data || {}),
      providerId: resp?.data?.data?.id
    })

    return NextResponse.json({
      success: true,
      providerId: resp?.data?.data?.id,
      status: resp?.data?.data?.status,
      responseCode: resp?.data?.code,
      responseMessage: resp?.data?.message,
      apiResponse: resp?.data
    })

  } catch (e: any) {
    console.error('[WaveSpeed Test] Error:', {
      status: e?.response?.status,
      statusText: e?.response?.statusText,
      error: e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message,
      fullResponse: e?.response?.data
    })

    return NextResponse.json({
      success: false,
      error: e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message,
      status: e?.response?.status,
      fullErrorData: e?.response?.data
    }, { status: e?.response?.status || 500 })
  }
}
