import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const scene = new THREE.Scene();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const bounceSound = new Audio('./sound_tape.wav');
bounceSound.preload = 'auto';
const collectSound = new Audio('./sound_star.wav')
collectSound.preload = 'auto';
const changeSound = new Audio('./sound_change.mp3')
changeSound.preload = 'auto';

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
    console.log(intersectObject);
    if(intersectObject !== ""){
        showModal(intersectObject);
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
window.addEventListener("keydown", onKeyDown)



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
    document.body.style.cursor = "default";
    intersectObject = intersects[0].object.parent.name;
  } else {
    document.body.style.cursor = "default";
    intersectObject = "";
  }

  // Update animations and bounding boxes
  updateStars();
  updateTape();
  updateBoundingBoxes();
  
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