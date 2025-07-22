import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const scene = new THREE.Scene();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

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
    vec3 darkBlue = vec3(0.043, 0.078, 0.149);     // Top - Dark navyrgba(11, 20, 38, 0.39)
    vec3 purpleBlue = vec3(0.153, 0.204, 0.376);   // Upper mid - Purple-bluergba(39, 73, 96, 0.39)
    vec3 skyPurple = vec3(0.404, 0.549, 0.804);    // Middle - Sky blue-purple (hue 212) #678CCD
    vec3 lightSkyBlue = vec3(0.529, 0.729, 0.922); // Lower mid - Light sky blue #87BAEB
    vec3 paleBlue = vec3(0.678, 0.847, 0.949);     // Above horizon - Pale sky bluergb(229, 173, 242)
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
    moveDistance: 2.5,
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
    'scanlineIntensity': { value: 0.05 },
    'grainIntensity': { value: 0.05 },
    'vignetteIntensity': { value: 0.01 }
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
      float aberration = 0.002;
      color.r = texture2D(tDiffuse, vUv + vec2(aberration, 0.0)).r;
      color.b = texture2D(tDiffuse, vUv - vec2(aberration, 0.0)).b;
    
      
      // Retro color grading (boost magentas/cyans)
      color.r = pow(color.r, 0.9);
      color.g = pow(color.g, 0.9);
      color.b = pow(color.b, 0.3);
      
      float luminance = dot(color.rgb, vec3(0.3, 0.5, 0.2));
      vec3 grayscale = vec3(luminance);
      color.rgb = mix(color.rgb, grayscale, 0.4); 
      
      color.rgb *= 1.3;

      gl_FragColor = color;
    }
  `
};

const modalContent = {
  "tape":{
    title: "title",
    content: "this is content",
    link: "https://www.youtube.com/@RIIZE_official",
  }
}

const modal = document.querySelector(".modal");
const modalTitle = document.querySelector(".modal-title");
const modalProjectDescription = document.querySelector(".modal-project-description"); 
const modalExitButton = document.querySelector(".modal-button"); 
const modalVisit = document.querySelector(".modal-visit-button");

if (modalExitButton) {
    modalExitButton.addEventListener("click", hideModal);
}

function showModal(id) {
  const content = modalContent[id];
  if(content && modal){
    modalTitle.textContent = content.title;
    modalProjectDescription.textContent = content.content;
    if(content.link && modalVisit){
        modalVisit.href = content.link;
        modalVisit.classList.remove('hidden');
    } else if(modalVisit) {
        modalVisit.classList.add('hidden');
    }
    modal.classList.toggle("hidden");
  }
}

function hideModal (){
    if(modal) {
        modal.classList.toggle("hidden");
    }
}

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
        child.material.color = new THREE.Color().setHex(0xA7C5E6);
    }
    if(child.name === "Plane_1"){
        // change the color of the riize logo
        child.material.color = new THREE.Color().setHex(0xD7F1FE);
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

const helper = new THREE.DirectionalLightHelper( sun, 10 );
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
        console.log('Tape bounced!');
    }
}

function bounceTape() {
    if (!tape.instance || tape.isAnimating) return;
    
    tape.isAnimating = true;
    
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
            console.log(`Star ${starObject.name} collected via bounding box collision!`);
        }
    });
}

function collectStar(starObject) {
    if (stars.collected.has(starObject.name)) return;
    
    stars.collected.add(starObject.name);
    console.log(`Collected ${starObject.name}!`);
    
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
    document.body.style.cursor = "pointer";
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