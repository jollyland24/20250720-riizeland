import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

scene.background = new THREE.Color(0xC2A1BE); // Sky blue - change the hex code to any color you want

const canvas = document.getElementById("experience-canvas")
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
renderer.toneMappingExposure = 1.5


const modalContent = {
  "tape":{
    title: "title",
    content: "this is content",
    link: "https://www.youtube.com/@RIIZE_official",
  }
}

const modal = document.querySelector(".modal")
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
  })
  scene.add( glb.scene );
  console.log('GLTF loaded successfully');
}, undefined, function ( error ) {
   console.error( 'GLTF loading error:', error );
} );

const sun = new THREE.DirectionalLight( 0xFFFFFF);
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

const helper = new THREE.DirectionalLightHelper( sun, 5 );
// scene.add( helper ); // Commented out to hide directional light helper lines

const light = new THREE.AmbientLight( 0xFFE2FD, 2); 
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
};

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
    
    // Make the hovered object red
    // intersects[0].object.material.color.set(0xff0000);
  } else {
    document.body.style.cursor = "default";
    intersectObject = "";
  }

  // Update animations and bounding boxes
  updateStars();
  updateTape(); // Add tape spinning animation
  updateBoundingBoxes();
  
  // Check for collisions using bounding boxes
  checkStarCollisionsBoundingBox();
  checkTapeCollision();

  renderer.render( scene, camera );
};
renderer.setAnimationLoop( animate );