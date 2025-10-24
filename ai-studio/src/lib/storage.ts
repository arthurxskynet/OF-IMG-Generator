import { supabaseAdmin } from '@/lib/supabase-admin'

/** objectPath is "bucket/objectKey" */
export async function signPath(objectPath: string, expiresIn = 14400): Promise<string> {
  const supabase = supabaseAdmin
  const [bucket, ...rest] = objectPath.split('/')
  const key = rest.join('/')
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, expiresIn)
  if (error || !data?.signedUrl) throw new Error('Cannot sign URL')
  return data.signedUrl
}

/** Download remote image and upload to outputs bucket; return objectPath "outputs/<key>" */
export async function fetchAndSaveToOutputs(remoteUrl: string, userId: string) {
  const supabase = supabaseAdmin
  const res = await fetch(remoteUrl)
  if (!res.ok) throw new Error('Fetch output failed')
  const buf = Buffer.from(await res.arrayBuffer())
  const key = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
  const { error } = await supabase.storage.from('outputs').upload(key, buf, {
    contentType: 'image/jpeg',
    upsert: false
  })
  if (error) throw new Error('Upload to outputs failed')
  return { bucket: 'outputs', objectKey: key, objectPath: `outputs/${key}` }
}
