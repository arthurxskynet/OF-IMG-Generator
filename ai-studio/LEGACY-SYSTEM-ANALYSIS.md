# Legacy Prompt System Analysis

*This document analyzes the original prompt generation system for reference purposes.*

## Legacy Face-Swap Mode

### System Prompt
Single-sentence template enforcing exact format:
- "Swap [only the face | face and hair] from first image of [description] onto second image of [description]"
- Required 2-5 word descriptors
- Very rigid structure

### Request Parameters
- `max_tokens`: 50 (very restrictive)
- `temperature`: 0.1 (low for consistency)
- `top_p`: 0.9
- `frequency_penalty`: 0.5 / 0.1
- `presence_penalty`: 0.3 / 0.1

### Validation Rules
1. **Camera jargon ban**: Rejected lens, mm, f/, ISO, bokeh, aperture, etc.
2. **Single sentence only**: Max 1 sentence terminator, no line breaks
3. **Word count**: Under 50 words
4. **Required format**: Must contain "first image of" and "second image of"
5. **Descriptor validation**: 1-6 words per descriptor
6. **SwapMode validation**: Enforced mode-specific phrases
7. **Safety check**: Blocked explicit content keywords

## Legacy Target-Only Mode

### System Prompt
Simple enhancement focus:
- One sentence format
- General improvements (lighting, clarity, composition, style)
- No technical terms
- Example-based instruction

### Request Parameters
- `max_tokens`: 100 (slightly more than face-swap)
- `temperature`: 0.7 (higher for creativity)

### Validation
Minimal - only checked for non-empty response

## Limitations of Legacy System

1. **Insufficient detail** for complex scenes
2. **No scene context** beyond swap instruction
3. **Banned technical terms** that Seedream needs
4. **Single sentence constraint** too restrictive
5. **Minimal descriptors** (2-5 words)
6. **No comprehensive scene description**

## Why Rich Prompts Were Needed

The reference prompt example showed that Seedream v4 benefits from:
- Detailed clothing descriptions
- Specific pose and action details
- Complete environment descriptions
- Technical lighting information
- Camera settings and composition
- Atmosphere and mood details
- Color palette and texture information
- Professional photography terminology

The legacy system couldn't provide this level of detail within its constraints.

