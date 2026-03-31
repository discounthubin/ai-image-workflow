require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const nvidiaClient = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
});

let projects = {};

// Isko server.js mein update karo
app.get('/health', (req, res) => res.json({ 
    status: "live", 
    version: "2.0", 
    routes: ["health", "create-project", "project-status"] 
}));

app.post('/create-project', async (req, res) => {
    const { objectName, ratio } = req.body;
    const projectId = "proj_" + Date.now();

    projects[projectId] = { 
        name: objectName, 
        status: "Thinking...", 
        clips: [], 
        finalShowcase: null,
        error: null 
    };

    res.json({ success: true, projectId });

    try {
        const systemPrompt = `You are a cinematic director. Create a 4-clip restoration workflow for [${objectName}]. 
        Return ONLY a JSON object: { "clips": [ { "title": "...", "startPrompt": "...", "videoPrompt": "...", "endPrompt": "..." } ], "finalShowcase": "..." }`;

        const completion = await nvidiaClient.chat.completions.create({
            model: "deepseek-ai/deepseek-v3",
            messages: [{ role: "user", content: systemPrompt }],
            response_format: { type: "json_object" }
        });

        const aiOutput = JSON.parse(completion.choices[0].message.content);
        projects[projectId].status = "Generating Images...";

        for (let i = 0; i < aiOutput.clips.length; i++) {
            const clip = aiOutput.clips[i];
            
            // Image Generation with Exact NVIDIA Format
            let startImg = (i === 0) ? await generateImage(clip.startPrompt, ratio) : projects[projectId].clips[i-1].endImage;
            let endImg = await generateImage(clip.endPrompt, ratio);

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
        projects[projectId].status = "Failed";
        projects[projectId].error = err.message;
    }
});

async function generateImage(prompt, ratio) {
    if (!prompt) return null;
    const aspect_ratio = ratio === "9:16" ? "9:16" : "16:9";
    
    try {
        const response = await axios.post(
            'https://integrate.api.nvidia.com/v1/models/stabilityai/stable-diffusion-3-medium',
            {
                prompt: prompt,
                aspect_ratio: aspect_ratio,
                mode: "text-to-image"
            },
            { 
                headers: { 
                    'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
                    'Accept': 'application/json' 
                }
            }
        );

        // NVIDIA SD3 returns base64 in 'image' field
        if (response.data && response.data.image) {
            return `data:image/png;base64,${response.data.image}`;
        }
        return null;
    } catch (e) {
        console.error("NVIDIA Error:", e.response?.data || e.message);
        return null; 
    }
}

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { error: "Not found" }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend Active`));
