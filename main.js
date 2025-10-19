import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
// Backend API configuration
const BACKEND_URL = 'http://localhost:3001';

const scene = new THREE.Scene();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const bounceSound = new Audio('./sound_tape.wav');
bounceSound.preload = 'auto';
const collectSound = new Audio('./sound_star.wav')
collectSound.preload = 'auto';
const changeSound = new Audio('./sound_change.mp3')
changeSound.preload = 'auto';
const scratchSound = new Audio('./babyscratch-87371.mp3');
scratchSound.preload = 'auto';

// Background music controls
const backgroundMusic = document.getElementById('background-music');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const audioIndicator = document.getElementById('audio-indicator');

let isPlaying = false;

// Multiple song system
const songList = [
    {
        name: "RIIZE Odyssey Instrumental",
        file: "./RIIZE Odyssey Instrumental.mp3"
    },
    {
        name: "RIIZE Bag Bad Back Instrumental",
        file: "./RIIZE Bag Bad Back Instrumental.mp3"
    },
    {
        name: "RIIZE Ember to Solar Instrumental",
        file: "./RIIZE Ember to Solar Instrumental.mp3"
    },
    {
        name: "RIIZE Fly Up Instrumental",
        file: "./RIIZE Fly Up Instrumental.mp3"
    },
    {
        name: "RIIZE Midnight Mirage Instrumental",
        file: "./RIIZE Midnight Mirage Instrumental.mp3"
    }
];

let currentSongIndex = 0;

// Zoom-audio effect variables
let previousZoom = 0.6; // Initial zoom value
let currentZoom = 0.6;
let zoomVelocity = 0;
let targetPlaybackRate = 1.0;
let targetVolume = 1.0;
let currentPlaybackRate = 1.0;
let currentVolume = 1.0;

// Horizontal panning variables for DJ scrubbing
let previousAzimuth = 0;
let currentAzimuth = 0;
let azimuthVelocity = 0;
let lastScrubTime = 0;
let scrubCooldown = 300; // ms between scrubs to prevent spam

// Positional scrubbing state
let isScrubbing = false;
let scrubDirection = null; // 'LEFT' or 'RIGHT'
let scrubSensitivity = 3.0; // How many seconds to jump per unit of movement (reduced from 30.0)
let scrubSpeed = 3.0; // 3x speed during scrubbing for audio feedback
let targetScrubRate = 1.0;
let accumulatedScrubDistance = 0; // Track total scrub movement

// Scratch sound control
let scratchIntensity = 0; // Current movement intensity
let maxScratchIntensity = 0; // Peak intensity during current scrub session
let scratchFadeTimeout = null;

// Audio context for better control (Web Audio API)
let audioContext = null;
let gainNode = null;
let sourceNode = null;

// Effect settings - EXTREME Slow motion feel
const ZOOM_SENSITIVITY = 25.0; // MUCH higher sensitivity (was 15.0)
const MIN_SLOW_MOTION = 0.15; // SUPER slow minimum (was 0.3 - now can go to 0.15x!)
const MAX_VOLUME_REDUCTION = 0.8; // More dramatic volume drop (was 0.6)
const DECAY_RATE = 0.70; // MUCH faster bounce back to normal speed


const characterModels = {
    totalStars: 5, // Total number of stars to collect
    allCollected: false,
    currentModel: "simplehead",
    availableModels: {
        "simplehead": "export", // Use the main export.glb file
        "sungchan": "./sungchan.glb",
        "eunseok": "./eunseok.glb", 
        "shotaro": "./shotaro.glb",
        "sohee": "./sohee.glb",
        "anton": "./anton.glb"
    }
};


// Create a large plane that covers the background
const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  varying vec2 vUv;
  
  vec3 getGradientColor(float y) {
    vec3 darkBlue = vec3(0.12, 0.33, 0.39);     // Top - Dark navyrgba(11, 20, 38, 0.39)
    vec3 purpleBlue = vec3(0.37, 0.61, 0.68);   // Upper mid - Purple-bluergba(39, 73, 96, 0.39)
    vec3 skyPurple = vec3(0.47, 0.61, 0.68);    // Middle - Sky blue-purple (hue 212) #678CCD
    vec3 lightSkyBlue = vec3(0.88, 0.70, 0.28); // Lower mid - Light sky blue #87BAEB
    vec3 paleBlue = vec3(0.98, 0.82, 0.43);     // Above horizon - Pale sky bluergb(229, 173, 242)
    vec3 nearWhite = vec3(0.95, 0.97, 1.0);        // Bottom - Nearly white blue
    
    if (y > 0.75) {
      // Top section: dark blue to purple-blue
      float factor = (y - 0.75) * 4.0;
      return mix(purpleBlue, darkBlue, factor);
    } else if (y > 0.5) {
      // Upper middle: purple-blue to sky-purple
      float factor = (y - 0.5) * 4.0;
      return mix(skyPurple, purpleBlue, factor);
    } else if (y > 0.3) {
      // Lower middle: sky-purple to light sky blue
      float factor = (y - 0.3) * 5.0;
      return mix(lightSkyBlue, skyPurple, factor);
    } else if (y > 0.1) {
      // Above horizon: light sky blue to pale blue
      float factor = (y - 0.1) * 5.0;
      return mix(paleBlue, lightSkyBlue, factor);
    } else {
      // Bottom: pale blue to nearly white
      float factor = y * 10.0;
      return mix(nearWhite, paleBlue, factor);
    }
  }
  
  void main() {
    vec3 color = getGradientColor(vUv.y);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const geometry = new THREE.PlaneGeometry(2, 2);
const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader
});

const backgroundPlane = new THREE.Mesh(geometry, material);
backgroundPlane.renderOrder = -1; // Render behind everything
scene.add(backgroundPlane);

// Remove the solid background
scene.background = null;

// Add exponential fog for atmospheric effect
scene.fog = new THREE.FogExp2(0xEAD7FF, 0.001);

const canvas = document.getElementById("experience-canvas");
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
}

let character = {
    instance: null,
    moveDistance: 8,
    jumpHeight: 2,
    isMoving: false,
    moveDuration: 0.1,
}

// Star system
const stars = {
    objects: [],
    collected: new Set(),
    spinSpeed: 0.02,
    collectionDistance: 3.0
};

// Bounding box helpers
const boundingBoxes = {
    character: null,
    characterHelper: null,
    starHelpers: [],
    showHelpers: false // Changed to false to hide bounding boxes
};

