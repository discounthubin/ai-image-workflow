require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// NVIDIA NIM Text AI (DeepSeek)
const nvidiaClient = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
});

let projects = {};

// Self-ping to prevent Render free tier spin-down
const SELF_URL = 'https://ai-image-workflow-1.onrender.com';
setInterval(() => {
    axios.get(`${SELF_URL}/health`)
        .then(() => console.log('Self-ping OK ✅'))
        .catch((e) => console.log('Self-ping failed:', e.message));
}, 10 * 60 * 1000);

// Health Route (Frontend checks this before enabling button)
app.get('/health', (req, res) => res.json({ 
    status: "live", 
    version: "2.1 (NVIDIA Official Fetch)", 
    routes: ["health", "create-project", "project/:id"] 
}));

// Project Creation & Pipeline
app.post('/create-project', async (req, res) => {
    const { objectName, ratio } = req.body;
    const projectId = "proj_" + Date.now();

    // Initialize Project State
    projects[projectId] = { 
        name: objectName, 
        status: "Thinking...", 
        clips: [], 
        finalShowcase: null,
        error: null 
    };

    // Send Project ID to frontend immediately so it can start polling
    res.json({ success: true, projectId });

    try {
        const systemPrompt = `You are a cinematic director. Create a 4-clip restoration workflow for [${objectName}]. 
        Return ONLY a JSON object: { "clips": [ { "title": "...", "startPrompt": "...", "videoPrompt": "...", "endPrompt": "..." } ], "finalShowcase": "..." }`;

        // 1. Text Generation Phase
        const completion = await nvidiaClient.chat.completions.create({
            model: "deepseek-ai/deepseek-v3", // Ensure this model exists in your NVIDIA tier
            messages: [{ role: "user", content: systemPrompt }],
            response_format: { type: "json_object" }
        });

        const aiOutput = JSON.parse(completion.choices[0].message.content);
        projects[projectId].status = "Generating Images...";

        // 2. Image Generation Phase
        for (let i = 0; i < aiOutput.clips.length; i++) {
            const clip = aiOutput.clips[i];
            
            let startImg = null;
            let endImg = null;
            let clipError = null;

            try {
                // Generate Start Image (or use previous end image)
                if (i === 0) {
                    startImg = await generateImage(clip.startPrompt, ratio);
                } else {
                    startImg = projects[projectId].clips[i-1].endImage;
                }
                
                // Generate End Image
                endImg = await generateImage(clip.endPrompt, ratio);

            } catch (imgErr) {
                console.error(`[Clip ${i+1} Failed]:`, imgErr.message);
                clipError = imgErr.message; // Pass specific error to frontend
            }

            // Push to project array (Even if images failed, frontend will handle it beautifully)
            projects[projectId].clips.push({
                title: clip.title,
                startImage: startImg, 
                videoPrompt: clip.videoPrompt,
                endImage: endImg,
                error: clipError 
            });
        }

        projects[projectId].finalShowcase = aiOutput.finalShowcase;
        projects[projectId].status = "Completed";

    } catch (err) {
        console.error("[Pipeline Error]:", err);
        projects[projectId].status = "Failed";
        projects[projectId].error = `Pipeline Error: ${err.message}`;
    }
});

// Exact NVIDIA Fetch Logic integrated directly
async function generateImage(prompt, ratio) {
    if (!prompt) return null;
    
    // Format aspect ratio safely
    const apiRatio = (ratio === "9:16" || ratio === "1:1") ? ratio : "16:9";

    const invokeUrl = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium";
    
    const payload = {
        prompt: prompt,
        cfg_scale: 5,
        aspect_ratio: apiRatio,
        seed: 0,
        steps: 50,
        negative_prompt: ""
    };

    // Built-in Native Fetch (No need for node-fetch in Node 18+)
    const response = await fetch(invokeUrl, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
            "Authorization": `Bearer ${process.env.NVIDIA_API_KEY}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
    });

    if (!response.ok) {
        // Exact error extraction as per NVIDIA docs
        const errBody = await response.text();
        throw new Error(`NVIDIA HTTP ${response.status}: ${errBody}`);
    }

    const response_body = await response.json();

    // The API returns the base64 string inside the "image" key
    if (response_body.image) {
        return `data:image/jpeg;base64,${response_body.image}`;
    } 
    // Fallback just in case NVIDIA changes it back to artifacts array
    else if (response_body.artifacts && response_body.artifacts[0]) {
        return `data:image/jpeg;base64,${response_body.artifacts[0].base64 || response_body.artifacts[0].base64_image}`;
    }

    throw new Error("API succeeded but no image data was found in the response.");
}

// Project Polling Route
app.get('/project/:id', (req, res) => {
    const project = projects[req.params.id];
    if (!project) {
        return res.status(404).json({ error: "Project ID not found on server." });
    }
    res.json(project);
});

// Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend Active on Port ${PORT}`));
