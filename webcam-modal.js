// webcam-modal.js - Complete version with jiggling brush animation and warm orange colors
export class WebcamModal {
    constructor() {
        this.modal = document.getElementById('webcam-modal');
        this.video = document.getElementById('webcam-video');
        this.canvas = document.getElementById('hand-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.videoContainer = document.getElementById('video-container');
        this.statusMessage = document.getElementById('status-message');
        this.startBtn = document.getElementById('start-camera');
        this.stopBtn = document.getElementById('stop-camera');
        this.closeBtn = document.getElementById('close-modal');
        this.openBtn = document.querySelector('.gesture-activate');
        
        this.stream = null;
        this.hands = null;
        this.landmarks = null;
        this.isProcessing = false;
        this.animationId = null;
        this.currentGesture = 'none';
        
        // Drawing variables
        this.isDrawing = false;
        this.lastDrawPoint = null;
        this.permanentLines = [];
        this.currentStrokeColor = null; // Store the picked color for current stroke
        
        // Animation variables for jiggle effect
        this.jiggleIntensity = 2; // How much the strokes jiggle
        this.jiggleSpeed = 0.05; // How fast they jiggle
        this.animationTime = 0;
        this.lastJiggleUpdate = 0;
        this.lineAnimations = new Map(); // Store animation data per line
        
        this.initMediaPipe();
        this.initEventListeners();
    }
    
    initMediaPipe() {
        try {
            if (typeof Hands === 'undefined') {
                console.log('MediaPipe Hands not loaded - using basic camera mode');
                return;
            }
            
            this.hands = new Hands({
                locateFile: (file) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
                }
            });
            
            this.hands.setOptions({
                maxNumHands: 1,
                modelComplexity: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.5
            });
            
            this.hands.onResults((results) => this.onHandResults(results));
            console.log('MediaPipe Hands ready!');
            
        } catch (error) {
            console.error('MediaPipe failed:', error);
        }
    }
    
