# New Seedream v4 Prompt Specification

## Overview
This document defines the exact output format and rules for the new rich Seedream-style prompts that Grok will generate.

---

## Face-Swap Mode (with reference images)

### Output Format Template

```
Use the first [N-1] reference image(s) for [face structure | face structure and hair style]. Use reference image [N] as the complete reference for clothing, pose, action, scene composition, background environment, lighting setup, and overall atmosphere.

Subject details: [Detailed description of clothing - every garment, accessories, jewelry, shoes, specific details like patterns, textures, colors, cuts, styles]. [Exact pose description - standing/sitting/lying, body position, arm placement, leg position, hand gestures]. [Action and body language - what the person is doing, their gesture, body language, expression type like smiling/serious/laughing WITHOUT describing facial features].

The scene: [Location type and setting - indoor/outdoor, specific room type, venue, landscape]. The environment features [architectural elements, furniture, props, objects, background elements in detail]. The setting is [spatial relationships, room layout, depth, foreground/background elements].

Lighting: [Light source type and position, direction, quality (soft/hard), shadows, time of day, color temperature, lighting mood, highlights and contrast].

Camera: [Angle (eye-level/low/high), perspective, depth of field, focal point, composition rules, framing, distance from subject].

Atmosphere: [Overall mood, ambiance, weather if applicable, environmental effects like fog/rain/sunlight, emotional tone].

Colors and textures: [Dominant color palette throughout the scene, material properties, surface textures, fabric types, finish (matte/glossy), color harmony].

Technical quality: [Image resolution, sharpness, focus quality, professional photography terms, image clarity, detail level].
```

### CRITICAL RULES - Face Mode (`swapMode = 'face'`)

**DO describe:**
- Clothing in exhaustive detail (every garment, accessory, jewelry, shoes, patterns, textures, colors, cuts, styles)
- Exact pose (body position, limb placement, gestures)
- Action and body language
- Expression type (smiling, serious, laughing) WITHOUT facial feature details
- Complete scene, environment, background
- Lighting in technical detail
- Camera settings and composition
- Atmosphere and mood
- Colors, textures, materials throughout

**NEVER describe:**
- Hair color, hair style, hair length, hair texture
- Facial features (eyes, nose, mouth, face shape)
- Skin tone or skin color
- Ethnic features or ethnicity
- Age appearance beyond general category

**Reference image usage:**
- Reference images provide face structure ONLY
- Target image (last image) provides hair, clothing, pose, scene, everything else

### CRITICAL RULES - Face-Hair Mode (`swapMode = 'face-hair'`)

**DO describe:**
- Everything from Face Mode
- Hair can be described minimally if needed for context (e.g., "long flowing hair" as part of overall appearance)

**NEVER describe:**
- Facial features (eyes, nose, mouth, face shape)
- Skin tone or skin color
- Ethnic features or ethnicity
- Age appearance beyond general category

**Reference image usage:**
- Reference images provide face structure AND hair style
- Target image (last image) provides clothing, pose, scene, body, everything else

### Key Principles
1. **Image order matters**: Images 1 through N-1 are reference (source identity), Image N is target (scene template)
2. **Analyze target image deeply**: Most of the description comes from the target image
3. **Be specific, not generic**: "red silk evening gown with sequined bodice" not "nice dress"
4. **Technical but accessible**: Use photography terms but keep them understandable
5. **Complete scenes**: Every element visible should be mentioned
6. **No meta-commentary**: Output ONLY the prompt, no explanations or markdown

---

## Target-Only Mode (no reference images)

### Output Format Template

```
Subject details: [Detailed description of the person's clothing - every garment, accessories, jewelry, shoes, specific details like patterns, textures, colors, cuts, styles]. [Exact pose description - standing/sitting/lying, body position, arm placement, leg position, hand gestures]. [Action and body language - what the person is doing, their gesture, body language, expression evident in posture].

The scene: [Location type and setting - indoor/outdoor, specific room type, venue, landscape]. The environment features [architectural elements, furniture, props, objects, background elements in detail]. The setting is [spatial relationships, room layout, depth, foreground/background elements].

Lighting: [Light source type and position, direction, quality (soft/hard), shadows, time of day, color temperature, lighting mood, highlights and contrast].

Camera: [Angle (eye-level/low/high), perspective, depth of field, focal point, composition rules, framing, distance from subject].

Atmosphere: [Overall mood, ambiance, weather if applicable, environmental effects like fog/rain/sunlight, emotional tone].

Colors and textures: [Dominant color palette throughout the scene, material properties, surface textures, fabric types, finish (matte/glossy), color harmony].

Technical quality: [Image resolution, sharpness, focus quality, professional photography terms, image clarity, detail level]. Enhanced for optimal visual quality while maintaining the original composition and style.
```

### CRITICAL RULES - Target-Only

**DO:**
- Describe what's actually visible in the image
- Maintain the same level of detail as face-swap mode
- Focus on enhancement while preserving the scene
- Include all sections (subject, scene, lighting, camera, atmosphere, colors, quality)

**DON'T:**
- Invent new content not in the image
- Radically change the scene description
- Add elements that aren't present
- Make it about generating something new vs. enhancing what exists

**Goal**: Rich description of the existing image to guide enhancement, not creation

---

## Validation Requirements

### Required Sections (Face-Swap)
1. ✅ Reference usage statement (must mention "reference image")
2. ✅ Subject details (clothing, pose, action)
3. ✅ Scene description
4. ✅ Environment details
5. ✅ Lighting description
6. ✅ Camera details
7. ✅ Atmosphere
8. ✅ Colors and textures
9. ✅ Technical quality

