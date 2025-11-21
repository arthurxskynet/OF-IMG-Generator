# Rich Seedream-Style Prompts - Rollout Guide

## Overview

The AI prompt generator now supports rich, detailed Seedream v4 prompts that provide comprehensive scene descriptions including clothing details, pose, environment, lighting, camera settings, atmosphere, colors, and technical quality.

## What Changed

### Before (Legacy Concise Mode)
- Single sentence prompts (under 50 words)
- Minimal descriptors
- Focus on swap instruction only
- Example: "Swap the face and hair from the first image of professional businessman onto the second image of casual outdoor person; leave everything else in the second image unchanged."

### After (Rich Seedream Mode)
- Multi-paragraph structured prompts (150-350 words)
- Detailed sections for:
  - Reference image usage instructions
  - Subject details (clothing, pose, action)
  - Scene and environment
  - Lighting (technical details)
  - Camera settings and composition
  - Atmosphere and mood
  - Colors and textures
  - Technical quality
- Example: See `NEW-SEEDREAM-PROMPT-SPEC.md` for full examples

## Configuration

### Environment Variable

The feature is controlled by the `PROMPT_USE_RICH_STYLE` environment variable:

```bash
# Enable rich Seedream-style prompts (DEFAULT)
PROMPT_USE_RICH_STYLE=true

# Disable and use legacy concise prompts
PROMPT_USE_RICH_STYLE=false
```

**Default behavior**: Rich prompts are **ENABLED** by default. Set to `'false'` explicitly to revert to legacy mode.

### Other Related Environment Variables

```bash
# Enable LLM-based prompt generation (required for both modes)
PROMPT_USE_LLM_FACESWAP=true

# Your xAI API key (required)
XAI_API_KEY=your_api_key_here
```

## Rollout Strategy

### Phase 1: Initial Testing (Current)
- ✅ Code implemented with feature flag
- ✅ Validation logic in place
- ✅ Backward compatibility maintained
- 🔄 Ready for testing with real images

### Phase 2: Controlled Testing
1. **Test in development environment**:
   ```bash
   # In your .env.local or deployment config
   PROMPT_USE_RICH_STYLE=true
   ```

2. **Monitor logs for**:
   - Prompt generation success rate
   - Model fallback behavior
   - Validation pass/fail rates
   - Generated prompt length and quality

3. **Key metrics to track**:
   - Average prompt length (should be 150-350 words)
   - Validation failures (check reasons in logs)
   - Final image quality from Seedream
   - Face/identity fidelity
   - Background preservation

### Phase 3: Gradual Production Rollout
1. **A/B testing** (if infrastructure supports):
   - 10% users with rich prompts
   - Compare quality metrics
   - Gather user feedback

2. **Full rollout** (when stable):
   - Set `PROMPT_USE_RICH_STYLE=true` in production
   - Monitor for 24-48 hours
   - Keep rollback plan ready

### Phase 4: Make Default (Future)
- After 1-2 weeks of stable rich prompts
- Can remove legacy code or keep as fallback
- Update documentation

## Testing Checklist

### Manual Testing

- [ ] Test face-swap with 1 reference image (face mode)
- [ ] Test face-swap with 1 reference image (face-hair mode)
- [ ] Test face-swap with multiple reference images
- [ ] Test target-only enhancement (no reference images)
- [ ] Verify no facial feature descriptions in output
- [ ] Verify no hair descriptions in face-only mode
- [ ] Verify detailed clothing descriptions
- [ ] Verify technical lighting and camera details present
- [ ] Verify no markdown or meta-commentary in output
- [ ] Test with legacy mode (`PROMPT_USE_RICH_STYLE=false`)

### Log Monitoring

Look for these log entries:

```javascript
// Feature flag status
{
  promptStyle: 'rich-seedream' // or 'legacy-concise'
}

// Generation success
{
  model: 'grok-4-fast-reasoning',
  promptLength: 245,
  wordCount: 189,
  validationPassed: true,
  promptStyle: 'rich-seedream'
}

// Validation details
{
  refUrlsCount: 1,
  promptLength: 245,
  promptPreview: 'Use the first reference image for face structure and hair style...',
  promptStyle: 'rich-seedream'
}
```

### Quality Assessment

Compare images generated with:
1. Rich prompts vs legacy prompts
2. Different swap modes (face vs face-hair)
3. Various reference image counts
4. Different scene types (indoor, outdoor, studio, etc.)

Look for:
- ✅ Better identity preservation
- ✅ More accurate clothing replication
- ✅ Improved lighting consistency
- ✅ Better background preservation
- ✅ More natural compositions

## Troubleshooting

### Issue: All models failing with validation errors

**Symptom**: Logs show repeated validation failures across all Grok models

**Solutions**:
1. Check if Grok models are following the new format correctly
2. Temporarily disable specific validation rules if too strict
3. Fall back to legacy mode: `PROMPT_USE_RICH_STYLE=false`

### Issue: Prompts too short or too long

**Symptom**: Validation rejects prompts for length issues

**Solutions**:
1. Adjust `max_tokens` in `ai-prompt-generator.ts` (currently 350)
2. Modify validation thresholds in `validateSeedreamPrompt()`
3. Check Grok temperature settings (currently 0.5)

### Issue: Unwanted facial/hair descriptions appearing

**Symptom**: Validation catches forbidden descriptors

**Solutions**:
1. Enhance system prompt with more explicit rules
2. Add more forbidden terms to validation
3. Adjust temperature lower for more consistent compliance

### Issue: Poor image quality with rich prompts

**Symptom**: Seedream output worse than with legacy prompts

**Solutions**:
1. Review generated prompts in logs - are they accurate?
2. Adjust system prompt to emphasize different aspects
3. Test with different Grok models (order in `GROK_MODELS` array)
4. Consider if Seedream v4 API parameters need adjustment

## Rollback Procedure

If issues arise in production:

1. **Immediate**: Set environment variable
   ```bash
   PROMPT_USE_RICH_STYLE=false
   ```

2. **Deploy**: Redeploy with updated environment config

3. **Verify**: Check logs show `promptStyle: 'legacy-concise'`

4. **Monitor**: Confirm issue resolved

5. **Investigate**: Review logs from failed rich prompts

## Performance Considerations

### API Token Usage
- Legacy mode: ~50 tokens per prompt
- Rich mode: ~350 tokens per prompt
- **Increase**: ~7x token usage
- **Cost impact**: Monitor xAI API usage and costs

### Response Time
- Rich prompts take slightly longer to generate
- More tokens to process
- Monitor timeout thresholds (currently 25 minutes)

### Storage
- Longer prompts stored in database
- Ensure `generated_prompts` column can handle 2000+ characters
- Check database query performance with longer text fields

## Success Criteria

Rich prompts are considered successful when:

- ✅ Prompt generation success rate > 95%
- ✅ Validation pass rate > 90%
- ✅ Image quality rated equal or better than legacy
- ✅ No increase in user-reported issues
- ✅ Face identity preservation maintained or improved
- ✅ Background/scene fidelity improved
- ✅ No safety/content moderation issues

## Support and Feedback

When testing or deploying:

1. **Log everything**: Keep detailed logs for first 2 weeks
2. **Collect samples**: Save example prompts (good and bad)
3. **User feedback**: Gather qualitative feedback on image quality
4. **Metrics**: Track quantitative metrics (success rates, timing)
5. **Iterate**: Use findings to refine prompts and validation

## Related Documentation

- `NEW-SEEDREAM-PROMPT-SPEC.md` - Detailed specification and examples
- `CURRENT-PROMPT-ANALYSIS.md` - Analysis of legacy system
- `ai-studio/src/lib/ai-prompt-generator.ts` - Implementation code

