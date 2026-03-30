require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { OpenAI } = require('openai'); // NVIDIA NIM uses OpenAI compatible client

const app = express();
app.use(cors());
app.use(express.json());

// NVIDIA LLM Client (DeepSeek / Gemini)
const nvidiaLLM = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

let projects = {};

// --- Helper: LLM se Workflow Text mangwana ---
async function generateWorkflowText(objectName) {
    const systemPrompt = `You are a cinematic director. Create a 4-clip restoration workflow for a [${objectName}]. 
    Format exactly like this:
    Clip-1 Title | Image Prompt | Video Prompt
    Clip-2 Title | Image Prompt | Video Prompt
    ...and so on. 
    Use a 'Restoration/Interior Build' concept where the ${objectName} turns into a cozy house.`;

    const completion = await nvidiaLLM.chat.completions.create({
        model: "deepseek-ai/deepseek-v3", // Ya Gemini jo aap select karein
        messages: [{ role: "user", content: systemPrompt }],
        temperature: 0.7,
    });

    return completion.choices[0].message.content;
}

// --- Helper: SD3 se Image mangwana ---
async function generateSD3Image(prompt) {
    try {
        const response = await axios.post(
            'https://integrate.api.nvidia.com/v1/models/stabilityai/stable-diffusion-3-medium',
            {
                payload: { prompt: prompt, mode: "text-to-image", aspect_ratio: "16:9" }
            },
            {
                headers: { 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}` }
            }
        );
        return response.data; 
    } catch (err) {
        console.error("SD3 Error");
        return null;
    }
}

// --- Main API: Create Project ---
app.post('/create-project', async (req, res) => {
    const { objectName } = req.body;
    const projectId = "proj_" + Date.now();

    projects[projectId] = { name: objectName, status: "Thinking...", data: [] };
    res.json({ success: true, projectId });

    // 1. Brain starts thinking
    const workflowText = await generateWorkflowText(objectName);
    projects[projectId].status = "Generating Images...";

    // 2. Split logic (Yahan aap regex ya split use karke prompts nikalenge)
    // Maan lijiye humne 4 steps nikaal liye:
    const mockSteps = [
        { title: "Clip 1: Discovery", imgPrompt: `Cinematic shot of a ${objectName} on soil...`, vidPrompt: "Camera pushes in..." },
        // ... baki 3 steps
    ];

    for (const step of mockSteps) {
        const imgUrl = await generateSD3Image(step.imgPrompt);
        projects[projectId].data.push({
            title: step.title,
            image: imgUrl,
            videoPrompt: step.vidPrompt
        });
    }

    projects[projectId].status = "Completed";
});

app.get('/project/:id', (req, res) => {
    res.json(projects[req.params.id] || { error: "Not found" });
});

app.listen(5000, () => console.log("AI Visualizer Backend Running!"));