// Tape system
const tape = {
    instance: null,
    boundingBox: null,
    helper: null,
    originalPosition: null,
    isAnimating: false,
    bounceHeight: 8, // Increased from 3 to 8 for higher flight
    bounceDuration: 1.2, // Increased duration for higher flight
    spinSpeed: 0.01 // Slow default spinning
};

const renderer = new THREE.WebGLRenderer({canvas: canvas, antialias: true });
renderer.setSize( sizes.width, sizes.height );
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.enabled = true; 
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;

// Custom retro shader for VHS/80s effect
const retroShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'time': { value: 0 },
    'resolution': { value: new THREE.Vector2(sizes.width, sizes.height) },
    'scanlineIntensity': { value: 0.03 },
    'grainIntensity': { value: 0.05 },
    'vignetteIntensity': { value: 0.005 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform float scanlineIntensity;
    uniform float grainIntensity;
    uniform float vignetteIntensity;
    varying vec2 vUv;
    
    // Random function for grain
    float random(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }
    
    void main() {
    vec4 color = texture2D(tDiffuse, vUv);
    
    // VHS Scanlines
    float scanline = sin(vUv.y * resolution.y * 1.5) * scanlineIntensity;
    color.rgb -= vec3(scanline);
    
    // Film grain
    float grain = (random(vUv + time * 0.5) - 0.5) * grainIntensity;
    grain += (random(vUv * 2.0 + time) - 0.5) * grainIntensity * 0.5; // Add finer grain
    color.rgb += vec3(grain);
    
    // Subtle chromatic aberration
    float aberration = 0.001;
    color.r = texture2D(tDiffuse, vUv + vec2(aberration, 0.0)).r;
    color.b = texture2D(tDiffuse, vUv - vec2(aberration, 0.0)).b;
    
    // Retro color grading (subtle red reduction)
    color.r = pow(color.r, 0.95); // Very slight red reduction from 0.9
    color.g = pow(color.g, 0.9);
    color.b = pow(color.b, 0.5);  // Slight blue boost reduction from 0.3
    
    float luminance = dot(color.rgb, vec3(0.3, 0.5, 0.2));
    vec3 grayscale = vec3(luminance);
    color.rgb = mix(color.rgb, grayscale, 0.45);
    
    color.rgb *= 1.25;
    
    gl_FragColor = color;
}
  `
};


let intersectObject = "";
const intersectObjects = [];
const intersectObjectsNames = [
    "star001",
    "star002",
    "star003",
    "star004",
    "star005",
    "tape"
]

const starNames = [
    "star001",
    "star002", 
    "star003",
    "star004",
    "star005"
];

const loader = new GLTFLoader();

loader.load( './export.glb', function ( glb ) {
  glb.scene.traverse(child=>{
     console.log(child.name);
    if(intersectObjectsNames.includes(child.name)){
      intersectObjects.push(child);
      console.log(`Added ${child.name} to intersectObjects`);
    }
    
    // Store star objects for spinning and collision detection
    if(starNames.includes(child.name)){
      const starObject = {
        mesh: child,
        name: child.name,
        originalPosition: child.position.clone(),
        boundingBox: new THREE.Box3(),
        helper: null
      };
      stars.objects.push(starObject);
      
      // Create bounding box helper for star
      if(boundingBoxes.showHelpers) {
        starObject.helper = new THREE.Box3Helper(starObject.boundingBox, 0x00ff00);
        scene.add(starObject.helper);
        boundingBoxes.starHelpers.push(starObject.helper);
      }
    }
    
    // Handle tape object
    if(child.name === "tape"){
        tape.instance = child;
        tape.originalPosition = child.position.clone();
        tape.boundingBox = new THREE.Box3();

        // Make sure tape is clickable - traverse its children to add meshes
        child.traverse((meshChild) => {
            if (meshChild.isMesh) {
                console.log(`Found tape mesh: ${meshChild.name}`);
                // Add all tape meshes to intersect objects for better detection
                if (!intersectObjects.includes(meshChild)) {
                    intersectObjects.push(meshChild);
                    console.log(`Added tape mesh ${meshChild.name} to intersectObjects`);
                }
            }
        });

        // Create bounding box helper for tape
        if(boundingBoxes.showHelpers) {
          tape.helper = new THREE.Box3Helper(tape.boundingBox, 0xffff00);
          scene.add(tape.helper);
        }
    }
    
    if (child.isMesh) {
        // Clone the material for each mesh to make them independent
        if (child.material) {
          child.material = child.material.clone();
        }
        child.castShadow = true;
        child.receiveShadow = true;
    }
    if(child.name === "simplehead"){
        character.instance = child;
        
        // Store reference to simplehead for later use
        character.originalSimplehead = child;
        
        // Create bounding box for character
        boundingBoxes.character = new THREE.Box3();
        
        // Create visual helper for character bounding box
        if(boundingBoxes.showHelpers) {
            boundingBoxes.characterHelper = new THREE.Box3Helper(boundingBoxes.character, 0xff0000);
            scene.add(boundingBoxes.characterHelper);
        }
    }

    if(child.name === "Plane"){
        // change the color of the riize logo
        child.material.color = new THREE.Color().setHex(0xFFBA66);
    }
    if(child.name === "Plane_1"){
        // change the color of the riize logo
        child.material.color = new THREE.Color().setHex(0xFBA339);
    }
    if(child.name.toLowerCase().startsWith("star")){
    child.material.color = new THREE.Color().setHex(0xf7f027);
    
}
  })
  scene.add( glb.scene );
  console.log('GLTF loaded successfully');
}, undefined, function ( error ) {
   console.error( 'GLTF loading error:', error );
} );

const sun = new THREE.DirectionalLight( 0xffffff);
sun.castShadow = true;
sun.position.set(-50, 50, 0);
sun.shadow.mapSize.width = 4096;
sun.shadow.mapSize.height = 4096;
sun.shadow.camera.left = -150;
sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100;
sun.shadow.camera.bottom = -100;
sun.shadow.normalBias = 0.2;
scene.add( sun );

const shadowHelper = new THREE.CameraHelper( sun.shadow.camera );
// scene.add( shadowHelper ); // Commented out to hide shadow camera lines

const helper = new THREE.DirectionalLightHelper( sun, 9 );
// scene.add( helper ); // Commented out to hide directional light helper lines

const light = new THREE.AmbientLight( 0xffffff, 3); 
scene.add( light );

const aspect = sizes.width / sizes.height;

const camera = new THREE.OrthographicCamera( 
    -aspect * 50,
    aspect * 50,
    50,
    -50,
    1,
    1000 );
scene.add( camera );

camera.position.x = 29;
camera.position.y = 52;
camera.position.z = 82;

// Add this line to zoom out a bit from the start
camera.zoom = 0.6;  // or try 0.8 for less zoom out, 0.6 for more
camera.updateProjectionMatrix();

// Create post-processing composer - AFTER renderer and camera are created
const composer = new EffectComposer(renderer);

// Add the basic render pass
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

const retroPass = new ShaderPass(retroShader);
composer.addPass(retroPass);

const controls = new OrbitControls( camera, canvas );
controls.enablePan = false;        // No panning
controls.enableZoom = true;        // Keep zoom
controls.enableRotate = true;      // Enable rotation
controls.enableDamping = true;     // Smooth movement
controls.dampingFactor = 0.05;     // How smooth

controls.minAzimuthAngle = -Math.PI / 6;  // -30 degrees left
controls.maxAzimuthAngle = Math.PI / 6;   // +30 degrees right
controls.minPolarAngle = Math.PI / 3;     // Don't go too high
controls.maxPolarAngle = Math.PI / 2;     // Don't go too low

controls.minZoom = 0.5;   // Maximum zoom out (smaller = more zoomed out)
controls.maxZoom = 1.5;   // Maximum zoom in (larger = more zoomed in)

controls.update();



// Add missing showModal function
function showModal(objectName) {
    console.log(`Clicked on: ${objectName}`);
    // You can add specific behavior for different objects here
    if (objectName === "tape") {
        console.log("Tape clicked! Switching to next song...");
        switchToNextSong();
    }
}


function onResize(){
    sizes.width = window.innerWidth;
    sizes.height = window.innerHeight;
    const aspect = sizes.width / sizes.height;
    camera.left = -aspect * 50;
    camera.right = aspect * 50;
    camera.top = 50;
    camera.bottom = -50;
    camera.updateProjectionMatrix();
    console.log('resizing')
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Update composer size
    composer.setSize(sizes.width, sizes.height);
    
    // Update shader resolution
    retroPass.uniforms.resolution.value.set(sizes.width, sizes.height);
}

function onClick () {
    console.log('Click detected - intersectObject:', intersectObject);
    if(intersectObject !== ""){
        console.log('Calling showModal with:', intersectObject);
        showModal(intersectObject);
    } else {
        console.log('No intersection detected on click');
    }
}

function onPointerMove( event ) {
	pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}

function moveCharacter(targetPosition, targetRotation) {
    if (!character.instance) return;
    
    character.isMoving = true;
    
    // Check if GSAP is available
    if (typeof gsap !== 'undefined') {
        const t1 = gsap.timeline({
            onComplete: () => {
                character.isMoving = false;
            }
        })

        t1.to(character.instance.position, {
            x: targetPosition.x,
            z: targetPosition.z,
            duration: character.moveDuration,
        });

        t1.to(character.instance.rotation, {
            y: targetRotation,
            duration: character.moveDuration,
        }, 0);

        t1.to(character.instance.position, {
            y: character.instance.position.y + character.jumpHeight,
            duration: character.moveDuration / 2,
            yoyo: true,
            repeat: 1,
        }, 0);
    } else {
        // Fallback without GSAP
        character.instance.position.x = targetPosition.x;
        character.instance.position.z = targetPosition.z;
        character.instance.rotation.y = targetRotation;
        character.isMoving = false;
    }
}

function updateBoundingBoxes() {
    // Update character bounding box
    if (character.instance && boundingBoxes.character) {
        boundingBoxes.character.setFromObject(character.instance);
        
        // Update character helper
        if (boundingBoxes.characterHelper) {
            boundingBoxes.characterHelper.box = boundingBoxes.character;
        }
    }
    
    // Update tape bounding box
    if (tape.instance && tape.boundingBox) {
        tape.boundingBox.setFromObject(tape.instance);
        
        // Update tape helper
        if (tape.helper) {
            tape.helper.box = tape.boundingBox;
        }
    }
    
    // Update star bounding boxes
    stars.objects.forEach(starObject => {
        if (starObject.mesh.visible && !stars.collected.has(starObject.name)) {
            starObject.boundingBox.setFromObject(starObject.mesh);
            
            // Update star helper
            if (starObject.helper) {
                starObject.helper.box = starObject.boundingBox;
            }
        }
    });
}

function checkTapeCollision() {
    if (!character.instance || !boundingBoxes.character || !tape.instance || tape.isAnimating) return;
    
    // Check if character bounding box intersects with tape bounding box
    if (boundingBoxes.character.intersectsBox(tape.boundingBox)) {
        bounceTape();
        // console.log('Tape bounced!');
    }
}

function bounceTape() {
    if (!tape.instance || tape.isAnimating) return;
    
    tape.isAnimating = true;

    bounceSound.currentTime = 0;
    bounceSound.play().catch(error => {
        console.log('Audio playback failed:', error);
    });
    
    // Check if GSAP is available for animation
    if (typeof gsap !== 'undefined') {
        const bounceTimeline = gsap.timeline({
            onComplete: () => {
                tape.isAnimating = false;
            }
        });
        
        // Move up higher with more dramatic easing
        bounceTimeline.to(tape.instance.position, {
            y: tape.originalPosition.y + tape.bounceHeight,
            duration: tape.bounceDuration * 0.4, // 40% of time going up
            ease: "power3.out"
        });
        
        // Fall back down with bounce
        bounceTimeline.to(tape.instance.position, {
            y: tape.originalPosition.y,
            duration: tape.bounceDuration * 0.6, // 60% of time coming down
            ease: "bounce.out"
        });
        
        // Add some rotation during the bounce for extra flair
        bounceTimeline.to(tape.instance.rotation, {
            y: tape.instance.rotation.y + Math.PI * 2, // Full rotation
            duration: tape.bounceDuration,
            ease: "power2.inOut"
        }, 0); // Start at the same time as position animation
        
    } else {
        // Fallback without GSAP - simple up and down
        setTimeout(() => {
            if (tape.instance) {
                tape.instance.position.y = tape.originalPosition.y + tape.bounceHeight;
                setTimeout(() => {
                    if (tape.instance) {
                        tape.instance.position.y = tape.originalPosition.y;
                        tape.isAnimating = false;
                    }
                }, tape.bounceDuration * 600);
            }
        }, 100);
    }
}

function checkStarCollisionsBoundingBox() {
    if (!character.instance || !boundingBoxes.character) return;
    
    stars.objects.forEach(starObject => {
        if (stars.collected.has(starObject.name) || !starObject.mesh.visible) return;
        
        // Check if bounding boxes intersect
        if (boundingBoxes.character.intersectsBox(starObject.boundingBox)) {
            collectStar(starObject);
            // console.log(`Star ${starObject.name} collected via bounding box collision!`);
        }
    });
}

function collectStar(starObject) {
    if (stars.collected.has(starObject.name)) return;
    
    stars.collected.add(starObject.name);
    // console.log(`Collected ${starObject.name}!`);

    showNextMember(stars.collected.size);

    
    collectSound.currentTime = 0;
    collectSound.play().catch(error => {
        console.log('Audio playback failed:', error);
    });
    
    // Hide the helper when star is collected
    if (starObject.helper) {
        starObject.helper.visible = false;
    }
    
    // Check if GSAP is available for animation
    if (typeof gsap !== 'undefined') {
        // Create disappearing animation
        const disappearTimeline = gsap.timeline();
        
        // Scale down and fade out
        disappearTimeline.to(starObject.mesh.scale, {
            x: 0,
            y: 0,
            z: 0,
            duration: 0.3,
            ease: "back.in(1.7)"
        });
        
        // Optional: add a little jump before disappearing
        disappearTimeline.to(starObject.mesh.position, {
            y: starObject.originalPosition.y + 2,
            duration: 0.15,
            ease: "power2.out"
        }, 0);
        
        // Hide the star completely after animation
        disappearTimeline.call(() => {
            starObject.mesh.visible = false;
        });
    } else {
        // Fallback without GSAP - immediate disappear
        starObject.mesh.visible = false;
    }
}

function showNextMember(collectedCount) {
    const memberElements = [
        document.querySelector('.member1'),
        document.querySelector('.member2'),
        document.querySelector('.member3'),
        document.querySelector('.member4'),
        document.querySelector('.member5')
    ];
    
    if (collectedCount > 0 && collectedCount <= memberElements.length) {
        const memberToShow = memberElements[collectedCount - 1];
        if (memberToShow) {
            memberToShow.style.display = 'block';
            
            // Add subtle indication that they're not clickable yet
            if (!characterModels.allCollected) {
                memberToShow.style.opacity = '0.3';
                memberToShow.style.cursor = 'not-allowed';
            }
            
            if (typeof gsap !== 'undefined') {
                gsap.from(memberToShow, {
                    scale: 0,
                    duration: 0.5,
                    ease: "back.out(1.7)"
                });
            }
        }
    }
    
    // Check if all stars are collected
    checkAllStarsCollected();
    
    // console.log(`Members visible: ${Math.min(collectedCount + 1, 6)}/6`);
}

function checkAllStarsCollected() {
    const collectedCount = stars.collected.size;
    const wasAllCollected = characterModels.allCollected;
    characterModels.allCollected = collectedCount >= characterModels.totalStars;
    
    // If just completed collection, enable member clicking AND zoom camera
    if (characterModels.allCollected && !wasAllCollected) {
        
        
        // Add camera zoom effect
        if (typeof gsap !== 'undefined') {
            // Smooth zoom in using GSAP
            gsap.to(camera, {
                zoom: 1.0, // Increase from 0.6 to 0.8 for zoom in effect
                duration: 2, // 2 second duration
                ease: "power2.inOut",
                onUpdate: () => {
                    camera.updateProjectionMatrix();
                },
                onComplete: () => {
                    console.log("Camera zoom completed!");
                }
            });
        } else {
            // Fallback without GSAP - immediate zoom
            camera.zoom = 0.8;
            camera.updateProjectionMatrix();
        }

        enableMemberClicking();

        console.log("All stars collected! Camera zooming in and members are now clickable!");
    }
    
    return characterModels.allCollected;
}

function enableMemberClicking() {
    const memberElements = document.querySelectorAll('[class^="member"]');
    const membersContainer = document.querySelector('.members');
    
    // Clear any leftover inline styles
    if (membersContainer) {
        membersContainer.removeAttribute('style');
    }
    
    memberElements.forEach(member => {
        // Clear any leftover inline transform styles
        member.style.transform = '';
        member.style.translate = '';
        member.style.rotate = '';
        member.style.scale = '';
        
        // Set only what we need
        member.style.cursor = 'pointer';
        member.style.opacity = '1';
        
        // Add click event listener
        member.addEventListener('click', (event) => {
            const modelName = member.getAttribute('data-model');
            if (modelName && characterModels.availableModels[modelName]) {
                changeCharacterModel(modelName);
            }
        });
    });
}


function changeCharacterModel(modelName) {
    if (!characterModels.allCollected) {
        console.log("Collect all stars first!");
        return;
    }
    
    if (!characterModels.availableModels[modelName]) {
        console.log(`Model ${modelName} not available`);
        return;
    }
    
    // console.log(`Changing character to ${modelName}`);
    
    // Store current character position and properties
    const currentPosition = character.instance ? character.instance.position.clone() : new THREE.Vector3(0, 0, 0);
    const currentRotation = character.instance ? character.instance.rotation.clone() : new THREE.Euler(0, 0, 0);
    
    // Hide the current character (don't remove if it's simplehead)
    if (character.instance) {
        if (characterModels.currentModel === "simplehead") {
            // Hide simplehead instead of removing it
            character.instance.visible = false;
        } else {
            // Remove external models completely
            scene.remove(character.instance);
        }
    }
    
    // Special case for simplehead - it's already in the main scene
    if (modelName === "simplehead") {
        // Find simplehead in the already loaded export.glb and make it visible
        changeSound.currentTime = 0;
        changeSound.play().catch(error => {
            console.log('Audio playback failed:', error);
        });
        scene.traverse(child => {
            if (child.name === "simplehead") {
                character.instance = child;
                character.instance.position.copy(currentPosition);
                character.instance.rotation.copy(currentRotation);
                character.instance.visible = true; // Make sure it's visible
                characterModels.currentModel = modelName;
                // console.log(`Character changed back to ${modelName}!`);
                return;
            }
        });
    } else {
        // Load external model file
        changeSound.currentTime = 0;
        changeSound.play().catch(error => {
            console.log('Audio playback failed:', error);
        });
        const loader = new GLTFLoader();
        
        loader.load(
            characterModels.availableModels[modelName],
            function(glb) {
                // Use the entire scene instead of just one mesh
                let newCharacter = glb.scene;
                
                // Set position and rotation to match previous character
                newCharacter.position.copy(currentPosition);
                newCharacter.rotation.copy(currentRotation);
                
                // Update character reference
                character.instance = newCharacter;
                characterModels.currentModel = modelName;
                
                // Apply properties to all meshes in the scene
                newCharacter.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                
                // Add to scene
                scene.add(newCharacter);
                
                // console.log(`Character changed to ${modelName}!`);
            },
            undefined,
            function(error) {
                // console.error(`Error loading ${modelName} model:`, error);
            }
);
    }
}

function updateStars() {
    stars.objects.forEach(starObject => {
        if (stars.collected.has(starObject.name) || !starObject.mesh.visible) return;
        
        // Spin the star
        starObject.mesh.rotation.y += stars.spinSpeed;
        starObject.mesh.rotation.x += stars.spinSpeed * 0.5;
        
        // Optional: add a gentle floating motion
        starObject.mesh.position.y = starObject.originalPosition.y + Math.sin(Date.now() * 0.002 + starObject.mesh.position.x) * 0.5;
    });
}

function updateTape() {
    if (!tape.instance || tape.isAnimating) return;
    
    // Slow default spinning for tape - only Y-axis
    tape.instance.rotation.y += tape.spinSpeed;
}

function onKeyDown(event) {
    if(character.isMoving || !character.instance) return;
    const targetPosition = new THREE.Vector3(0,0,0).copy(character.instance.position);
    let targetRotation = 0;
    
    switch(event.key.toLowerCase()){
        case "w":
        case "arrowup":
            targetPosition.z -= character.moveDistance;
            targetRotation = Math.PI;
            break;
        case "s":
        case "arrowdown":
            targetPosition.z += character.moveDistance;
            targetRotation = 0;
            break;
        case "a":
        case "arrowleft":
            targetPosition.x -= character.moveDistance;
            targetRotation = - Math.PI / 2;
            break;
        case "d":
        case "arrowright":
            targetPosition.x += character.moveDistance;
            targetRotation = Math.PI / 2;
            break;
        default:
            return;
    }
    moveCharacter(targetPosition, targetRotation);
}

window.addEventListener("resize", onResize);
window.addEventListener("click", onClick);
window.addEventListener('pointermove', onPointerMove);
window.addEventListener("keydown", onKeyDown);

// Audio control event listeners
playBtn.addEventListener('click', togglePlayStop);
stopBtn.addEventListener('click', stopMusic);

// Camera control event listener
const cameraBtn = document.getElementById('camera-btn');
const cameraOverlay = document.getElementById('camera-overlay');
const cameraVideo = document.getElementById('camera-video');
const photoCaptureBtn = document.getElementById('photo-capture-btn');
const processingIndicator = document.getElementById('processing-indicator');
const cameraCloseBtn = document.getElementById('camera-close-btn');

let cameraStream = null;
let isCameraActive = false;
let isProcessing = false;

cameraBtn.addEventListener('click', () => {
    if (!isCameraActive) {
        startCamera();
    } else {
        stopCamera();
    }
});

cameraCloseBtn.addEventListener('click', () => {
    stopCamera();
});

photoCaptureBtn.addEventListener('click', () => {
    if (isCameraActive && !isProcessing) {
        captureAndProcessPhoto();
    }
});

async function startCamera() {
    try {
        cameraOverlay.style.display = 'block';

        // Request camera access
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: false
        });

        cameraVideo.srcObject = cameraStream;
        isCameraActive = true;

        // Update camera button appearance
        cameraBtn.style.backgroundColor = 'rgba(255, 100, 100, 0.8)';
        cameraBtn.textContent = '📹';

        console.log('Camera started successfully');

    } catch (error) {
        console.error('Camera error:', error);

        // Hide overlay after 3 seconds if camera fails
        setTimeout(() => {
            if (!isCameraActive) {
                cameraOverlay.style.display = 'none';
            }
        }, 3000);
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    cameraVideo.srcObject = null;
    cameraOverlay.style.display = 'none';
    isCameraActive = false;
    isProcessing = false;

    // Reset camera button appearance
    cameraBtn.style.backgroundColor = 'rgba(143, 173, 255, 0.8)';
    cameraBtn.textContent = '📷';

    // Hide processing indicator
    processingIndicator.style.display = 'none';

    console.log('Camera stopped');
}

// Close camera with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isCameraActive) {
        stopCamera();
    }
});

// Photo capture and AI processing functions
async function captureAndProcessPhoto() {
    if (isProcessing) return;

    isProcessing = true;
    photoCaptureBtn.style.display = 'none';
    processingIndicator.style.display = 'flex';

    try {
        // Capture user photo
        const userPhotoBlob = await captureUserPhoto();

        // Capture scene background
        const scenePhotoBlob = await captureSceneBackground();

        // Send to Vertex AI for processing
        const mergedImageBlob = await processWithVertexAI(userPhotoBlob, scenePhotoBlob);

        // Display the result
        await displayMergedImage(mergedImageBlob);

        console.log('Photo processing completed successfully');

    } catch (error) {
        console.error('Photo processing error:', error);
        alert('Failed to process photo. Please try again.');
    } finally {
        isProcessing = false;
        photoCaptureBtn.style.display = 'flex';
        processingIndicator.style.display = 'none';
    }
}

async function captureUserPhoto() {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;

        // Draw the video frame (unmirrored for AI processing)
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(cameraVideo, 0, 0);

        canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });
}

async function captureSceneBackground() {
    return new Promise((resolve) => {
        // Temporarily hide UI elements for clean capture
        const uiElements = [
            document.querySelector('.members'),
            document.querySelector('.bottom-controls'),
            cameraOverlay
        ];

        uiElements.forEach(el => {
            if (el) el.style.display = 'none';
        });

        // Wait a frame for UI to hide
        requestAnimationFrame(() => {
            // Use the post-processing composer to maintain visual effects
            // This ensures the captured image matches what the user sees on screen
            composer.render();

            // Method 1: Try direct WebGL context readPixels with post-processing
            try {
                const gl = renderer.getContext();

                const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

                // Create canvas and flip the image (WebGL is upside down)
                const canvas = document.createElement('canvas');
                canvas.width = gl.drawingBufferWidth;
                canvas.height = gl.drawingBufferHeight;
                const ctx = canvas.getContext('2d');

                const imageData = ctx.createImageData(canvas.width, canvas.height);

                // Flip the image vertically (WebGL coordinates are bottom-up)
                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        const srcIndex = ((canvas.height - y - 1) * canvas.width + x) * 4;
                        const dstIndex = (y * canvas.width + x) * 4;
                        imageData.data[dstIndex] = pixels[srcIndex];     // R
                        imageData.data[dstIndex + 1] = pixels[srcIndex + 1]; // G
                        imageData.data[dstIndex + 2] = pixels[srcIndex + 2]; // B
                        imageData.data[dstIndex + 3] = 255; // A (full opacity)
                    }
                }

                ctx.putImageData(imageData, 0, 0);

                console.log('Scene captured using WebGL readPixels with post-processing effects preserved');

                // Restore UI elements
                uiElements.forEach((el, index) => {
                    if (el) {
                        el.style.display = index === 0 ? 'flex' :
                                          index === 1 ? 'flex' : 'block';
                    }
                });

                canvas.toBlob(resolve, 'image/jpeg', 0.9);

            } catch (error) {
                console.warn('WebGL readPixels failed, trying canvas method:', error);

                // Method 2: Fallback to canvas drawImage (may not work with WebGL)
                const canvas = document.createElement('canvas');
                canvas.width = renderer.domElement.width;
                canvas.height = renderer.domElement.height;
                const ctx = canvas.getContext('2d');

                try {
                    ctx.drawImage(renderer.domElement, 0, 0);
                    console.log('Scene captured using canvas drawImage method');
                } catch (drawError) {
                    console.warn('Canvas drawImage also failed:', drawError);
                    // Create a test pattern as fallback
                    ctx.fillStyle = '#ff0000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '48px Arial';
                    ctx.fillText('Scene Capture Failed', 50, 100);
                }

                // Restore UI elements
                uiElements.forEach((el, index) => {
                    if (el) {
                        el.style.display = index === 0 ? 'flex' :
                                          index === 1 ? 'flex' : 'block';
                    }
                });

                canvas.toBlob(resolve, 'image/jpeg', 0.9);
            }
        });
    });
}


async function processWithVertexAI(userPhotoBlob, scenePhotoBlob) {
    try {
        console.log('Sending images to backend for AI processing...');

        // Create FormData for the backend request
        const formData = new FormData();
        formData.append('userPhoto', userPhotoBlob, 'user.jpg');
        formData.append('scenePhoto', scenePhotoBlob, 'scene.jpg');

        // Send to backend server
        const response = await fetch(`${BACKEND_URL}/api/merge-images`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            // Try the simple endpoint as fallback
            console.log('Primary endpoint failed, trying simple endpoint...');
            const fallbackResponse = await fetch(`${BACKEND_URL}/api/merge-images-simple`, {
                method: 'POST',
                body: formData
            });

            if (!fallbackResponse.ok) {
                throw new Error(`Backend request failed: ${fallbackResponse.status}`);
            }

            const fallbackResult = await fallbackResponse.json();
            console.log('Simple merge completed:', fallbackResult.message);

            // Convert base64 back to blob
            const imageBytes = atob(fallbackResult.image);
            const imageArray = new Uint8Array(imageBytes.length);
            for (let i = 0; i < imageBytes.length; i++) {
                imageArray[i] = imageBytes.charCodeAt(i);
            }

            return new Blob([imageArray], { type: fallbackResult.mimeType || 'image/jpeg' });
        }

        const result = await response.json();

        if (!result.success || !result.image) {
            throw new Error('Invalid response from backend');
        }

        console.log('AI merge completed successfully!');

        // Convert base64 back to blob
        const imageBytes = atob(result.image);
        const imageArray = new Uint8Array(imageBytes.length);
        for (let i = 0; i < imageBytes.length; i++) {
            imageArray[i] = imageBytes.charCodeAt(i);
        }

        return new Blob([imageArray], { type: result.mimeType || 'image/jpeg' });

    } catch (error) {
        console.error('Backend processing error:', error);

        // Fallback: return user photo if backend fails
        console.log('Using fallback: returning user photo');
        return userPhotoBlob;
    }
}

async function blobToBase64(blob) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
    });
}

async function displayMergedImage(imageBlob) {
    // Create a temporary image element to show the result
    const img = document.createElement('img');
    img.src = URL.createObjectURL(imageBlob);
    img.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        max-width: 80vw;
        max-height: 80vh;
        border-radius: 1rem;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        z-index: 3000;
        border: 3px solid white;
    `;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 2999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = `
        position: absolute;
        top: 1rem;
        right: 1rem;
        width: 3rem;
        height: 3rem;
        border: none;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.9);
        font-size: 1.5rem;
        cursor: pointer;
        z-index: 3001;
    `;

    closeBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        URL.revokeObjectURL(img.src);
    });

    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    // Auto-close after 10 seconds
    setTimeout(() => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
            URL.revokeObjectURL(img.src);
        }
    }, 10000);
}

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create gain node for volume control
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);

        // Connect the audio element to Web Audio API
        if (!sourceNode) {
            sourceNode = audioContext.createMediaElementSource(backgroundMusic);
            sourceNode.connect(gainNode);
        }
    }
}

