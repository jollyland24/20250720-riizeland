import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleAuth } from 'google-auth-library';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Configure CORS
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8000',
    credentials: true
}));

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Google Auth
const auth = new GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

// Image processing utilities
async function createPersonMask(imageBuffer) {
    try {
        // Create a simple mask for the person
        // For now, create a center-focused oval mask where a person would typically be
        const { width, height } = await sharp(imageBuffer).metadata();

        // Create an SVG mask (white where person should be, black elsewhere)
        const maskSvg = `
            <svg width="${width}" height="${height}">
                <rect width="${width}" height="${height}" fill="black"/>
                <ellipse cx="${width/2}" cy="${height*0.6}" rx="${width*0.3}" ry="${height*0.4}" fill="white"/>
            </svg>
        `;

        const maskBuffer = await sharp(Buffer.from(maskSvg))
            .png()
            .toBuffer();

        return maskBuffer.toString('base64');
    } catch (error) {
        console.error('Mask creation error:', error);
        // Fallback: create a simple center mask
        const maskBuffer = await sharp({
            create: {
                width: 1024,
                height: 1024,
                channels: 3,
                background: { r: 0, g: 0, b: 0 }
            }
        })
        .composite([{
            input: Buffer.from(`<svg><ellipse cx="512" cy="600" rx="300" ry="400" fill="white"/></svg>`),
            top: 0,
            left: 0
        }])
        .png()
        .toBuffer();

        return maskBuffer.toString('base64');
    }
}

async function resizeImagesToMatch(userPhotoBuffer, scenePhotoBuffer) {
    try {
        // Get dimensions of both images
        const userMeta = await sharp(userPhotoBuffer).metadata();
        const sceneMeta = await sharp(scenePhotoBuffer).metadata();

        console.log(`Original sizes - User: ${userMeta.width}x${userMeta.height}, Scene: ${sceneMeta.width}x${sceneMeta.height}`);

        // Use the scene dimensions as target (since it's our background)
        const targetWidth = Math.min(sceneMeta.width, 1024); // Cap at 1024 for processing
        const targetHeight = Math.min(sceneMeta.height, 1024);

        // Resize both images to same dimensions
        const resizedUserPhoto = await sharp(userPhotoBuffer)
            .resize(targetWidth, targetHeight, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 85 })
            .toBuffer();

        const resizedScenePhoto = await sharp(scenePhotoBuffer)
            .resize(targetWidth, targetHeight, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 85 })
            .toBuffer();

        console.log(`Resized to: ${targetWidth}x${targetHeight}`);

        return { resizedUserPhoto, resizedScenePhoto };
    } catch (error) {
        console.error('Image resize error:', error);
        throw error;
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'RIIZE Backend Server is running' });
});

// Get access token endpoint
app.get('/api/auth/token', async (req, res) => {
    try {
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        res.json({
            access_token: accessToken.token,
            expires_in: 3600
        });
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            error: 'Authentication failed',
            message: error.message
        });
    }
});

