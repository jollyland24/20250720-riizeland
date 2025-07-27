// webcam-modal.js - With specific gesture detection
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
                maxNumHands: 2,
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
            
            setTimeout(() => {
                this.setupCanvas();
                this.startHandDetection();
                this.videoContainer.classList.remove('hidden');
                
                this.updateStatus('Camera ready - Show your hands!', 'success');
                this.startBtn.classList.add('hidden');
                this.stopBtn.classList.remove('hidden');
            }, 200);
            
        } catch (error) {
            console.error('Camera error:', error);
            this.updateStatus('Camera access denied or not available', 'error');
        }
    }
    
    setupCanvas() {
        const videoRect = this.video.getBoundingClientRect();
        
        this.canvas.width = videoRect.width;
        this.canvas.height = videoRect.height;
        
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
    }
    
    updateCanvasSize() {
        if (this.video && this.canvas && this.stream) {
            this.setupCanvas();
        }
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
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            this.ctx.save();
            this.ctx.scale(-1, 1);
            this.ctx.translate(-this.canvas.width, 0);
            
            results.multiHandLandmarks.forEach((landmarks, index) => {
                // Detect gesture first
                const gesture = this.detectGesture(landmarks);
                this.currentGesture = gesture;
                
                // Draw hand with gesture-specific styling
                this.drawConnections(landmarks, gesture);
                this.drawLandmarks(landmarks, gesture);
                
                // Update status with gesture info
                const handCount = results.multiHandLandmarks.length;
                const gestureText = gesture !== 'none' ? ` - ${gesture.toUpperCase()}` : '';
                this.updateStatus(`Tracking ${handCount} hand${handCount > 1 ? 's' : ''}${gestureText}`, 'success');
                
                // Handle gesture actions
                this.handleGestureAction(gesture);
            });
            
            this.ctx.restore();
        } else {
            this.currentGesture = 'none';
        }
    }
    
    detectGesture(landmarks) {
        // Get finger tip and joint positions
        const fingerTips = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky tips
        const fingerPips = [3, 6, 10, 14, 18]; // PIP joints for comparison
        const fingerMcps = [2, 5, 9, 13, 17]; // MCP joints (base of fingers)
        
        // Check which fingers are extended
        const extendedFingers = this.getExtendedFingers(landmarks, fingerTips, fingerPips, fingerMcps);
        
        // Specific gesture detection
        if (this.isIndexPointingUp(landmarks, extendedFingers)) {
            return 'index_pointing_up';
        } else if (this.isIndexPointingRight(landmarks, extendedFingers)) {
            return 'index_pointing_right';
        } else if (this.isIndexPointingLeft(landmarks, extendedFingers)) {
            return 'index_pointing_left';
        } else if (this.isIndexPointingDown(landmarks, extendedFingers)) {
            return 'index_pointing_down';
        } else if (extendedFingers.length === 0) {
            return 'fist';
        } else if (extendedFingers.length === 5) {
            return 'open_hand';
        } else if (extendedFingers.includes('index') && extendedFingers.includes('middle') && extendedFingers.length === 2) {
            return 'peace';
        } else if (extendedFingers.includes('thumb') && extendedFingers.length === 1) {
            return 'thumbs_up';
        }
        
        return 'none';
    }
    
    getExtendedFingers(landmarks, fingerTips, fingerPips, fingerMcps) {
        const extendedFingers = [];
        
        // Check thumb (different logic due to thumb orientation)
        const thumbTip = landmarks[4];
        const thumbIp = landmarks[3];
        const thumbMcp = landmarks[2];
        
        // Thumb is extended if tip is further from palm than IP joint
        if (this.distance(thumbTip, landmarks[0]) > this.distance(thumbIp, landmarks[0])) {
            extendedFingers.push('thumb');
        }
        
        // Check other fingers (index, middle, ring, pinky)
        const fingerNames = ['index', 'middle', 'ring', 'pinky'];
        for (let i = 1; i < fingerTips.length; i++) {
            const tip = landmarks[fingerTips[i]];
            const pip = landmarks[fingerPips[i]];
            const mcp = landmarks[fingerMcps[i]];
            
            // Finger is extended if tip is higher (lower y value) than both PIP and MCP
            if (tip.y < pip.y && tip.y < mcp.y) {
                extendedFingers.push(fingerNames[i-1]);
            }
        }
        
        return extendedFingers;
    }
    
    isIndexPointingUp(landmarks, extendedFingers) {
        // Index finger must be extended, others folded
        if (!extendedFingers.includes('index')) return false;
        if (extendedFingers.includes('middle') || extendedFingers.includes('ring') || extendedFingers.includes('pinky')) return false;
        
        // Index finger tip should be significantly higher than MCP
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        const wrist = landmarks[0];
        
        // Check if index is pointing upward (tip higher than MCP and wrist)
        const isPointingUp = indexTip.y < indexMcp.y && indexTip.y < wrist.y;
        
        // Check angle - index should be relatively vertical
        const angle = this.getFingerAngle(landmarks[5], landmarks[8]);
        const isVertical = Math.abs(angle) < 30; // Within 30 degrees of vertical
        
        return isPointingUp && isVertical;
    }
    
    isIndexPointingRight(landmarks, extendedFingers) {
        if (!extendedFingers.includes('index')) return false;
        if (extendedFingers.includes('middle') || extendedFingers.includes('ring') || extendedFingers.includes('pinky')) return false;
        
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        
        // Index tip should be significantly to the right of MCP
        const isPointingRight = indexTip.x > indexMcp.x;
        
        // Check angle - should be close to horizontal
        const angle = this.getFingerAngle(landmarks[5], landmarks[8]);
        const isHorizontal = Math.abs(angle - 90) < 30 || Math.abs(angle + 90) < 30;
        
        return isPointingRight && isHorizontal;
    }
    
    isIndexPointingLeft(landmarks, extendedFingers) {
        if (!extendedFingers.includes('index')) return false;
        if (extendedFingers.includes('middle') || extendedFingers.includes('ring') || extendedFingers.includes('pinky')) return false;
        
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        
        // Index tip should be significantly to the left of MCP
        const isPointingLeft = indexTip.x < indexMcp.x;
        
        // Check angle
        const angle = this.getFingerAngle(landmarks[5], landmarks[8]);
        const isHorizontal = Math.abs(angle - 90) < 30 || Math.abs(angle + 90) < 30;
        
        return isPointingLeft && isHorizontal;
    }
    
    isIndexPointingDown(landmarks, extendedFingers) {
        if (!extendedFingers.includes('index')) return false;
        if (extendedFingers.includes('middle') || extendedFingers.includes('ring') || extendedFingers.includes('pinky')) return false;
        
        const indexTip = landmarks[8];
        const indexMcp = landmarks[5];
        const wrist = landmarks[0];
        
        // Index finger tip should be lower than MCP
        const isPointingDown = indexTip.y > indexMcp.y && indexTip.y > wrist.y;
        
        // Check angle
        const angle = this.getFingerAngle(landmarks[5], landmarks[8]);
        const isVertical = Math.abs(angle - 180) < 30;
        
        return isPointingDown && isVertical;
    }
    
    getFingerAngle(point1, point2) {
        // Calculate angle in degrees between two points
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }
    
    distance(point1, point2) {
        const dx = point1.x - point2.x;
        const dy = point1.y - point2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    handleGestureAction(gesture) {
        switch(gesture) {
            case 'index_pointing_up':
                console.log('👆 Index finger pointing UP detected!');
                // Add your custom action here
                break;
            case 'index_pointing_right':
                console.log('👉 Index finger pointing RIGHT detected!');
                break;
            case 'index_pointing_left':
                console.log('👈 Index finger pointing LEFT detected!');
                break;
            case 'index_pointing_down':
                console.log('👇 Index finger pointing DOWN detected!');
                break;
            case 'fist':
                console.log('✊ Fist detected!');
                break;
            case 'open_hand':
                console.log('✋ Open hand detected!');
                break;
            case 'peace':
                console.log('✌️ Peace sign detected!');
                break;
            case 'thumbs_up':
                console.log('👍 Thumbs up detected!');
                break;
        }
    }
    
    drawConnections(landmarks, gesture) {
        const connections = [
            [0,1],[1,2],[2,3],[3,4], // Thumb
            [0,5],[5,6],[6,7],[7,8], // Index
            [0,9],[9,10],[10,11],[11,12], // Middle
            [0,13],[13,14],[14,15],[15,16], // Ring
            [0,17],[17,18],[18,19],[19,20], // Pinky
            [5,9],[9,13],[13,17] // Palm
        ];
        
        // Change color based on gesture
        if (gesture.includes('pointing')) {
            this.ctx.strokeStyle = '#FF6B00'; // Orange for pointing
            this.ctx.lineWidth = 3;
        } else if (gesture === 'fist') {
            this.ctx.strokeStyle = '#FF0000'; // Red for fist
            this.ctx.lineWidth = 3;
        } else {
            this.ctx.strokeStyle = '#00FF00'; // Green for normal
            this.ctx.lineWidth = 2;
        }
        
        this.ctx.beginPath();
        
        connections.forEach(([start, end]) => {
            const startPoint = landmarks[start];
            const endPoint = landmarks[end];
            
            this.ctx.moveTo(
                startPoint.x * this.canvas.width,
                startPoint.y * this.canvas.height
            );
            this.ctx.lineTo(
                endPoint.x * this.canvas.width,
                endPoint.y * this.canvas.height
            );
        });
        
        this.ctx.stroke();
    }
    
    drawLandmarks(landmarks, gesture) {
        landmarks.forEach((landmark, index) => {
            // Highlight index finger tip when pointing
            if (index === 8 && gesture.includes('pointing')) {
                this.ctx.fillStyle = '#FF6B00'; // Orange for pointing finger tip
                this.ctx.beginPath();
                this.ctx.arc(
                    landmark.x * this.canvas.width,
                    landmark.y * this.canvas.height,
                    8, // Bigger for pointing finger
                    0,
                    2 * Math.PI
                );
                this.ctx.fill();
            } else if (index === 0) {
                this.ctx.fillStyle = '#FF0000'; // Red wrist
            } else if ([4, 8, 12, 16, 20].includes(index)) {
                this.ctx.fillStyle = '#0000FF'; // Blue fingertips
            } else {
                this.ctx.fillStyle = '#FFFF00'; // Yellow joints
            }
            
            if (!(index === 8 && gesture.includes('pointing'))) {
                this.ctx.beginPath();
                this.ctx.arc(
                    landmark.x * this.canvas.width,
                    landmark.y * this.canvas.height,
                    5,
                    0,
                    2 * Math.PI
                );
                this.ctx.fill();
            }
        });
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
    }
    
    updateStatus(message, type) {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status-message status-${type}`;
    }
    
    // Public method to get current gesture
    getCurrentGesture() {
        return this.currentGesture;
    }
}