function togglePlayStop() {
    if (isPlaying) {
        backgroundMusic.pause();
        playBtn.textContent = '▶';
        isPlaying = false;
        console.log('Music stopped');
    } else {
        // Initialize audio context on first play (required by browsers)
        initAudioContext();

        backgroundMusic.play().catch(error => {
            console.log('Audio playback failed:', error);
        });
        playBtn.textContent = '⏸';
        isPlaying = true;
        console.log('Music started, zoom effects should now work');
    }
}

function stopMusic() {
    backgroundMusic.pause();
    backgroundMusic.currentTime = 0;
    playBtn.textContent = '▶';
    isPlaying = false;

    // Reset audio effects
    resetAudioEffects();
}

function switchToNextSong() {
    const wasPlaying = isPlaying;
    const currentTime = backgroundMusic.currentTime;

    // Stop current song
    if (isPlaying) {
        backgroundMusic.pause();
    }

    // Move to next song
    currentSongIndex = (currentSongIndex + 1) % songList.length;
    const newSong = songList[currentSongIndex];

    // Update audio source
    backgroundMusic.src = newSong.file;
    backgroundMusic.load(); // Important: reload the audio element

    // Play sound effect
    changeSound.currentTime = 0;
    changeSound.play().catch(error => {
        console.log('Change sound playback failed:', error);
    });

    // Visual feedback - show song name temporarily
    if (audioIndicator) {
        const shortName = newSong.name.replace('RIIZE ', '').replace(' Instrumental', '');
        audioIndicator.textContent = shortName;
        audioIndicator.style.backgroundColor = 'rgba(255, 215, 0, 0.9)'; // Gold color
        audioIndicator.style.transform = 'scale(1.3)';
        audioIndicator.style.boxShadow = '0 0 20px gold';

        // Reset visual after delay
        setTimeout(() => {
            if (audioIndicator && !isScrubbing && Math.abs(currentPlaybackRate - 1.0) < 0.05) {
                audioIndicator.textContent = '1.00x';
                audioIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                audioIndicator.style.transform = 'scale(1.0)';
                audioIndicator.style.boxShadow = 'none';
            }
        }, 2000);
    }

    // Resume playing if it was playing before
    if (wasPlaying) {
        backgroundMusic.addEventListener('loadeddata', () => {
            backgroundMusic.play().catch(error => {
                console.log('Audio playback failed:', error);
            });
        }, { once: true });
    }

    console.log(`🎵 Switched to: ${newSong.name}`);
}

