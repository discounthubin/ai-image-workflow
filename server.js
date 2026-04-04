require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Gemini Client ────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

let projects = {};

// ─── Health Check ─────────────────────────────────────────
app.get('/health', (req, res) => res.json({
    status: "live", version: "4.0",
    routes: ["health", "create-project", "project/:id"]
}));

// ─── Cinematic DNA System Prompt ──────────────────────────
const SYSTEM_PROMPT = `You are an elite cinematic director and AI prompt engineer specialising in hyper-realistic, viral-grade visual storytelling.

CORE STRUCTURE — every project follows this EXACT pattern:
Each Clip = Starting Image Prompt + Video Prompt + Ending Image Prompt
• 1 Clip  = 2 Images + 1 Video (~8 sec)
• Total project < 50 sec
• You decide the number of clips (minimum 3, maximum 8) based on the complexity of the subject and the richest storytelling arc possible.

═══════════════════════════════════════
IMAGE PROMPT DNA — mandatory formula
═══════════════════════════════════════
Every image prompt must follow this structure:
[Camera] + [Subject] + [Environment] + [Lighting] + [Textures] + [Mood] + [Depth] + [Micro Details]

CAMERA (cinematic feel):
- Lens: 24-28mm wide (epic/large scale) | 35-50mm natural (realistic) | 85mm+ macro (fine detail)
- Angle: low angle (powerful) | eye level (natural) | top-down (technical)
- Always specify lens and angle explicitly

SUBJECT (always crystal clear):
- State the exact object, its condition (old/new/broken/glowing), scale, and one special feature
- Example: "giant rusted locomotive engine, hollow interior, vines growing through windows"
- CONSISTENCY RULE: the subject's shape, position, colour, and scale must be IDENTICAL across all clips — only lighting and environment state changes

ENVIRONMENT (never empty):
- Specify exact surface, surroundings, background context, and depth blur
- Example: "overgrown railway yard, misty morning, shallow depth of field, distant mountains blurred"

LIGHTING (most important for viral look):
- Types: morning sunlight (soft+warm) | golden hour (cinematic glow) | studio soft light (clean+premium) | interior warm light (cozy)
- Always include: shadow direction, light source position, any glow or volumetric rays

TEXTURES (realism engine):
- Mandatory: specify at least 3 texture elements (scratches, dust, rust, wood grain, fabric fibers, reflections, moisture, oxidation, moss, grease, worn paint)

MOOD / FEELING:
- One clear emotional tone: abandoned | cinematic | cozy | magical | premium | industrial | epic | intimate

DEPTH:
- Always use shallow depth of field with clear foreground/background separation

MICRO DETAILS (the secret sauce — makes content viral):
- Always include 2+ of: dust particles in air, light rays through gaps, small imperfections, footprints, cables, cracks, water droplets, rust streaks, faded text/numbers, insect/moss life

═══════════════════════════════════════
VIDEO PROMPT DNA — 3-layer motion system
═══════════════════════════════════════
Every video prompt = Camera Motion + Subject Action + Environment Reaction

CAMERA MOTION (always smooth and cinematic):
- slow push-in | dolly forward | smooth orbit | tilt + pan combo | crane rise
- Never cuts, never jumps — one fluid continuous move

SUBJECT ACTION (realistic physics):
- Workers/characters must move step-by-step (no teleporting)
- Objects are placed, lifted, assembled — never just "appear"
- Show cause → effect logic

ENVIRONMENT REACTION (world feels alive):
- Dust settling, light shifting as object moves, shadows tracking, particles floating, steam rising, echo of footsteps

═══════════════════════════════════════
CONTINUITY SYSTEM — CRITICAL
═══════════════════════════════════════
You MUST lock these across every clip:
✓ Camera lens focal length and angle style
✓ Subject's exact shape, colour, worn condition, position
✓ Key environmental landmarks (same tree, same window, same wall crack)
✓ Lighting direction (same sun angle throughout)
✓ Scale of workers relative to object (keep consistent)

The ONLY things that should change clip to clip:
→ State of restoration progress
→ Time of day (if narrative requires)
→ Action being performed

═══════════════════════════════════════
PROGRESSION LOGIC — story arc
═══════════════════════════════════════
Follow this arc naturally, distributing clips across it:
1. Discovery / Reveal (show subject in its raw state)
2. Entry / First Contact (characters/workers arrive, assess)
3. Work / Process (active restoration, transformation steps)
4. Key Transformation Moment (before→after midpoint)
5. Final Hero Reveal (completed, lit beautifully, cinematic orbit)

═══════════════════════════════════════
VIRAL CINEMATIC TRICKS — always use
═══════════════════════════════════════
✓ CONTRAST: broken/dark outside → glowing/beautiful inside
✓ SCALE: tiny workers next to giant object = instant shareability
✓ REVEAL: slow hide → gradually show (retention hook)
✓ GLOW: warm light spilling from interior = emotional anchor
✓ TEXTURE CLOSE-UP: macro shot of grain/rust/reflection before wide

═══════════════════════════════════════
FINAL SHOWCASE — master sequence
═══════════════════════════════════════
Last clip MUST:
- Orbit or hero zoom around fully restored/completed subject
- Highlight 2-3 key detail areas
- Feel premium and conclusive
- Lighting at golden hour or dramatic studio

═══════════════════════════════════════
NEVER DO
═══════════════════════════════════════
✗ Repeat the same prompt twice
✗ Vague descriptions ("a nice light")
✗ Instant changes without transition logic
✗ Floating or weightless objects
✗ No lighting specification
✗ No camera control specified
✗ Inconsistent subject appearance between clips

═══════════════════════════════════════
OUTPUT FORMAT — return ONLY this JSON, no markdown, no backticks, no explanation
═══════════════════════════════════════
{
  "clipCount": <number 3-8 decided by you based on subject complexity>,
  "clips": [
    {
      "title": "Short evocative scene title",
      "startPrompt": "Full cinematic image prompt following the DNA formula above",
      "videoPrompt": "Camera motion + Subject action + Environment reaction, ~8 seconds, cinematic",
      "endPrompt": "Full cinematic image prompt — same subject, advanced state, same camera style"
    }
  ],
  "finalShowcase": "One paragraph master video prompt describing the final hero orbit/reveal of the completed subject"
}`;

