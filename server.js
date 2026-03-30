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

// 1. Health Check (Server Jagane ke liye)
app.get('/health', (req, res) => res.json({ status: "live" }));

// 2. Main Generation Route
app.post('/create-project', async (req, res) => {
    const { objectName, ratio } = req.body;
    const projectId = "proj_" + Date.now();

    // Initial State
    projects[projectId] = { 
        name: objectName, 
        status: "Thinking...", 
        clips: [], 
        finalShowcase: null,
        error: null 
    };

    // Turant Response bhej do (Taaki Render timeout na kare)
    res.json({ success: true, projectId });

    // --- Background Processing Shuru ---
    try {
        console.log(`Starting project for: ${objectName}`);

        // STEP 1: DeepSeek se Prompts mangwana
        const systemPrompt = `You are a cinematic director. Create a 4-clip restoration workflow for [${objectName}]. 
        Return ONLY a JSON object with this structure: 
        { "clips": [ { "title": "...", "startPrompt": "...", "videoPrompt": "...", "endPrompt": "..." } ], "finalShowcase": "..." }
        Clip-1 must have startPrompt. Clips 2-4 use previous endPrompt.`;

        const completion = await nvidiaClient.chat.completions.create({
            model: "deepseek-ai/deepseek-v3",
            messages: [{ role: "user", content: systemPrompt }],
            response_format: { type: "json_object" }
        });

        const aiOutput = JSON.parse(completion.choices[0].message.content);
        projects[projectId].status = "Generating Images...";

        // STEP 2: Image Generation Loop
        for (let i = 0; i < aiOutput.clips.length; i++) {
            const clip = aiOutput.clips[i];
            console.log(`Generating images for Clip ${i+1}...`);

            // Start Image (Sirf Clip 1 ke liye)
            let startImg = (i === 0) ? await generateImage(clip.startPrompt, ratio) : projects[projectId].clips[i-1].endImage;
            
            // End Image
            let endImg = await generateImage(clip.endPrompt, ratio);

            projects[projectId].clips.push({
                title: clip.title,
                startImage: startImg || "Image Failed", 
                videoPrompt: clip.videoPrompt,
                endImage: endImg || "Image Failed"
            });
        }

        projects[projectId].finalShowcase = aiOutput.finalShowcase;
        projects[projectId].status = "Completed";

    } catch (err) {
        console.error("Pipeline Error:", err.message);
        projects[projectId].status = "Failed";
        projects[projectId].error = err.message;
    }
});

// Helper Function for NVIDIA SD3
async function generateImage(prompt, ratio) {
    if (!prompt) return null;
    const aspect_ratio = ratio === "9:16" ? "9:16" : "16:9";
    
    try {
        const response = await axios.post(
            'https://integrate.api.nvidia.com/v1/models/stabilityai/stable-diffusion-3-medium',
            { payload: { prompt, mode: "text-to-image", aspect_ratio } },
            { 
                headers: { 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}` },
                timeout: 60000 // 60 seconds wait for NVIDIA
            }
        );
        return response.data; 
    } catch (e) {
        console.log("SD3 API failed for a frame, skipping...");
        return null; 
    }
}

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { error: "Not found" }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend Active on ${PORT}`));