function resetAudioEffects() {
    currentPlaybackRate = 1.0;
    currentVolume = 1.0;
    targetPlaybackRate = 1.0;
    targetVolume = 1.0;
    zoomVelocity = 0;

    if (backgroundMusic) {
        backgroundMusic.playbackRate = 1.0;
    }
    if (gainNode) {
        gainNode.gain.value = 1.0;
    }
}

function updatePanningEffects() {
    if (!isPlaying) return;

    // Get current azimuth angle (horizontal rotation) from OrbitControls
    currentAzimuth = controls.getAzimuthalAngle();
    azimuthVelocity = currentAzimuth - previousAzimuth;
    previousAzimuth = currentAzimuth;

    // Calculate movement intensity
    scratchIntensity = Math.abs(azimuthVelocity);

    // Check for horizontal movement (positional scrubbing)
    if (scratchIntensity > 0.005) {
        if (!isScrubbing) {
            // Start scrubbing
            isScrubbing = true;
            accumulatedScrubDistance = 0;
            maxScratchIntensity = 0;
            console.log('🎧 POSITIONAL SCRUB START');
        }

        // Track maximum intensity for this scrub session
        maxScratchIntensity = Math.max(maxScratchIntensity, scratchIntensity);

        // Play scratch sound with dynamic volume based on intensity
        updateScratchSound();

        // Accumulate movement distance
        accumulatedScrubDistance += azimuthVelocity;

        // Calculate new song position based on movement
        const timeShift = accumulatedScrubDistance * scrubSensitivity;
        const currentTime = backgroundMusic.currentTime;
        const newTime = Math.max(0, Math.min(backgroundMusic.duration || 0, currentTime + timeShift));

        // Actually move the song position
        backgroundMusic.currentTime = newTime;

        // Reset accumulated distance since we applied it
        accumulatedScrubDistance = 0;

        // Set playback speed for audio feedback during scrubbing
        if (azimuthVelocity < 0) {
            // Moving left (rewinding)
            scrubDirection = 'LEFT';
            targetScrubRate = -scrubSpeed; // Reverse playback sound
        } else {
            // Moving right (fast forwarding)
            scrubDirection = 'RIGHT';
            targetScrubRate = scrubSpeed; // Forward playback sound
        }

        updateScrubVisuals();

        // Clear any pending fade timeout
        if (scratchFadeTimeout) {
            clearTimeout(scratchFadeTimeout);
            scratchFadeTimeout = null;
        }

        console.log(`🎵 SCRUB: ${azimuthVelocity > 0 ? 'RIGHT' : 'LEFT'} - moved to ${newTime.toFixed(1)}s, intensity: ${scratchIntensity.toFixed(3)}`);

    } else if (isScrubbing) {
        // Movement stopped - fade out scratch sound and end scrubbing
        startScratchFade();
    }
}