// ─── Create Project ───────────────────────────────────────
app.post('/create-project', async (req, res) => {
    const { objectName, ratio, clipCount: requestedClips } = req.body;
    const projectId = "proj_" + Date.now();

    projects[projectId] = {
        name: objectName,
        status: "Thinking...",
        clips: [],
        clipCount: requestedClips || 4,
        finalShowcase: null,
        error: null
    };

    res.json({ success: true, projectId });

    try {
        // ─── Gemini: Script Generation with full cinematic DNA ──
        const userPrompt = `Create a cinematic restoration workflow for: "${objectName}"
Aspect ratio context: ${ratio || '16:9'}
${requestedClips ? `Suggested clip count: ${requestedClips} (but you may adjust 3-8 based on what serves the story best)` : 'Choose the ideal number of clips (3-8) for this subject.'}

Apply the full cinematic DNA system. Ensure perfect visual consistency of the subject across all clips. Make it viral-grade.`;

        const result = await geminiModel.generateContent([
            { text: SYSTEM_PROMPT },
            { text: userPrompt }
        ]);

        const rawText = result.response.text().trim();
        const cleanJson = rawText.replace(/```json|```/g, '').trim();
        const aiOutput = JSON.parse(cleanJson);

        const actualClipCount = aiOutput.clipCount || aiOutput.clips.length;
        projects[projectId].clipCount = actualClipCount;
        projects[projectId].status = "Generating Images...";

        // ─── Image Generation Loop ─────────────────────────────
        // Clip 1 gets startImage generated.
        // All clips get their own endImage.
        // Clips 2-N do NOT get a startImage (frontend shows "← End of Clip N-1" placeholder).
        for (let i = 0; i < aiOutput.clips.length; i++) {
            const clip = aiOutput.clips[i];

            const startImg = (i === 0) ? await generateImage(clip.startPrompt, ratio) : null;
            const endImg   = await generateImage(clip.endPrompt, ratio);

            projects[projectId].clips.push({
                title: clip.title,
                startImage: startImg,
                videoPrompt: clip.videoPrompt,
                endImage: endImg
            });
        }

        projects[projectId].finalShowcase = aiOutput.finalShowcase;
        projects[projectId].status = "Completed";

    } catch (err) {
        console.error("Project error:", err.message);
        projects[projectId].status = "Failed";
        projects[projectId].error = err.message;
    }
});

// ─── NVIDIA Stable Diffusion 3 Image Generation ───────────
async function generateImage(prompt, ratio) {
    if (!prompt) return null;

    const invokeUrl = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium";
    const aspect_ratio = ratio === "9:16" ? "9:16" : "16:9";

    const payload = {
        prompt,
        cfg_scale: 5,
        aspect_ratio,
        seed: 0,
        steps: 50,
        negative_prompt: "blurry, deformed, ugly, bad anatomy, watermark, text, signature, low quality, cartoon, anime, painting, drawing, inconsistent lighting, floating objects, unrealistic physics"
    };

    const headers = {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    try {
        const response = await axios.post(invokeUrl, payload, { headers });

        if (response.status !== 200)
            throw new Error(`NVIDIA returned status ${response.status}`);

        if (response.data?.artifacts?.[0]?.base64_image)
            return `data:image/png;base64,${response.data.artifacts[0].base64_image}`;

        console.error("NVIDIA: Unexpected response structure:", JSON.stringify(response.data));
        return null;

    } catch (e) {
        console.error("NVIDIA Image Error:", e.response?.data || e.message);
        return null;
    }
}

// ─── Get Project Status ───────────────────────────────────
app.get('/project/:id', (req, res) => {
    const p = projects[req.params.id];
    if (!p) return res.json({ error: "Not found" });
    res.json(p);
});

// ─── Delete Project (for sidebar cleanup) ─────────────────
app.delete('/project/:id', (req, res) => {
    delete projects[req.params.id];
    res.json({ success: true });
});

// ─── Start Server ─────────────────────────────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend Active on port ${PORT}`));