    initEventListeners() {
        this.openBtn.addEventListener('click', () => this.openModal());
        this.closeBtn.addEventListener('click', () => this.closeModal());
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.closeModal();
        });
        
        this.startBtn.addEventListener('click', () => this.startCamera());
        this.stopBtn.addEventListener('click', () => this.stopCamera());
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.closeModal();
            }
            if (e.key.toLowerCase() === 'c' && this.modal.style.display === 'flex') {
                this.clearDrawing();
            }
        });
        
        window.addEventListener('resize', () => this.updateCanvasSize());
    }
    
    openModal() {
        this.modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
    
    closeModal() {
        this.modal.style.display = 'none';
        document.body.style.overflow = '';
        this.stopCamera();
    }
    
    async startCamera() {
        try {
            this.updateStatus('Starting camera...', 'loading');
            
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            });
            
            this.video.srcObject = this.stream;
            
            await new Promise((resolve) => {
                this.video.addEventListener('loadeddata', resolve, { once: true });
            });
            
            // Show video container first
            this.videoContainer.classList.remove('hidden');
            
            // Wait for video to be fully rendered
            setTimeout(() => {
                this.setupCanvas();
                
                // Wait a bit more before starting hand detection
                setTimeout(() => {
                    this.startHandDetection();
                    this.updateStatus('Point index finger in ANY direction to draw. Press C to clear.', 'success');
                    this.startBtn.classList.add('hidden');
                    this.stopBtn.classList.remove('hidden');
                }, 200);
            }, 300);
            
        } catch (error) {
            console.error('Camera error:', error);
            this.updateStatus('Camera access denied or not available', 'error');
        }
    }
    
    setupCanvas() {
        // Wait a bit more for video to be fully rendered
        setTimeout(() => {
            const videoRect = this.video.getBoundingClientRect();
            
            // Make sure we have valid dimensions
            if (videoRect.width === 0 || videoRect.height === 0) {
                console.log('Video not ready, retrying canvas setup...');
                this.setupCanvas(); // Retry
                return;
            }
            
            // Set canvas size to match video display size
            this.canvas.width = videoRect.width;
            this.canvas.height = videoRect.height;
            
            // Position canvas exactly over video
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            
            console.log('Canvas setup completed:', {
                canvasWidth: this.canvas.width,
                canvasHeight: this.canvas.height,
                videoDisplayWidth: videoRect.width,
                videoDisplayHeight: videoRect.height
            });
        }, 100);
    }
    
    // Add this new method
    forceCanvasResize() {
        if (this.video && this.canvas && this.stream) {
            const videoRect = this.video.getBoundingClientRect();
            
            if (videoRect.width > 0 && videoRect.height > 0) {
                this.canvas.width = videoRect.width;
                this.canvas.height = videoRect.height;
                console.log('Canvas force resized:', videoRect.width, 'x', videoRect.height);
            }
        }
    }
    
    updateCanvasSize() {
        this.forceCanvasResize();
    }
    
    startHandDetection() {
        if (!this.hands) {
            this.updateStatus('Camera ready - Hand tracking not available', 'success');
            return;
        }
        
        const processFrame = async () => {
            if (this.video.videoWidth > 0 && !this.isProcessing && this.stream) {
                this.isProcessing = true;
                
                try {
                    await this.hands.send({ image: this.video });
                } catch (error) {
                    console.error('Detection error:', error);
                }
                
                this.isProcessing = false;
            }
            
            if (this.stream) {
                this.animationId = requestAnimationFrame(processFrame);
            }
        };
        
        processFrame();
    }
    
    onHandResults(results) {
        // Safety check - ensure canvas is properly sized
        if (this.canvas.width === 0 || this.canvas.height === 0) {
            this.forceCanvasResize();
            return;
        }
        
        // Clear canvas completely
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Redraw all lines with animation
        this.redrawAllLines();
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            this.ctx.save();
            this.ctx.scale(-1, 1);
            this.ctx.translate(-this.canvas.width, 0);
            
            const landmarks = results.multiHandLandmarks[0];
            
            // Detect gesture with more forgiving detection
            const gesture = this.detectGesture(landmarks);
            this.currentGesture = gesture;
            
            // Handle drawing for any pointing direction
            this.handleDrawing(landmarks, gesture);
            
            // Show cursor when pointing in any direction
            if (gesture.includes('index_pointing')) {
                this.drawFingerCursor(landmarks[8]);
            }
            
            // Update status with more encouraging feedback
            let statusText = '';
            if (this.isDrawing) {
                const direction = gesture.replace('index_pointing_', '').toUpperCase();
                statusText = `🎨 Drawing - Pointing ${direction}`;
            } else if (gesture.includes('index_pointing')) {
                const direction = gesture.replace('index_pointing_', '').toUpperCase();
                statusText = `👆 Ready to draw - Pointing ${direction}`;
            } else if (gesture.includes('index_rough')) {
                statusText = '👆 Almost there - Point index finger more clearly';
            } else {
                statusText = 'Point index finger in any direction to draw';
            }
            this.updateStatus(statusText, 'success');
            
            this.ctx.restore();
        } else {
            // No hand detected - stop drawing
            if (this.isDrawing) {
                this.isDrawing = false;
                this.lastDrawPoint = null;
            }
        }
    }
    
    // Enhanced finger cursor with warm orange colors
    drawFingerCursor(indexTip) {
        const time = Date.now() * 0.01;
        
        // Main pulsing dot
        const pulse = 5 + Math.sin(time * 0.3) * 3;
        this.ctx.fillStyle = '#FFB07A'; // Warm peach color
        this.ctx.globalAlpha = 0.8;
        this.ctx.beginPath();
        this.ctx.arc(
            indexTip.x * this.canvas.width,
            indexTip.y * this.canvas.height,
            pulse,
            0,
            2 * Math.PI
        );
        this.ctx.fill();
        
        // Outer ring animation
        const ringPulse = 12 + Math.sin(time * 0.2) * 4;
        this.ctx.strokeStyle = '#FF8C42'; // Slightly darker orange
        this.ctx.lineWidth = 2;
        this.ctx.globalAlpha = 0.4;
        this.ctx.beginPath();
        this.ctx.arc(
            indexTip.x * this.canvas.width,
            indexTip.y * this.canvas.height,
            ringPulse,
            0,
            2 * Math.PI
        );
        this.ctx.stroke();
        
        // Sparkle effects around cursor
        for (let i = 0; i < 3; i++) {
            const sparkleAngle = time * 0.1 + i * (Math.PI * 2 / 3);
            const sparkleRadius = 15 + Math.sin(time * 0.4 + i) * 5;
            const sparkleX = indexTip.x * this.canvas.width + Math.cos(sparkleAngle) * sparkleRadius;
            const sparkleY = indexTip.y * this.canvas.height + Math.sin(sparkleAngle) * sparkleRadius;
            
            this.ctx.fillStyle = '#FFCC99'; // Light peach for sparkles
            this.ctx.globalAlpha = 0.6;
            this.ctx.beginPath();
            this.ctx.arc(sparkleX, sparkleY, 2, 0, 2 * Math.PI);
            this.ctx.fill();
        }
        
        this.ctx.globalAlpha = 1.0;
    }
    
    handleDrawing(landmarks, gesture) {
        const indexTip = landmarks[8];
        const currentPoint = {
            x: indexTip.x * this.canvas.width,
            y: indexTip.y * this.canvas.height
        };
        
        // Now draw for any index pointing gesture (more forgiving)
        if (gesture.includes('index_pointing')) {
            if (!this.isDrawing) {
                // Start drawing - pick color from background at finger position
                this.isDrawing = true;
                this.lastDrawPoint = currentPoint;
                this.currentStrokeColor = this.sampleColorFromBackground(currentPoint);
                console.log('Drawing started - index pointing detected! Color sampled:', this.currentStrokeColor);
            } else {
                // Continue drawing
                if (this.lastDrawPoint) {
                    const distance = this.distance2D(currentPoint, this.lastDrawPoint);
                    
                    // Only draw if finger moved enough (smoother lines)
                    if (distance > 2) {
                        const line = {
                            from: { ...this.lastDrawPoint },
                            to: { ...currentPoint },
                            id: `line_${Date.now()}_${Math.random()}`, // Unique ID for each line
                            age: 0, // How long this line has existed
                            baseWidth: 30 + Math.random() * 10, // Varied line width
                            opacity: 1.0, // Full opacity - no transparency
                            color: this.currentStrokeColor // Use the sampled color
                        };
                        
                        this.permanentLines.push(line);
                        
                        // Initialize animation data for this line
                        this.lineAnimations.set(line.id, {
                            jigglePhase: Math.random() * Math.PI * 2, // Random starting phase
                            jiggleAmplitude: 0.5 + Math.random() * 1.5, // Individual jiggle amount
                            pulsePhase: Math.random() * Math.PI * 2,
                            birthTime: Date.now()
                        });
                        
                        this.lastDrawPoint = currentPoint;
                    }
                }
            }
        } else {
            // Not pointing - stop drawing
            if (this.isDrawing) {
                this.isDrawing = false;
                this.lastDrawPoint = null;
                this.currentStrokeColor = null; // Reset color
                console.log('Drawing stopped - not pointing');
            }
        }
    }
    
    redrawAllLines() {
        if (this.permanentLines.length === 0) return;
        
        const now = Date.now();
        this.animationTime = now * 0.001; // Convert to seconds
        
        this.ctx.save();
        this.ctx.scale(-1, 1);
        this.ctx.translate(-this.canvas.width, 0);
        
        // Draw each line with individual jiggle animation
        this.permanentLines.forEach((line, index) => {
            const animData = this.lineAnimations.get(line.id);
            if (!animData) return;
            
            // Calculate age-based effects
            const age = (now - animData.birthTime) * 0.001; // Age in seconds
            const fadeFactor = Math.min(1, age * 2); // Fade in over 0.5 seconds
            const settleFactor = Math.max(0.3, 1 - age * 0.1); // Reduce jiggle over time
            
            // Calculate jiggle offset for this line
            const jigglePhase = animData.jigglePhase + this.animationTime * this.jiggleSpeed * (2 + index * 0.1);
            const jiggleX = Math.sin(jigglePhase) * this.jiggleIntensity * animData.jiggleAmplitude * settleFactor;
            const jiggleY = Math.cos(jigglePhase * 1.3) * this.jiggleIntensity * animData.jiggleAmplitude * settleFactor;
            
            // Calculate pulse effect for line width
            const pulsePhase = animData.pulsePhase + this.animationTime * 3;
            const pulseFactor = 1 + Math.sin(pulsePhase) * 0.2 * settleFactor;
            
            // Apply jiggle and pulse effects
            const fromX = line.from.x + jiggleX;
            const fromY = line.from.y + jiggleY;
            const toX = line.to.x + jiggleX + Math.sin(jigglePhase + 0.5) * this.jiggleIntensity * 0.5;
            const toY = line.to.y + jiggleY + Math.cos(jigglePhase + 0.5) * this.jiggleIntensity * 0.5;
            
            // Set drawing style with animation
            this.ctx.strokeStyle = line.color || this.getAnimatedColor(age, animData);
            this.ctx.lineWidth = line.baseWidth * pulseFactor;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.globalAlpha = 1.0; // Always full opacity
            
            // Add some randomness to make it more organic
            if (Math.random() < 0.1) {
                this.ctx.shadowColor = line.color || '#FFB07A'; // Use line color or fallback
                this.ctx.shadowBlur = 5 + Math.sin(this.animationTime * 4) * 3;
            } else {
                this.ctx.shadowBlur = 0;
            }
            
            // Draw the animated line
            this.ctx.beginPath();
            this.ctx.moveTo(fromX, fromY);
            this.ctx.lineTo(toX, toY);
            this.ctx.stroke();
        });
        
        this.ctx.globalAlpha = 1.0;
        this.ctx.shadowBlur = 0;
        this.ctx.restore();
    }
    
    sampleColorFromBackground(point) {
        try {
            // Create a temporary canvas to sample from the video
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d');
            
            // Set canvas size to match video
            tempCanvas.width = this.video.videoWidth;
            tempCanvas.height = this.video.videoHeight;
            
            // Draw the current video frame (flipped to match the display)
            tempCtx.scale(-1, 1);
            tempCtx.translate(-tempCanvas.width, 0);
            tempCtx.drawImage(this.video, 0, 0);
            
            // Convert screen coordinates to video coordinates
            const scaleX = this.video.videoWidth / this.canvas.width;
            const scaleY = this.video.videoHeight / this.canvas.height;
            
            const videoX = Math.floor(point.x * scaleX);
            const videoY = Math.floor(point.y * scaleY);
            
            // Sample pixel color
            const imageData = tempCtx.getImageData(videoX, videoY, 1, 1);
            const [r, g, b, a] = imageData.data;
            
            // Return CSS color string
            const color = `rgb(${r}, ${g}, ${b})`;
            console.log(`Sampled color at (${videoX}, ${videoY}):`, color);
            
            return color;
        } catch (error) {
            console.error('Error sampling color:', error);
            // Fallback to warm orange if sampling fails
            return '#FFB07A';
        }
    }

    getAnimatedColor(age, animData) {
        // Warm orange/peach colors to match the floating island
        const colorPhase = animData.pulsePhase + this.animationTime * 2;
        const brightness = Math.min(1, 0.8 + Math.sin(colorPhase) * 0.2);
        
        // Warm peach/orange RGB components (similar to #FFB07A - light salmon)
        let r = Math.floor(255 * brightness);
        let g = Math.floor(176 * brightness);
        let b = Math.floor(122 * brightness);
        
        // Subtle color variation for newer strokes to keep them lively
        if (age < 1) {
            const variation = Math.sin(this.animationTime * 3 + animData.jigglePhase) * 15;
            // Add more warmth variation
            r = Math.min(255, Math.max(0, r + variation * 0.2));
            g = Math.min(255, Math.max(0, g + variation * 0.3));
            b = Math.min(255, Math.max(0, b + variation * 0.4));
        }
        
        return `rgb(${r}, ${g}, ${b})`;
    }
    
    distance2D(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    clearDrawing() {
        this.permanentLines = [];
        this.lineAnimations.clear(); // Clear animation data too
        this.isDrawing = false;
        this.lastDrawPoint = null;
        this.currentStrokeColor = null; // Reset current stroke color
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        console.log('🧹 Drawing cleared!');
    }
    
    // More forgiving gesture detection
    detectGesture(landmarks) {
        const fingerTips = [4, 8, 12, 16, 20];
        const fingerPips = [3, 6, 10, 14, 18];
        const fingerMcps = [2, 5, 9, 13, 17];
        
        const extendedFingers = this.getExtendedFingers(landmarks, fingerTips, fingerPips, fingerMcps);
        
        // More forgiving index finger detection
        if (this.isIndexPointingUpForgiving(landmarks, extendedFingers)) {
            return 'index_pointing_up';
        } else if (this.isIndexPointingRightForgiving(landmarks, extendedFingers)) {
            return 'index_pointing_right';
        } else if (this.isIndexPointingLeftForgiving(landmarks, extendedFingers)) {
            return 'index_pointing_left';
        } else if (this.isIndexPointingDownForgiving(landmarks, extendedFingers)) {
            return 'index_pointing_down';
        } else if (this.isIndexRoughlyPointing(landmarks, extendedFingers)) {
            return 'index_rough_pointing';
        }
        
        return 'not_pointing';
    }
    
    getExtendedFingers(landmarks, fingerTips, fingerPips, fingerMcps) {
        const extendedFingers = [];
        
        // Check thumb
        const thumbTip = landmarks[4];
        const thumbIp = landmarks[3];
        const thumbMcp = landmarks[2];
        const indexMcp = landmarks[5];
        
        const distThumbTipToWrist = this.distance(thumbTip, landmarks[0]);
        const distThumbIpToWrist = this.distance(thumbIp, landmarks[0]);
        const distThumbTipToIndex = this.distance(thumbTip, indexMcp);
        const distThumbIpToIndex = this.distance(thumbIp, indexMcp);
        
        if (distThumbTipToWrist > distThumbIpToWrist && distThumbTipToIndex > distThumbIpToIndex) {
            const thumbDirection = Math.atan2(thumbTip.y - thumbMcp.y, thumbTip.x - thumbMcp.x);
            const palmDirection = Math.atan2(indexMcp.y - landmarks[0].y, indexMcp.x - landmarks[0].x);
            const angleDiff = Math.abs(thumbDirection - palmDirection);
            
            if (angleDiff > Math.PI / 4) {
                extendedFingers.push('thumb');
            }
        }
        
        // Check other fingers
        const fingerNames = ['index', 'middle', 'ring', 'pinky'];
        for (let i = 1; i < fingerTips.length; i++) {
            const tip = landmarks[fingerTips[i]];
            const pip = landmarks[fingerPips[i]];
            const mcp = landmarks[fingerMcps[i]];
            
            if (tip.y < pip.y && tip.y < mcp.y) {
                extendedFingers.push(fingerNames[i-1]);
            }
        }
        
        return extendedFingers;
    }
    
    // More forgiving detection methods
    isIndexPointingUpForgiving(landmarks, extendedFingers) {
        if (!extendedFingers.includes('index')) return false;
        if (extendedFingers.includes('middle') && extendedFingers.includes('ring')) return false; // Allow some flexibility
        
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        const wrist = landmarks[0];
        
        const isPointingUp = indexTip.y < indexMcp.y && indexTip.y < wrist.y;
        const angle = this.getFingerAngle(landmarks[5], landmarks[8]);
        const isVertical = Math.abs(angle + 90) < 45; // Expanded from 25 to 45 degrees
        
        return isPointingUp && isVertical;
    }
    
    isIndexPointingRightForgiving(landmarks, extendedFingers) {
        if (!extendedFingers.includes('index')) return false;
        if (extendedFingers.includes('middle') && extendedFingers.includes('ring')) return false;
        
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        
        const isPointingRight = indexTip.x > indexMcp.x;
        const angle = this.getFingerAngle(landmarks[5], landmarks[8]);
        const isHorizontal = Math.abs(angle) < 45; // Expanded from 30 to 45 degrees
        
        return isPointingRight && isHorizontal;
    }
    
    isIndexPointingLeftForgiving(landmarks, extendedFingers) {
        if (!extendedFingers.includes('index')) return false;
        if (extendedFingers.includes('middle') && extendedFingers.includes('ring')) return false;
        
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        
        const isPointingLeft = indexTip.x < indexMcp.x;
        const angle = this.getFingerAngle(landmarks[5], landmarks[8]);
        const isHorizontal = Math.abs(angle - 180) < 45 || Math.abs(angle + 180) < 45; // Expanded range
        
        return isPointingLeft && isHorizontal;
    }
    
    isIndexPointingDownForgiving(landmarks, extendedFingers) {
        if (!extendedFingers.includes('index')) return false;
        if (extendedFingers.includes('middle') && extendedFingers.includes('ring')) return false;
        
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        const wrist = landmarks[0];
        
        const isPointingDown = indexTip.y > indexMcp.y && indexTip.y > wrist.y;
        const angle = this.getFingerAngle(landmarks[5], landmarks[8]);
        const isVertical = Math.abs(angle - 90) < 45; // Expanded from 25 to 45 degrees
        
        return isPointingDown && isVertical;
    }
    
    // New method for rough pointing detection
    isIndexRoughlyPointing(landmarks, extendedFingers) {
        if (!extendedFingers.includes('index')) return false;
        
        // Allow up to 2 other fingers to be extended (more forgiving)
        const otherFingers = extendedFingers.filter(f => f !== 'index' && f !== 'thumb');
        if (otherFingers.length > 2) return false;
        
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        
        // Check if index is generally extended in any direction
        const distance = this.distance(indexTip, indexMcp);
        const minDistance = 0.03; // Minimum extension distance
        
        return distance > minDistance;
    }
    
    getFingerAngle(point1, point2) {
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }
    
    distance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    stopCamera() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
            this.video.srcObject = null;
            this.videoContainer.classList.add('hidden');
            
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.updateStatus('Camera stopped', 'loading');
            this.startBtn.classList.remove('hidden');
            this.stopBtn.classList.add('hidden');
        }
        
        this.permanentLines = [];
        this.lineAnimations.clear();
        this.isDrawing = false;
        this.lastDrawPoint = null;
        this.currentStrokeColor = null; // Reset stroke color
    }
    
    updateStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message status-${type}`;
    }
    
    getCurrentGesture() {
        return this.currentGesture;
    }
    
    // Optional: Add methods to adjust jiggle intensity
    setJiggleIntensity(intensity) {
        this.jiggleIntensity = Math.max(0, Math.min(10, intensity));
    }
    
    setJiggleSpeed(speed) {
        this.jiggleSpeed = Math.max(0.01, Math.min(0.2, speed));
    }
}