function updateScratchSound() {
    // Dynamic volume based on movement intensity
    const volume = Math.min(1.0, scratchIntensity * 50); // Scale intensity to volume

    if (!scratchSound.paused && scratchSound.currentTime > 0) {
        // Already playing - just adjust volume
        scratchSound.volume = volume;
    } else if (volume > 0.1) {
        // Start playing if movement is significant enough
        scratchSound.currentTime = 0;
        scratchSound.volume = volume;
        scratchSound.play().catch(error => {
            console.log('Scratch sound playback failed:', error);
        });
    }
}

function startScratchFade() {
    // Fade out the scratch sound over 200ms when movement stops
    scratchFadeTimeout = setTimeout(() => {
        if (scratchSound && !scratchSound.paused) {
            const fadeInterval = setInterval(() => {
                if (scratchSound.volume > 0.1) {
                    scratchSound.volume = Math.max(0, scratchSound.volume - 0.1);
                } else {
                    scratchSound.pause();
                    scratchSound.volume = 1.0; // Reset for next time
                    clearInterval(fadeInterval);
                }
            }, 20);
        }
        endScrubEffect();
    }, 200);
}

function endScrubEffect() {
    isScrubbing = false;
    scrubDirection = null;
    targetScrubRate = 1.0;
    accumulatedScrubDistance = 0;
    scratchIntensity = 0;
    maxScratchIntensity = 0;

    console.log(`🎧 POSITIONAL SCRUB END - staying at new position, returning to normal speed`);

    // Reset visual indicator
    if (audioIndicator) {
        audioIndicator.textContent = '1.00x';
        audioIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        audioIndicator.style.transform = 'scale(1.0)';
        audioIndicator.style.boxShadow = 'none';
    }
}

