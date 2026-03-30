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

// 1. Render Wake-up Endpoint
app.get('/health', (req, res) => {
    res.json({ status: "live", message: "Server is awake and ready! 🚀" });
});

// 2. Main Logic: Generate Workflow & Images
app.post('/create-project', async (req, res) => {
    const { objectName, ratio, clipCount = 4 } = req.body;
    const projectId = "proj_" + Date.now();

    projects[projectId] = { name: objectName, status: "Thinking...", clips: [], finalShowcase: null };
    res.json({ success: true, projectId });

    try {
        // STEP 1: DeepSeek/Gemini se Prompts banwana
        const systemPrompt = `You are a cinematic director. Create a ${clipCount}-clip restoration workflow for [${objectName}]. 
        STRICT RULES:
        - Clip-1: Start Image, Video Prompt, End Image.
        - Clip-2 to ${clipCount}: Refers to previous End Image, Video Prompt, New End Image.
        - Include a 'FINAL SHOWCASE MOTION' at the end.
        - Format everything in a clean JSON-like structure.`;

        const completion = await nvidiaClient.chat.completions.create({
            model: "deepseek-ai/deepseek-v3", // or google/gemini-2.0-flash
            messages: [{ role: "user", content: systemPrompt }],
            response_format: { type: "json_object" } // Optional if model supports
        });

        const aiOutput = JSON.parse(completion.choices[0].message.content);
        projects[projectId].status = "Generating Images...";

        // STEP 2: Loop through clips and generate images using SD3
        for (let i = 0; i < aiOutput.clips.length; i++) {
            const clip = aiOutput.clips[i];
            
            // Sirf End Image generate karni hai (continuity ke liye), Clip 1 mein Start bhi.
            let startImgData = (i === 0) ? await generateImage(clip.startPrompt, ratio) : projects[projectId].clips[i-1].endImage;
            let endImgData = await generateImage(clip.endPrompt, ratio);

            projects[projectId].clips.push({
                title: clip.title,
                startImage: startImgData,
                videoPrompt: clip.videoPrompt,
                endImage: endImgData
            });
        }

        projects[projectId].finalShowcase = aiOutput.finalShowcase;
        projects[projectId].status = "Completed";

    } catch (err) {
        console.error(err);
        projects[projectId].status = "Failed";
    }
});

// Helper: NVIDIA SD3 Image Generation
async function generateImage(prompt, ratio) {
    const aspect_ratio = ratio === "9:16" ? "9:16" : "16:9";
    try {
        const response = await axios.post(
            'https://integrate.api.nvidia.com/v1/models/stabilityai/stable-diffusion-3-medium',
            { payload: { prompt, mode: "text-to-image", aspect_ratio } },
            { headers: { 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}` } }
        );
        return response.data; 
    } catch (e) { return null; }
}

app.get('/project/:id', (req, res) => res.json(projects[req.params.id] || { error: "Not found" }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server live on ${PORT}`));
