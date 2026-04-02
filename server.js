require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

let projects = {};

app.get('/health', (req, res) => res.json({
    status: "live", version: "3.0",
    routes: ["health", "create-project", "project/:id"]
}));

app.post('/create-project', async (req, res) => {
    const { objectName, ratio } = req.body;
    const projectId = "proj_" + Date.now();

    projects[projectId] = {
        name: objectName, status: "Thinking...",
        clips: [], finalShowcase: null, error: null
    };

    res.json({ success: true, projectId });

    try {
        const prompt = `You are a cinematic director. Create a 4-clip restoration workflow for [${objectName}].
        Return ONLY a valid JSON object with no extra text, no markdown, no backticks:
        { "clips": [ { "title": "...", "startPrompt": "...", "videoPrompt": "...", "endPrompt": "..." } ], "finalShowcase": "..." }`;

        const result = await geminiModel.generateContent(prompt);
        const rawText = result.response.text().trim();
        const cleanJson = rawText.replace(/\`\`\`json|\`\`\`/g, '').trim();
        const aiOutput = JSON.parse(cleanJson);

        projects[projectId].status = "Generating Images...";

        // FIX: Do NOT pass endImage of clip N as startImage of clip N+1 (heavy base64 duplication).
        // Clip 1 gets a startImage. All clips get their own endImage.
        // Frontend handles visual continuity note ("← End of Clip N-1") for clips 2-4.
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

async function generateImage(prompt, ratio) {
    if (!prompt) return null;

    const invokeUrl = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium";
    const aspect_ratio = ratio === "9:16" ? "9:16" : "16:9";

    const payload = {
        prompt: prompt,
        cfg_scale: 5,
        aspect_ratio: aspect_ratio,
        seed: 0,
        steps: 50,
        negative_prompt: ""
    };

    const headers = {
        "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
    };

    try {
        // 40 seconds ka timeout add kiya hai taaki request hang na ho
        const response = await axios.post(invokeUrl, payload, { headers, timeout: 40000 });

        if (response.status !== 200) {
            throw new Error(`NVIDIA returned status ${response.status}`);
        }

        // Robust parsing: Ye dono formats (direct image string ya artifacts array) ko handle karega
        const responseData = response.data;
        const base64str = responseData.image || 
                          (responseData.artifacts && responseData.artifacts[0] && (responseData.artifacts[0].base64 || responseData.artifacts[0].base64_image));

        if (base64str) {
            return `data:image/jpeg;base64,${base64str}`;
        }

        console.error("NVIDIA: Unexpected response format", JSON.stringify(responseData).substring(0, 200));
        return null;

    } catch (e) {
        console.error("NVIDIA Image Error:", e.response?.data || e.message);
        return null;
    }
}

app.get('/project/:id', (req, res) => {
    res.json(projects[req.params.id] || { error: "Not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend Active on port ${PORT}`));