function updateScrubVisuals() {
    if (!audioIndicator) return;

    // Show scrubbing direction and current song time
    const currentTime = backgroundMusic.currentTime;
    const totalTime = backgroundMusic.duration || 0;

    if (scrubDirection === 'LEFT') {
        audioIndicator.textContent = `◀ ${currentTime.toFixed(1)}s`;
        audioIndicator.style.backgroundColor = 'rgba(255, 100, 0, 0.9)';
        audioIndicator.style.boxShadow = '0 0 15px orange';
    } else {
        audioIndicator.textContent = `${currentTime.toFixed(1)}s ▶`;
        audioIndicator.style.backgroundColor = 'rgba(0, 200, 100, 0.9)';
        audioIndicator.style.boxShadow = '0 0 15px lime';
    }

    // Pulsing effect during scrubbing
    const pulse = 1.1 + Math.sin(Date.now() * 0.02) * 0.1;
    audioIndicator.style.transform = `scale(${pulse})`;
}

function updateZoomEffects() {
    if (!isPlaying) return;

    // Get current zoom and calculate velocity
    currentZoom = camera.zoom;
    zoomVelocity = currentZoom - previousZoom;
    previousZoom = currentZoom;

    // Calculate zoom intensity (absolute value - direction doesn't matter)
    const zoomIntensity = Math.abs(zoomVelocity) * ZOOM_SENSITIVITY;

    // Only apply effects if actively zooming (lowered threshold for more sensitivity)
    if (Math.abs(zoomVelocity) > 0.0005) {
        // EXTREME SLOW MOTION EFFECT: The faster you zoom, the slower the music gets
        // Much more aggressive slow motion feel
        const slowMotionFactor = Math.min(zoomIntensity, 0.85); // Higher cap for more dramatic effect

        targetPlaybackRate = 1.0 - slowMotionFactor; // Subtract from 1.0 to slow down
        targetVolume = 1.0 - (slowMotionFactor * MAX_VOLUME_REDUCTION); // Reduce volume for dramatic effect

        // Ensure we don't go below minimum values
        targetPlaybackRate = Math.max(MIN_SLOW_MOTION, targetPlaybackRate);
        targetVolume = Math.max(0.1, targetVolume); // Allow even lower volume

        console.log(`🎬 EXTREME SLOW MOTION: velocity ${zoomVelocity.toFixed(4)}, intensity ${zoomIntensity.toFixed(4)}, target rate ${targetPlaybackRate.toFixed(3)}`);
    }

    // Gradual return to normal speed when not zooming
    targetPlaybackRate = targetPlaybackRate * DECAY_RATE + 1.0 * (1 - DECAY_RATE);
    targetVolume = targetVolume * DECAY_RATE + 1.0 * (1 - DECAY_RATE);

    // SUPER FAST interpolation for immediate response and quick bounce back
    currentPlaybackRate += (targetPlaybackRate - currentPlaybackRate) * 0.35;
    currentVolume += (targetVolume - currentVolume) * 0.35;

    // Apply effects - combine zoom and scrub effects
    if (backgroundMusic) {
        let finalRate;

        if (isScrubbing) {
            // Scrubbing takes priority over zoom effects
            finalRate = targetScrubRate;
        } else {
            // Normal zoom slow motion effects
            finalRate = Math.max(MIN_SLOW_MOTION, Math.min(2.0, currentPlaybackRate));
        }

        backgroundMusic.playbackRate = Math.abs(finalRate); // Ensure positive rate

        // Update visual indicator with DRAMATIC effects (only if not scrubbing)
        if (audioIndicator && !isScrubbing) {
            const displayRate = Math.abs(finalRate);
            audioIndicator.textContent = `${displayRate.toFixed(2)}x`;

            // EXTREME visual feedback
            if (displayRate < 0.95) {
                // Slow motion - MUCH more dramatic colors and effects
                const slowness = (1.0 - displayRate) / (1.0 - MIN_SLOW_MOTION); // 0 to 1

                // More dramatic color transitions
                if (displayRate < 0.3) {
                    // EXTREME slow motion - deep red/purple
                    audioIndicator.style.backgroundColor = `rgba(200, 20, 255, 0.95)`;
                    audioIndicator.style.color = 'white';
                    audioIndicator.style.transform = 'scale(1.2)';
                    audioIndicator.style.boxShadow = '0 0 20px rgba(200, 20, 255, 0.8)';
                } else if (displayRate < 0.6) {
                    // Heavy slow motion - bright purple
                    audioIndicator.style.backgroundColor = `rgba(150, 50, 255, 0.9)`;
                    audioIndicator.style.color = 'white';
                    audioIndicator.style.transform = 'scale(1.1)';
                    audioIndicator.style.boxShadow = '0 0 15px rgba(150, 50, 255, 0.6)';
                } else {
                    // Light slow motion - blue
                    audioIndicator.style.backgroundColor = `rgba(100, 100, 255, 0.8)`;
                    audioIndicator.style.color = 'white';
                    audioIndicator.style.transform = 'scale(1.05)';
                    audioIndicator.style.boxShadow = '0 0 10px rgba(100, 100, 255, 0.4)';
                }
            } else {
                // Normal speed
                audioIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                audioIndicator.style.color = 'white';
                audioIndicator.style.transform = 'scale(1.0)';
                audioIndicator.style.boxShadow = 'none';
            }
        }

        // Log significant changes
        if (Math.abs(finalRate - 1.0) > 0.05) {
            console.log(`AUDIO EFFECT APPLIED: ${finalRate.toFixed(3)}x ${isScrubbing ? '(SCRUBBING)' : '(SLOW MOTION)'}`);
        }
    }

    if (gainNode) {
        const newVolume = Math.max(0.1, Math.min(2.0, currentVolume));
        gainNode.gain.value = newVolume;
    }
}



