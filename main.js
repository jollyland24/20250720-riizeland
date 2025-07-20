import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const scene = new THREE.Scene();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const t1 = gsap.timeline()

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
modalExitButton.addEventListener("click", hideModal);

function showModal(id) {
  const content = modalContent[id];
  if(content){
    modalTitle.textContent = content.title;
    modalProjectDescription.textContent = content.content;
    if(content){
        modalVisit.href = content.link;
        modalVisit.classList.remove('hidden');
    } else {
        modalVisit.classList.add('hidden');
    }
    modal.classList.toggle("hidden");
  }
}

function hideModal (){
    modal.classList.toggle("hidden");
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
const loader = new GLTFLoader();

loader.load( './export.glb', function ( glb ) {
  glb.scene.traverse(child=>{
     console.log(child.name);
    if(intersectObjectsNames.includes(child.name)){
      intersectObjects.push(child);
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
    }
  })
  scene.add( glb.scene );
}, undefined, function ( error ) {
   console.error( error );
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
scene.add( shadowHelper );

const helper = new THREE.DirectionalLightHelper( sun, 5 );
scene.add( helper );

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
    character.isMoving = true;
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
    },
    0
    );

    t1.to(character.instance.position, {
        y: character.instance.position.y + character.jumpHeight,

        duration: character.moveDuration / 2,
        yoyo: true,
        repeat: 1,
    },
    0
    );

    // Add onComplete callback to reset movement flag
    t1.call(() => {
        character.isMoving = false;
    });
}

function onKeyDown(event) {
    if(character.isMoving) return;
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
    intersectObject = intersects[0].object.parent.name; // Move this line here
    
    // Make the hovered object red
    // intersects[0].object.material.color.set(0xff0000);
  } else {
    document.body.style.cursor = "default";
    intersectObject = "";
  }

  renderer.render( scene, camera );
};
renderer.setAnimationLoop( animate );

