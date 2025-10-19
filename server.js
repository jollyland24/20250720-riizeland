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

        // Gemini API uses API key authentication (no need for access token)

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

        // Gemini 2.5 Flash endpoint
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`;

        // Enhanced character-based image editing prompt with pixel aesthetic and interaction
        const prompt = `Create a pixelated 8-bit style character based on the person in the user photo, placed in this floating island scene. The character should:
        - Look like the person from the reference photo but in retro pixel art style (like classic video games)
        - Have chunky, blocky pixels and limited color palette for authentic 8-bit aesthetic
        - Be positioned ON or NEAR the floating islands, not just floating in empty sky
        - Appear to be exploring, jumping between, or landing on the island platforms
        - Be properly sized to interact with the island environment (not tiny, not huge)
        - Have clear pixel outlines and be reminiscent of classic platformer game characters
        The background floating islands should remain exactly as they are, but add the pixelated character actively engaging with this RIIZE landscape.`;

        // Gemini API payload format - include both user photo and scene
        const payload = {
            contents: [{
                parts: [
                    {
                        text: prompt
                    },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: userPhotoBase64
                        }
                    },
                    {
                        inline_data: {
                            mime_type: "image/jpeg",
                            data: scenePhotoBase64
                        }
                    }
                ]
            }],
            generation_config: {
                response_modalities: ["IMAGE"]
            }
        };

        console.log('Sending request to Gemini 2.5 Flash...');

        // Make request to Gemini API
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'x-goog-api-key': process.env.GEMINI_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', response.status, errorText);

            // Handle specific permission/API key errors
            if (response.status === 403 || response.status === 401) {
                console.log('🔒 API key issue - falling back to simple merge');
                console.log('📋 Please set your GEMINI_API_KEY in .env file');

                // Return simple merge result instead of failing
                const userPhotoBase64 = userPhotoBuffer.toString('base64');
                return res.json({
                    success: true,
                    image: userPhotoBase64,
                    mimeType: 'image/jpeg',
                    message: 'Fallback mode: Gemini API key needed. Set GEMINI_API_KEY in .env',
                    fallback: true
                });
            }

            // Handle quota exceeded errors
            if (response.status === 429) {
                console.log('⏱️ Quota exceeded - falling back to simple merge');
                console.log('📋 Please wait 30+ seconds or upgrade your Gemini API plan');

                // Return simple merge result instead of failing
                const userPhotoBase64 = userPhotoBuffer.toString('base64');
                return res.json({
                    success: true,
                    image: userPhotoBase64,
                    mimeType: 'image/jpeg',
                    message: 'Fallback mode: Gemini quota exceeded. Wait 30s or upgrade plan.',
                    fallback: true
                });
            }

            throw new Error(`Gemini API request failed: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        console.log('Gemini API response received');
        console.log('Response structure:', JSON.stringify(result, null, 2));

        if (result.candidates && result.candidates.length > 0) {
            const candidate = result.candidates[0];

            // Handle NO_IMAGE response
            if (candidate.finishReason === 'NO_IMAGE') {
                console.log('🚫 Gemini refused to generate image - falling back to user photo');
                console.log('📋 This might be due to safety filters or content policy');

                const userPhotoBase64 = userPhotoBuffer.toString('base64');
                return res.json({
                    success: true,
                    image: userPhotoBase64,
                    mimeType: 'image/jpeg',
                    message: 'Fallback mode: Gemini refused image generation (safety filters)',
                    fallback: true,
                    debugFolder: debugFolder
                });
            }

            const content = candidate.content;

            // Find the image part in the response
            let generatedImageData = null;
            if (content && content.parts) {
                console.log('Detailed parts inspection:');
                for (let i = 0; i < content.parts.length; i++) {
                    const part = content.parts[i];
                    console.log(`Part ${i}:`, {
                        hasInlineData: !!part.inline_data,
                        hasInlineDataCamel: !!part.inlineData,
                        mimeType: part.inline_data?.mime_type || part.inlineData?.mimeType,
                        hasData: !!(part.inline_data?.data || part.inlineData?.data),
                        dataLength: (part.inline_data?.data || part.inlineData?.data)?.length || 0,
                        partKeys: Object.keys(part)
                    });

                    // Check for inline_data with image mime type (snake_case)
                    if (part.inline_data && part.inline_data.mime_type && part.inline_data.mime_type.startsWith('image/')) {
                        generatedImageData = part.inline_data.data;
                        console.log('✅ Found image data via inline_data path (snake_case)');
                        break;
                    }
                    // Check for inlineData with image mime type (camelCase)
                    if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('image/')) {
                        generatedImageData = part.inlineData.data;
                        console.log('✅ Found image data via inlineData path (camelCase)');
                        break;
                    }
                    // Also check for direct data field (alternative format)
                    if (part.data) {
                        generatedImageData = part.data;
                        console.log('✅ Found image data via direct data path');
                        break;
                    }
                }
            }

            console.log('Image extraction debug:', {
                hasContent: !!content,
                partsCount: content?.parts?.length || 0,
                hasImageData: !!generatedImageData,
                imageDataLength: generatedImageData?.length || 0
            });

            if (generatedImageData) {
                // Save AI output for debugging
                const outputImageBuffer = Buffer.from(generatedImageData, 'base64');
                fs.writeFileSync(`${debugFolder}/05-ai-output.jpg`, outputImageBuffer);
                console.log(`🤖 AI output saved to: ${debugFolder}/05-ai-output.jpg`);

                // Save API request/response for debugging
                const debugInfo = {
                    prompt: prompt,
                    requestTimestamp: debugTimestamp,
                    modelEndpoint: endpoint,
                    apiModel: "gemini-2.5-flash-image",
                    responsePreview: {
                        success: true,
                        hasImage: !!generatedImageData,
                        mimeType: 'image/jpeg',
                        imageSizeBytes: generatedImageData.length
                    }
                };
                fs.writeFileSync(`${debugFolder}/00-debug-info.json`, JSON.stringify(debugInfo, null, 2));

                // Return the generated image
                res.json({
                    success: true,
                    image: generatedImageData,
                    mimeType: 'image/jpeg',
                    debugFolder: debugFolder
                });
            } else {
                throw new Error('No image found in Gemini API response');
            }
        } else {
            throw new Error('No candidates in Gemini API response');
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
    console.log('  GET  /api/auth/token - Get access token (legacy)');
    console.log('  POST /api/merge-images - Merge images with Gemini 2.5 Flash');
    console.log('  POST /api/merge-images-simple - Simple demo merge');
});

export default app;