### Required Sections (Target-Only)
1. ✅ Subject details (clothing, pose, action)
2. ✅ Scene description
3. ✅ Environment details
4. ✅ Lighting description
5. ✅ Camera details
6. ✅ Atmosphere
7. ✅ Colors and textures
8. ✅ Technical quality

### Forbidden Elements (All Modes)
- ❌ Markdown formatting (**, ##, ###, bullets, etc.)
- ❌ Meta-commentary ("Here's the prompt", "I've generated", "Note:")
- ❌ Image URLs or file paths
- ❌ Questions to the user
- ❌ Multiple distinct prompts or alternatives
- ❌ Explanatory text outside the prompt itself

### Forbidden Content (Face-Swap Modes)
- ❌ Facial feature descriptions (eyes, nose, mouth, face shape)
- ❌ Skin tone or color references
- ❌ Ethnic or racial descriptors
- ❌ Hair descriptions in face-only mode
- ❌ Age-specific descriptors beyond broad categories

### Safety Checks (All Modes)
- ❌ Explicit sexual content
- ❌ Nudity references
- ❌ Inappropriate or unsafe content

### Length Guidelines
- Minimum: ~150 tokens (roughly 120-150 words)
- Maximum: ~384 tokens (roughly 300-350 words)
- Target: ~200-250 tokens for optimal balance

---

## Examples

### Example 1: Face-Swap (face-hair mode)

```
Use the first reference image for face structure and hair style. Use reference image 2 as the complete reference for clothing, pose, action, scene composition, background environment, lighting setup, and overall atmosphere.

Subject details: Wearing a tailored navy blue business suit with a crisp white collared shirt underneath, silver cufflinks visible at the wrists, black leather oxford shoes polished to a shine, and a burgundy silk pocket square. Standing in a confident three-quarter pose with weight on the right leg, left hand in trouser pocket, right arm relaxed at side, head turned slightly toward camera. Displaying an approachable smile with relaxed shoulders suggesting professional confidence.

The scene: Modern corporate office interior with floor-to-ceiling windows. The environment features sleek glass desk with chrome legs, leather executive chair, abstract art on white walls, and polished marble flooring. The setting is spacious with natural depth, subject positioned in foreground with cityscape visible through windows in soft-focus background.

Lighting: Natural window light from camera left creates soft directional illumination, supplemented by warm overhead recessed lighting. Gentle shadows add dimension without harsh contrast. Golden hour quality suggests late afternoon, creating warm color temperature around 4500K. Highlights along suit fabric show texture.

Camera: Shot at eye level from approximately 8 feet distance, shallow depth of field with subject in sharp focus while background softly blurs. Composition follows rule of thirds with subject positioned slightly off-center. Medium shot framing from mid-thigh up. Professional portrait perspective.

Atmosphere: Professional yet approachable corporate environment. Calm, successful, confident mood. Clear sunny weather visible through windows creates optimistic tone. Sophisticated and polished ambiance.

Colors and textures: Dominant cool blues and grays from suit and office decor, balanced by warm wood tones and golden window light. Smooth wool suit fabric contrasts with crisp cotton shirt. Glass and chrome surfaces add reflective elements. Matte wall paint and glossy floor create texture variety. Harmonious professional color palette.

Technical quality: High-resolution professional photography, pin-sharp focus on subject, excellent detail retention, professionally color graded, commercial quality lighting and composition, crisp and clear throughout.
```

### Example 2: Target-Only Mode

```
Subject details: Wearing a flowing white cotton sundress with delicate floral embroidery along the neckline, thin adjustable straps, and a gathered waist that falls to mid-calf length, paired with woven straw sandals. Standing with slight hip tilt, left hand gently holding a wide-brimmed straw hat, right arm relaxed by side, weight shifted casually to one leg. Displaying serene contentment through relaxed posture and gentle demeanor.

The scene: Sunlit Mediterranean-style garden terrace overlooking coastal views. The environment features rustic terracotta tile flooring, weathered stone balustrade, potted lavender plants, climbing bougainvillea with vibrant pink blooms, and white-painted walls. The setting is open-air with clear depth from foreground terrace to distant azure sea horizon.

Lighting: Bright natural sunlight from overhead and slight right creates luminous, airy quality. Soft shadows beneath the balustrade and foliage. Midday Mediterranean sun with clear, neutral-to-warm color temperature around 5500K. Highlights on white dress create ethereal glow. Dappled light through bougainvillea adds visual interest.

Camera: Slightly elevated angle from about 10 feet distance, medium depth of field keeps subject and immediate surroundings sharp while distant sea softens. Composition balances subject right-of-center with coastal vista in background. Three-quarter length framing captures full dress and setting. Natural lifestyle photography perspective.

Atmosphere: Peaceful, vacation-inspired Mediterranean ambiance. Relaxed, carefree, summery mood. Bright sunshine and blue skies create joyful, leisurely tone. Romantic coastal setting with sophisticated simplicity.

Colors and textures: Crisp whites and creams dominate through dress and architecture, accented by vibrant pink bougainvillea and purple lavender. Deep azure blue sea and sky. Rough terracotta and weathered stone contrast with soft flowing fabric. Natural fiber textures in hat and sandals. Fresh, clean, summery color palette with warm undertones.

Technical quality: High-resolution professional photography, excellent sharpness and clarity, beautiful natural color rendition, well-exposed with retained highlight detail, professional composition and framing, enhanced for optimal visual quality while maintaining the original composition and style.
```