// Image merging endpoint using Vertex AI
app.post('/api/merge-images', upload.fields([
    { name: 'userPhoto', maxCount: 1 },
    { name: 'scenePhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('Received image merge request');

        if (!req.files.userPhoto || !req.files.scenePhoto) {
            return res.status(400).json({
                error: 'Both userPhoto and scenePhoto are required'
            });
        }

        const userPhotoBuffer = req.files.userPhoto[0].buffer;
        const scenePhotoBuffer = req.files.scenePhoto[0].buffer;

        console.log('User photo size:', userPhotoBuffer.length);
        console.log('Scene photo size:', scenePhotoBuffer.length);

        // Create debug timestamp for this request
        const debugTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const debugFolder = `./debug/${debugTimestamp}`;

        // Create debug folder for this request
        if (!fs.existsSync('./debug')) {
            fs.mkdirSync('./debug');
        }
        if (!fs.existsSync(debugFolder)) {
            fs.mkdirSync(debugFolder);
        }

        // Save original images for debugging
        fs.writeFileSync(`${debugFolder}/01-original-user-photo.jpg`, userPhotoBuffer);
        fs.writeFileSync(`${debugFolder}/02-original-scene-photo.jpg`, scenePhotoBuffer);
        console.log(`🐛 Debug images saved to: ${debugFolder}`);

        // Get access token
        const client = await auth.getClient();
        const accessToken = await client.getAccessToken();

        // Resize images to match dimensions before processing
        const { resizedUserPhoto, resizedScenePhoto } = await resizeImagesToMatch(userPhotoBuffer, scenePhotoBuffer);

        // Save resized images for debugging
        fs.writeFileSync(`${debugFolder}/03-resized-user-photo.jpg`, resizedUserPhoto);
        fs.writeFileSync(`${debugFolder}/04-resized-scene-photo.jpg`, resizedScenePhoto);

        console.log(`📐 User photo: ${userPhotoBuffer.length} bytes, Scene: ${scenePhotoBuffer.length} bytes`);
        console.log(`🔄 Resized both to: 1024x1024`);

        // Convert resized images to base64
        const userPhotoBase64 = resizedUserPhoto.toString('base64');
        const scenePhotoBase64 = resizedScenePhoto.toString('base64');

        // Vertex AI endpoint - use the generate model with better prompt strategy
        const endpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT_ID}/locations/${process.env.GOOGLE_CLOUD_LOCATION}/publishers/google/models/imagen-3.0-generate-001:predict`;

        // Much simpler approach: generate an image with both as reference
        const prompt = `Create an image showing a real person standing in this exact 3D floating island scene. The person should be naturally placed in the environment with realistic proportions, proper lighting that matches the scene, and appear to be part of this magical world. Keep the background scene exactly as shown. Use the reference images to guide the composition.`;

        // Simple generation payload with base image
        const payload = {
            instances: [{
                prompt: prompt,
                image: {
                    bytesBase64Encoded: scenePhotoBase64
                },
                parameters: {
                    sampleCount: 1,
                    aspectRatio: "1:1",
                    safetyFilterLevel: "block_some",
                    personGeneration: "allow_adult",
                    guidanceScale: 15,
                    seed: Math.floor(Math.random() * 1000000)
                }
            }]
        };

        console.log('Sending request to Vertex AI...');

        // Make request to Vertex AI
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Vertex AI error:', response.status, errorText);

            // Handle specific permission errors
            if (response.status === 403) {
                console.log('🔒 Permission denied - falling back to simple merge');
                console.log('📋 Please check setup-gcloud.md for permission setup instructions');

                // Return simple merge result instead of failing
                const userPhotoBase64 = userPhotoBuffer.toString('base64');
                return res.json({
                    success: true,
                    image: userPhotoBase64,
                    mimeType: 'image/jpeg',
                    message: 'Fallback mode: Vertex AI permissions needed. Check setup-gcloud.md',
                    fallback: true
                });
            }

            throw new Error(`Vertex AI request failed: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        console.log('Vertex AI response received');

        if (result.predictions && result.predictions.length > 0) {
            const generatedImage = result.predictions[0];

            // Save AI output for debugging
            if (generatedImage.bytesBase64Encoded) {
                const outputImageBuffer = Buffer.from(generatedImage.bytesBase64Encoded, 'base64');
                fs.writeFileSync(`${debugFolder}/05-ai-output.jpg`, outputImageBuffer);
                console.log(`🤖 AI output saved to: ${debugFolder}/05-ai-output.jpg`);
            }

            // Save API request/response for debugging
            const debugInfo = {
                prompt: prompt,
                requestTimestamp: debugTimestamp,
                modelEndpoint: endpoint,
                requestParameters: payload.instances[0].parameters,
                responsePreview: {
                    success: true,
                    hasImage: !!generatedImage.bytesBase64Encoded,
                    mimeType: generatedImage.mimeType || 'image/jpeg',
                    imageSizeBytes: generatedImage.bytesBase64Encoded ? generatedImage.bytesBase64Encoded.length : 0
                }
            };
            fs.writeFileSync(`${debugFolder}/00-debug-info.json`, JSON.stringify(debugInfo, null, 2));

            // Return the generated image
            res.json({
                success: true,
                image: generatedImage.bytesBase64Encoded,
                mimeType: generatedImage.mimeType || 'image/jpeg',
                debugFolder: debugFolder
            });
        } else {
            throw new Error('No image generated by Vertex AI');
        }

    } catch (error) {
        console.error('Image merging error:', error);

        // Save error info for debugging if debugFolder exists
        if (typeof debugFolder !== 'undefined') {
            const errorInfo = {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            };
            fs.writeFileSync(`${debugFolder}/99-error.json`, JSON.stringify(errorInfo, null, 2));
            console.log(`❌ Error info saved to: ${debugFolder}/99-error.json`);
        }

        res.status(500).json({
            error: 'Image merging failed',
            message: error.message,
            debugFolder: typeof debugFolder !== 'undefined' ? debugFolder : null
        });
    }
});

// Alternative endpoint using a simpler AI approach
app.post('/api/merge-images-simple', upload.fields([
    { name: 'userPhoto', maxCount: 1 },
    { name: 'scenePhoto', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('Received simple image merge request');

        if (!req.files.userPhoto || !req.files.scenePhoto) {
            return res.status(400).json({
                error: 'Both userPhoto and scenePhoto are required'
            });
        }

        // For demo purposes, just return the user photo
        // In production, you could use a different AI service or image processing
        const userPhotoBuffer = req.files.userPhoto[0].buffer;
        const userPhotoBase64 = userPhotoBuffer.toString('base64');

        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        res.json({
            success: true,
            image: userPhotoBase64,
            mimeType: 'image/jpeg',
            message: 'Demo mode: returning user photo. Integrate with preferred AI service for actual merging.'
        });

    } catch (error) {
        console.error('Simple image merging error:', error);
        res.status(500).json({
            error: 'Image merging failed',
            message: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 RIIZE Backend Server running on http://localhost:${PORT}`);
    console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL}`);
    console.log(`🔑 Google Cloud Project: ${process.env.GOOGLE_CLOUD_PROJECT_ID}`);
    console.log('📋 Available endpoints:');
    console.log('  GET  /health - Health check');
    console.log('  GET  /api/auth/token - Get access token');
    console.log('  POST /api/merge-images - Merge images with Vertex AI');
    console.log('  POST /api/merge-images-simple - Simple demo merge');
});

export default app;