function animate() {
  raycaster.setFromCamera( pointer, camera );

  // Reset all colors first
  for (let obj of intersectObjects) {
    if (obj.material) {
    //   console.log(`Object ${obj.name} current color:`, obj.material.color);
    }
  }

  const intersects = raycaster.intersectObjects( intersectObjects );

  if (intersects.length > 0) {
    document.body.style.cursor = "pointer";
    intersectObject = intersects[0].object.parent.name;
    // Debug logging (only occasionally to avoid spam)
    if (Math.random() < 0.01) {
      console.log('Hovering over:', intersectObject);
    }
  } else {
    document.body.style.cursor = "default";
    intersectObject = "";
  }

  // Update animations and bounding boxes
  updateStars();
  updateTape();
  updateBoundingBoxes();

  // Update zoom-based audio effects
  updateZoomEffects();

  // Update horizontal panning audio effects (DJ scrubbing)
  updatePanningEffects();

  // Update shader time uniform for animated grain
  const time = Date.now() * 0.001;
  retroPass.uniforms.time.value = time;
  
  // Check for collisions using bounding boxes
  checkStarCollisionsBoundingBox();
  checkTapeCollision();

  // Use composer instead of direct renderer for post-processing
  composer.render();
}

renderer.setAnimationLoop( animate );