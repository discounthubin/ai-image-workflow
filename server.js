require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Temporary Storage (Render par restart hone par ye khali ho jayega, par testing ke liye best hai)
let projects = {};

// NVIDIA API Call Function
async function generateSD3Image(prompt) {
    try {
        const response = await axios.post(
            'https://integrate.api.nvidia.com/v1/models/stabilityai/stable-diffusion-3-medium',
            {
                payload: {
                    prompt: prompt,
                    cfg_scale: 7,
                    aspect_ratio: "16:9",
                    mode: "text-to-image"
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );
        return response.data; // Isme image ka URL ya Base64 hoga
    } catch (error) {
        console.error("NVIDIA API Error:", error.message);
        return null;
    }
}

// 1. Create Project & Start Workflow
app.post('/create-project', async (req, res) => {
    const { projectName, workflowSteps } = req.body;
    const projectId = "proj_" + Date.now();

    // Initial project state
    projects[projectId] = {
        name: projectName,
        status: "Processing",
        data: []
    };

    res.json({ success: true, projectId });

    // Background Processing
    for (const step of workflowSteps) {
        console.log(`Generating: ${step.title}`);
        const imageResult = await generateSD3Image(step.imagePrompt);
        
        projects[projectId].data.push({
            title: step.title,
            image: imageResult,
            videoPrompt: step.videoPrompt
        });
    }
    projects[projectId].status = "Completed";
});

// 2. Get Project Results
app.get('/project/:id', (req, res) => {
    const project = projects[req.params.id];
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json(project);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));
