# Environment Variables Configuration

## AI Prompt Generation Variables

### `XAI_API_KEY` (Required)

Your xAI API key for accessing Grok vision models.

```bash
XAI_API_KEY=your_xai_api_key_here
```

**How to get**:
1. Visit https://console.x.ai/
2. Sign up or log in
3. Create an API key
4. Copy and paste into your environment

**Required for**: All LLM-based prompt generation

---

### `PROMPT_USE_RICH_STYLE` (Optional)

Controls the prompt generation style for Seedream v4.

```bash
# Enable rich Seedream-style prompts (DEFAULT)
PROMPT_USE_RICH_STYLE=true

# Use legacy concise single-sentence prompts
PROMPT_USE_RICH_STYLE=false
```

**Default**: `true` (rich prompts enabled)

**Options**:
- `true` or omitted: Rich multi-paragraph Seedream-style prompts
  - 150-350 words
  - Detailed sections: subject, scene, lighting, camera, atmosphere, etc.
  - Technical photography terminology
  - Comprehensive descriptions

- `false`: Legacy concise single-sentence prompts
  - Under 50 words
  - Simple swap instruction only
  - Minimal descriptors

**When to use legacy mode**:
- If rich prompts cause issues
- For A/B testing comparison
- To reduce API token usage
- For faster response times (marginal)

**Impact**:
- API token usage: 7x increase with rich prompts
- Response time: Slightly longer with rich prompts
- Image quality: Expected to be equal or better with rich prompts

---

### `PROMPT_USE_LLM_FACESWAP` (Optional)

Controls whether to use LLM-based prompt generation or deterministic templates for face-swap operations.

```bash
# Enable LLM-based generation (DEFAULT, recommended)
PROMPT_USE_LLM_FACESWAP=true

# Use simple deterministic templates (no LLM calls)
PROMPT_USE_LLM_FACESWAP=false
```

**Default**: `true` (LLM enabled)

**Options**:
- `true`: Use Grok vision models to analyze images and generate prompts
- `false`: Use pre-defined templates without image analysis

**Note**: When set to `false`, `PROMPT_USE_RICH_STYLE` has no effect (templates are always simple).

---

### `PROMPT_VARIANTS_RICH` (Optional)

Controls the prompt generation style specifically for Variant prompts (multi-image style analysis).

```bash
# Enable rich Seedream v4 variant prompts (DEFAULT)
PROMPT_VARIANTS_RICH=true

# Use legacy concise variant prompts
PROMPT_VARIANTS_RICH=false
```

**Default**: `true` (rich variant prompts enabled)

**Options**:
- `true` or omitted: Rich multi-section Seedream v4 variant prompts
  - 150-400 words
  - Comprehensive sections: Subject & Style, Composition & Framing, Lighting Setup, Color Palette & Atmosphere, Environment & Setting, Technical Quality, Variation Guidelines
  - Adaptive sampling (temperature 0.35-0.65 based on image count and complexity)
  - Professional photography terminology

- `false`: Legacy concise variant prompts
  - 25-60 words
  - Simple variant instruction format
  - Fixed temperature 0.4

**Adaptive Sampling**:
When enabled, temperature automatically adjusts:
- Baseline: 0.5
- Single image: -0.05
- 3+ images: +0.05
- 5+ images: +0.1
- Simple enhancements: -0.05
- Complex enhancements: +0.05
- Clamped to 0.35-0.65 range

**When to use legacy mode**:
- Testing/comparison with old variant outputs
- Reducing API token usage
- Simpler use cases not requiring detailed style guidance

**Impact**:
- API token usage: ~3-5x increase with rich variant prompts
- Response time: Slightly longer (more tokens to process)
- Variant quality: Better style consistency with rich prompts

---

## Quick Setup

### Development / Local Testing

Create a `.env.local` file in the `ai-studio` directory:

```bash
# .env.local

# Required
XAI_API_KEY=your_xai_api_key_here

# Optional - defaults to rich prompts
PROMPT_USE_RICH_STYLE=true
PROMPT_USE_LLM_FACESWAP=true
PROMPT_VARIANTS_RICH=true

# Your other environment variables...
```

### Production / Vercel

Set environment variables in your Vercel project settings:

1. Go to your project dashboard
2. Navigate to Settings → Environment Variables
3. Add the following:

```
XAI_API_KEY = your_xai_api_key_here
PROMPT_USE_RICH_STYLE = true
PROMPT_USE_LLM_FACESWAP = true
PROMPT_VARIANTS_RICH = true
```

4. Redeploy your application

### Testing Both Modes

To test both prompt styles:

**Terminal 1** (Rich prompts):
```bash
export PROMPT_USE_RICH_STYLE=true
npm run dev
```

**Terminal 2** (Legacy prompts):
```bash
export PROMPT_USE_RICH_STYLE=false
npm run dev -- --port 3001
```

Compare outputs side-by-side.

---

## Environment Validation

Use the test script to validate your environment:

```bash
node test-rich-prompts.js
```

This will check:
- ✓ XAI_API_KEY is set
- ✓ PROMPT_USE_RICH_STYLE value
- ✓ PROMPT_USE_LLM_FACESWAP value
- And provide testing guidance

---

## Troubleshooting

### Issue: "XAI_API_KEY environment variable is not set"

**Solution**: Set your API key in your environment file or deployment platform.

### Issue: Prompts are still short/single-sentence

**Check**:
1. Is `PROMPT_USE_RICH_STYLE=true`? (or omitted)
2. Is `PROMPT_USE_LLM_FACESWAP=true`?
3. Did you restart/redeploy after changing env vars?
4. Check logs for `promptStyle: 'rich-seedream'`

### Issue: API costs are too high

**Solution**: Set `PROMPT_USE_RICH_STYLE=false` to reduce token usage by ~85%.

### Issue: Rich prompts causing errors

**Immediate fix**: Set `PROMPT_USE_RICH_STYLE=false` and redeploy.

**Long-term**: Check logs for validation errors, adjust validation rules, or refine templates.

---

## See Also

- `IMPLEMENTATION-SUMMARY.md` - Complete implementation overview
- `RICH-PROMPTS-ROLLOUT-GUIDE.md` - Detailed rollout strategy
- `NEW-SEEDREAM-PROMPT-SPEC.md` - Prompt specification
- `test-rich-prompts.js` - Environment and feature testing

