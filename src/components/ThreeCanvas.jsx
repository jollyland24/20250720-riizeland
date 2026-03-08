import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import gsap from 'gsap';

const ThreeCanvas = forwardRef(function ThreeCanvas(
  { onMemberReveal, onAllMembersUnlocked, onAudioIndicatorUpdate, onPlayStateChange, onSongChange },
  ref
) {
  const canvasRef = useRef();

  // Stable refs to always-current callbacks (avoids stale closures in animation loop)
  const callbackRef = useRef({});
  callbackRef.current = { onMemberReveal, onAllMembersUnlocked, onAudioIndicatorUpdate, onPlayStateChange, onSongChange };

  // Imperative handles — populated inside useEffect, exposed via ref
  const captureSceneRef = useRef();
  const togglePlayRef = useRef();
  const stopMusicRef = useRef();
  const changeModelRef = useRef();
  const nextSongRef = useRef();
  const switchViewRef = useRef();

  useImperativeHandle(ref, () => ({
    captureScene: () => captureSceneRef.current?.(),
    togglePlay: () => togglePlayRef.current?.(),
    stop: () => stopMusicRef.current?.(),
    changeModel: (modelName) => changeModelRef.current?.(modelName),
    nextSong: () => nextSongRef.current?.(),
    switchView: (view) => switchViewRef.current?.(view),
  }));

  useEffect(() => {
    const canvas = canvasRef.current;

    // ─── Audio indicator proxy ────────────────────────────────────────────────
    // Behaves like the original DOM element but calls the React callback instead.
    const indicatorState = {
      textContent: '1.00x',
      style: { backgroundColor: '', color: '', transform: '', boxShadow: '' },
    };
    const flushIndicator = () => {
      callbackRef.current.onAudioIndicatorUpdate?.(indicatorState.textContent, {
        ...indicatorState.style,
      });
    };
    const audioIndicator = {
      get textContent() { return indicatorState.textContent; },
      set textContent(v) { indicatorState.textContent = v; flushIndicator(); },
      style: new Proxy(indicatorState.style, {
        set(target, key, value) {
          target[key] = value;
          flushIndicator();
          return true;
        },
      }),
    };

    // ─── Audio setup ──────────────────────────────────────────────────────────
    const bounceSound = new Audio('/sound_tape.wav');
    bounceSound.preload = 'auto';
    const collectSound = new Audio('/sound_star.wav');
    collectSound.preload = 'auto';
    const changeSound = new Audio('/sound_change.mp3');
    changeSound.preload = 'auto';
    const scratchSound = new Audio('/babyscratch-87371.mp3');
    scratchSound.preload = 'auto';

    const backgroundMusic = new Audio('/RIIZE Odyssey Instrumental.mp3');
    backgroundMusic.loop = true;
    backgroundMusic.preload = 'auto';

    let isPlaying = false;

    const songList = [
      { name: 'RIIZE Odyssey Instrumental',         file: '/RIIZE Odyssey Instrumental.mp3' },
      { name: 'RIIZE Bag Bad Back Instrumental',     file: '/RIIZE Bag Bad Back Instrumental.mp3' },
      { name: 'RIIZE Ember to Solar Instrumental',  file: '/RIIZE Ember to Solar Instrumental.mp3' },
      { name: 'RIIZE Fly Up Instrumental',           file: '/RIIZE Fly Up Instrumental.mp3' },
      { name: 'RIIZE Midnight Mirage Instrumental', file: '/RIIZE Midnight Mirage Instrumental.mp3' },
    ];
    let currentSongIndex = 0;

    // Zoom-audio effect variables
    let previousZoom = 0.6;
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
    let scrubCooldown = 300;

    // Positional scrubbing state
    let isScrubbing = false;
    let scrubDirection = null;
    let scrubSensitivity = 3.0;
    let scrubSpeed = 3.0;
    let targetScrubRate = 1.0;
    let accumulatedScrubDistance = 0;

    // Scratch sound control
    let scratchIntensity = 0;
    let maxScratchIntensity = 0;
    let scratchFadeTimeout = null;

    // Web Audio API
    let audioContext = null;
    let gainNode = null;
    let sourceNode = null;

    // Effect settings
    const ZOOM_SENSITIVITY = 25.0;
    const MIN_SLOW_MOTION = 0.15;
    const MAX_VOLUME_REDUCTION = 0.8;
    const DECAY_RATE = 0.70;

    // ─── Three.js scene ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const characterModels = {
      totalStars: 5,
      allCollected: false,
      currentModel: 'simplehead',
      availableModels: {
        simplehead: 'export',
        sungchan: '/sungchan.glb',
        eunseok: '/eunseok.glb',
        shotaro: '/shotaro.glb',
        sohee: '/sohee.glb',
        anton: '/anton.glb',
      },
    };

    // Background gradient shader
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
        vec3 darkBlue = vec3(0.12, 0.33, 0.39);
        vec3 purpleBlue = vec3(0.37, 0.61, 0.68);
        vec3 skyPurple = vec3(0.47, 0.61, 0.68);
        vec3 lightSkyBlue = vec3(0.88, 0.70, 0.28);
        vec3 paleBlue = vec3(0.98, 0.82, 0.43);
        vec3 nearWhite = vec3(0.95, 0.97, 1.0);

        if (y > 0.75) {
          float factor = (y - 0.75) * 4.0;
          return mix(purpleBlue, darkBlue, factor);
        } else if (y > 0.5) {
          float factor = (y - 0.5) * 4.0;
          return mix(skyPurple, purpleBlue, factor);
        } else if (y > 0.3) {
          float factor = (y - 0.3) * 5.0;
          return mix(lightSkyBlue, skyPurple, factor);
        } else if (y > 0.1) {
          float factor = (y - 0.1) * 5.0;
          return mix(paleBlue, lightSkyBlue, factor);
        } else {
          float factor = y * 10.0;
          return mix(nearWhite, paleBlue, factor);
        }
      }

      void main() {
        vec3 color = getGradientColor(vUv.y);
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const bgGeometry = new THREE.PlaneGeometry(2, 2);
    const bgMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader });
    const backgroundPlane = new THREE.Mesh(bgGeometry, bgMaterial);
    backgroundPlane.renderOrder = -1;
    backgroundPlane.frustumCulled = false;
    scene.add(backgroundPlane);
    scene.background = null;
    scene.fog = new THREE.FogExp2(0xEAD7FF, 0.001);

    const sizes = { width: window.innerWidth, height: window.innerHeight };

    let character = {
      instance: null,
      moveDistance: 8,
      jumpHeight: 2,
      isMoving: false,
      moveDuration: 0.1,
    };

    const stars = {
      objects: [],
      collected: new Set(),
      spinSpeed: 0.02,
      collectionDistance: 3.0,
    };

    const boundingBoxes = {
      character: null,
      characterHelper: null,
      starHelpers: [],
      showHelpers: false,
    };

    const tape = {
      instance: null,
      boundingBox: null,
      helper: null,
      originalPosition: null,
      isAnimating: false,
      bounceHeight: 8,
      bounceDuration: 1.2,
      spinSpeed: 0.01,
    };

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    // VHS/retro post-processing shader
    const retroShader = {
      uniforms: {
        tDiffuse: { value: null },
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(sizes.width, sizes.height) },
        scanlineIntensity: { value: 0.03 },
        grainIntensity: { value: 0.05 },
        vignetteIntensity: { value: 0.005 },
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

        float random(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec4 color = texture2D(tDiffuse, vUv);

          float scanline = sin(vUv.y * resolution.y * 1.5) * scanlineIntensity;
          color.rgb -= vec3(scanline);

          float grain = (random(vUv + time * 0.5) - 0.5) * grainIntensity;
          grain += (random(vUv * 2.0 + time) - 0.5) * grainIntensity * 0.5;
          color.rgb += vec3(grain);

          float aberration = 0.001;
          color.r = texture2D(tDiffuse, vUv + vec2(aberration, 0.0)).r;
          color.b = texture2D(tDiffuse, vUv - vec2(aberration, 0.0)).b;

          color.r = pow(color.r, 0.95);
          color.g = pow(color.g, 0.9);
          color.b = pow(color.b, 0.5);

          float luminance = dot(color.rgb, vec3(0.3, 0.5, 0.2));
          vec3 grayscale = vec3(luminance);
          color.rgb = mix(color.rgb, grayscale, 0.45);

          color.rgb *= 1.25;

          gl_FragColor = color;
        }
      `,
    };

    let intersectObject = '';
    const intersectObjects = [];
    const intersectObjectsNames = ['star001', 'star002', 'star003', 'star004', 'star005', 'tape'];
    const starNames = ['star001', 'star002', 'star003', 'star004', 'star005'];

    const loader = new GLTFLoader();
    loader.load('/export.glb', function (glb) {
      glb.scene.traverse((child) => {
        if (intersectObjectsNames.includes(child.name)) {
          intersectObjects.push(child);
        }

        if (starNames.includes(child.name)) {
          const starObject = {
            mesh: child,
            name: child.name,
            originalPosition: child.position.clone(),
            boundingBox: new THREE.Box3(),
            helper: null,
          };
          stars.objects.push(starObject);
          if (boundingBoxes.showHelpers) {
            starObject.helper = new THREE.Box3Helper(starObject.boundingBox, 0x00ff00);
            scene.add(starObject.helper);
            boundingBoxes.starHelpers.push(starObject.helper);
          }
        }

        if (child.name === 'tape') {
          tape.instance = child;
          tape.originalPosition = child.position.clone();
          tape.boundingBox = new THREE.Box3();
          child.traverse((meshChild) => {
            if (meshChild.isMesh && !intersectObjects.includes(meshChild)) {
              intersectObjects.push(meshChild);
            }
          });
          if (boundingBoxes.showHelpers) {
            tape.helper = new THREE.Box3Helper(tape.boundingBox, 0xffff00);
            scene.add(tape.helper);
          }
        }

        if (child.isMesh) {
          if (child.material) child.material = child.material.clone();
          child.castShadow = true;
          child.receiveShadow = true;
        }

        if (child.name === 'simplehead') {
          character.instance = child;
          character.originalSimplehead = child;
          boundingBoxes.character = new THREE.Box3();
          if (boundingBoxes.showHelpers) {
            boundingBoxes.characterHelper = new THREE.Box3Helper(boundingBoxes.character, 0xff0000);
            scene.add(boundingBoxes.characterHelper);
          }
        }

        if (child.name === 'Plane') child.material.color = new THREE.Color().setHex(0xFFBA66);
        if (child.name === 'Plane_1') child.material.color = new THREE.Color().setHex(0xFBA339);
        if (child.name.toLowerCase().startsWith('star')) {
          child.material.color = new THREE.Color().setHex(0xf7f027);
        }
      });
      scene.add(glb.scene);
    });

    // Lights
    const sun = new THREE.DirectionalLight(0xffffff);
    sun.castShadow = true;
    sun.position.set(-50, 50, 0);
    sun.shadow.mapSize.width = 4096;
    sun.shadow.mapSize.height = 4096;
    sun.shadow.camera.left = -150;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.normalBias = 0.2;
    scene.add(sun);

    const light = new THREE.AmbientLight(0xffffff, 3);
    scene.add(light);

    // Camera
    const aspect = sizes.width / sizes.height;
    const camera = new THREE.OrthographicCamera(
      -aspect * 50, aspect * 50, 50, -50, 0.1, 1000
    );
    scene.add(camera);
    camera.position.set(29, 52, 82);
    camera.zoom = 0.6;
    camera.updateProjectionMatrix();

    // Post-processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const retroPass = new ShaderPass(retroShader);
    composer.addPass(retroPass);

    // Orbit controls
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minAzimuthAngle = -Math.PI / 6;
    controls.maxAzimuthAngle = Math.PI / 6;
    controls.minPolarAngle = Math.PI / 3;
    controls.maxPolarAngle = Math.PI / 2;
    controls.minZoom = 0.5;
    controls.maxZoom = 1.5;

    // ─── View switching ───────────────────────────────────────────────────────
    let currentView = 'explore';

    function switchView(view) {
      currentView = view;
      if (view === 'character') {
        const char = character.instance;
        const cx = char ? char.position.x : 0;
        const cy = char ? char.position.y : 0;
        const cz = char ? char.position.z : 0;

        // Freeze OrbitControls so damping doesn't fight the GSAP animation
        controls.enabled = false;

        const tl = gsap.timeline({
          onComplete: () => {
            controls.target.set(cx, cy + 1, cz);
            controls.minAzimuthAngle = -Math.PI / 3;
            controls.maxAzimuthAngle = Math.PI / 3;
            controls.minPolarAngle = Math.PI * 0.42;
            controls.maxPolarAngle = Math.PI * 0.58;
            controls.minZoom = 1.8;
            controls.maxZoom = 2.8;
            controls.enabled = true;
            controls.update();
          },
        });

        // Phase 1 — pull toward the character from above (zoom out slightly, drift in)
        tl.to(camera.position, {
          x: cx + 18,
          y: cy + 38,
          z: cz + 22,
          duration: 1.1,
          ease: 'power2.in',
        });
        tl.to(camera, {
          zoom: 0.75,
          duration: 1.1,
          ease: 'power2.in',
          onUpdate: () => camera.updateProjectionMatrix(),
        }, 0);
        tl.to(controls.target, {
          x: cx, y: cy + 1, z: cz,
          duration: 1.1,
          ease: 'power2.in',
        }, 0);

        // Phase 2 — swoop down to eye level
        tl.to(camera.position, {
          x: cx + 7,
          y: cy + 2,
          z: cz + 7,
          duration: 1.6,
          ease: 'power3.inOut',
        });
        tl.to(camera, {
          zoom: 2.2,
          duration: 1.6,
          ease: 'power2.inOut',
          onUpdate: () => camera.updateProjectionMatrix(),
        }, '-=1.6');
      } else {
        controls.enabled = false;

        const tl = gsap.timeline({
          onComplete: () => {
            controls.minAzimuthAngle = -Math.PI / 6;
            controls.maxAzimuthAngle = Math.PI / 6;
            controls.minPolarAngle = Math.PI / 3;
            controls.maxPolarAngle = Math.PI / 2;
            controls.minZoom = 0.5;
            controls.maxZoom = 1.5;
            controls.enabled = true;
            controls.update();
          },
        });

        tl.to(camera.position, {
          x: 29, y: 52, z: 82,
          duration: 1.8,
          ease: 'power2.inOut',
        });
        tl.to(camera, {
          zoom: 0.6,
          duration: 1.8,
          ease: 'power2.inOut',
          onUpdate: () => camera.updateProjectionMatrix(),
        }, 0);
        tl.to(controls.target, {
          x: 0, y: 0, z: 0,
          duration: 1.8,
          ease: 'power2.inOut',
        }, 0);
      }
    }

    switchViewRef.current = switchView;

    // ─── Scene capture (exposed via ref) ─────────────────────────────────────
    captureSceneRef.current = () => {
      return new Promise((resolve) => {
        document.body.classList.add('capturing');
        requestAnimationFrame(() => {
          composer.render();
          try {
            const renderTarget = composer.renderTarget2 || composer.writeBuffer;
            const gl = renderer.getContext();
            gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.framebuffer);
            const pixels = new Uint8Array(renderTarget.width * renderTarget.height * 4);
            gl.readPixels(0, 0, renderTarget.width, renderTarget.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);

            const captureCanvas = document.createElement('canvas');
            captureCanvas.width = renderTarget.width;
            captureCanvas.height = renderTarget.height;
            const ctx = captureCanvas.getContext('2d');
            const imageData = ctx.createImageData(captureCanvas.width, captureCanvas.height);
            for (let y = 0; y < captureCanvas.height; y++) {
              for (let x = 0; x < captureCanvas.width; x++) {
                const srcIndex = ((captureCanvas.height - y - 1) * captureCanvas.width + x) * 4;
                const dstIndex = (y * captureCanvas.width + x) * 4;
                imageData.data[dstIndex]     = pixels[srcIndex];
                imageData.data[dstIndex + 1] = pixels[srcIndex + 1];
                imageData.data[dstIndex + 2] = pixels[srcIndex + 2];
                imageData.data[dstIndex + 3] = 255;
              }
            }
            ctx.putImageData(imageData, 0, 0);
            captureCanvas.toBlob((blob) => {
              document.body.classList.remove('capturing');
              resolve(blob);
            }, 'image/jpeg', 0.9);
          } catch (error) {
            console.warn('WebGL readPixels failed, using canvas fallback:', error);
            const captureCanvas = document.createElement('canvas');
            captureCanvas.width = renderer.domElement.width;
            captureCanvas.height = renderer.domElement.height;
            const ctx = captureCanvas.getContext('2d');
            try {
              ctx.drawImage(renderer.domElement, 0, 0);
            } catch (e) {
              ctx.fillStyle = '#ff0000';
              ctx.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
            }
            captureCanvas.toBlob((blob) => {
              document.body.classList.remove('capturing');
              resolve(blob);
            }, 'image/jpeg', 0.9);
          }
        });
      });
    };

    // ─── Tape interaction ─────────────────────────────────────────────────────
    function showModal(objectName) {
      if (objectName === 'tape') {
        switchToNextSong();
      }
    }

    function bounceTape() {
      if (!tape.instance || tape.isAnimating) return;
      tape.isAnimating = true;
      bounceSound.currentTime = 0;
      bounceSound.play().catch(() => {});

      const bounceTimeline = gsap.timeline({ onComplete: () => { tape.isAnimating = false; } });
      bounceTimeline.to(tape.instance.position, {
        y: tape.originalPosition.y + tape.bounceHeight,
        duration: tape.bounceDuration * 0.4,
        ease: 'power3.out',
      });
      bounceTimeline.to(tape.instance.position, {
        y: tape.originalPosition.y,
        duration: tape.bounceDuration * 0.6,
        ease: 'bounce.out',
      });
      bounceTimeline.to(tape.instance.rotation, {
        y: tape.instance.rotation.y + Math.PI * 2,
        duration: tape.bounceDuration,
        ease: 'power2.inOut',
      }, 0);
    }

    function checkTapeCollision() {
      if (!character.instance || !boundingBoxes.character || !tape.instance || tape.isAnimating) return;
      if (boundingBoxes.character.intersectsBox(tape.boundingBox)) {
        bounceTape();
      }
    }

    // ─── Star collection ──────────────────────────────────────────────────────
    function showNextMember(collectedCount) {
      if (collectedCount > 0 && collectedCount <= 5) {
        callbackRef.current.onMemberReveal?.(collectedCount);
      }
      checkAllStarsCollected();
    }

    function checkAllStarsCollected() {
      const collectedCount = stars.collected.size;
      const wasAllCollected = characterModels.allCollected;
      characterModels.allCollected = collectedCount >= characterModels.totalStars;

      if (characterModels.allCollected && !wasAllCollected) {
        gsap.to(camera, {
          zoom: 1.0,
          duration: 2,
          ease: 'power2.inOut',
          onUpdate: () => { camera.updateProjectionMatrix(); },
        });

        callbackRef.current.onAllMembersUnlocked?.();
      }
      return characterModels.allCollected;
    }

    function collectStar(starObject) {
      if (stars.collected.has(starObject.name)) return;
      stars.collected.add(starObject.name);
      showNextMember(stars.collected.size);

      collectSound.currentTime = 0;
      collectSound.play().catch(() => {});

      if (starObject.helper) starObject.helper.visible = false;

      const disappearTimeline = gsap.timeline();
      disappearTimeline.to(starObject.mesh.scale, {
        x: 0, y: 0, z: 0,
        duration: 0.3,
        ease: 'back.in(1.7)',
      });
      disappearTimeline.to(starObject.mesh.position, {
        y: starObject.originalPosition.y + 2,
        duration: 0.15,
        ease: 'power2.out',
      }, 0);
      disappearTimeline.call(() => { starObject.mesh.visible = false; });
    }

    function checkStarCollisionsBoundingBox() {
      if (!character.instance || !boundingBoxes.character) return;
      stars.objects.forEach((starObject) => {
        if (stars.collected.has(starObject.name) || !starObject.mesh.visible) return;
        if (boundingBoxes.character.intersectsBox(starObject.boundingBox)) {
          collectStar(starObject);
        }
      });
    }

    // ─── Character model ──────────────────────────────────────────────────────
    function changeCharacterModel(modelName) {
      if (!characterModels.allCollected || !characterModels.availableModels[modelName]) return;

      const currentPosition = character.instance
        ? character.instance.position.clone()
        : new THREE.Vector3(0, 0, 0);
      const currentRotation = character.instance
        ? character.instance.rotation.clone()
        : new THREE.Euler(0, 0, 0);

      if (character.instance) {
        if (characterModels.currentModel === 'simplehead') {
          character.instance.visible = false;
        } else {
          scene.remove(character.instance);
        }
      }

      changeSound.currentTime = 0;
      changeSound.play().catch(() => {});

      if (modelName === 'simplehead') {
        scene.traverse((child) => {
          if (child.name === 'simplehead') {
            character.instance = child;
            character.instance.position.copy(currentPosition);
            character.instance.rotation.copy(currentRotation);
            character.instance.visible = true;
            characterModels.currentModel = modelName;
          }
        });
      } else {
        const modelLoader = new GLTFLoader();
        modelLoader.load(
          characterModels.availableModels[modelName],
          function (glb) {
            const newCharacter = glb.scene;
            newCharacter.position.copy(currentPosition);
            newCharacter.rotation.copy(currentRotation);
            character.instance = newCharacter;
            characterModels.currentModel = modelName;
            newCharacter.traverse((child) => {
              if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            scene.add(newCharacter);
          },
          undefined,
        );
      }
    }

    // Expose changeModel via ref
    changeModelRef.current = changeCharacterModel;

    // ─── Character movement ───────────────────────────────────────────────────
    function moveCharacter(targetPosition, targetRotation) {
      if (!character.instance) return;
      character.isMoving = true;
      const t1 = gsap.timeline({ onComplete: () => { character.isMoving = false; } });
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
    }

    // ─── Bounding boxes ───────────────────────────────────────────────────────
    function updateBoundingBoxes() {
      if (character.instance && boundingBoxes.character) {
        boundingBoxes.character.setFromObject(character.instance);
        if (boundingBoxes.characterHelper) {
          boundingBoxes.characterHelper.box = boundingBoxes.character;
        }
      }
      if (tape.instance && tape.boundingBox) {
        tape.boundingBox.setFromObject(tape.instance);
        if (tape.helper) tape.helper.box = tape.boundingBox;
      }
      stars.objects.forEach((starObject) => {
        if (starObject.mesh.visible && !stars.collected.has(starObject.name)) {
          starObject.boundingBox.setFromObject(starObject.mesh);
          if (starObject.helper) starObject.helper.box = starObject.boundingBox;
        }
      });
    }

    function updateStars() {
      stars.objects.forEach((starObject) => {
        if (stars.collected.has(starObject.name) || !starObject.mesh.visible) return;
        starObject.mesh.rotation.y += stars.spinSpeed;
        starObject.mesh.rotation.x += stars.spinSpeed * 0.5;
        starObject.mesh.position.y =
          starObject.originalPosition.y +
          Math.sin(Date.now() * 0.002 + starObject.mesh.position.x) * 0.5;
      });
    }

    function updateTape() {
      if (!tape.instance || tape.isAnimating) return;
      tape.instance.rotation.y += tape.spinSpeed;
    }

    // ─── Audio: audio indicator helpers ──────────────────────────────────────
    function updateScrubVisuals() {
      if (!audioIndicator) return;
      const currentTime = backgroundMusic.currentTime;
      if (scrubDirection === 'LEFT') {
        audioIndicator.textContent = `◀ ${currentTime.toFixed(1)}s`;
        audioIndicator.style.backgroundColor = 'rgba(255, 100, 0, 0.9)';
        audioIndicator.style.boxShadow = '0 0 15px orange';
      } else {
        audioIndicator.textContent = `${currentTime.toFixed(1)}s ▶`;
        audioIndicator.style.backgroundColor = 'rgba(0, 200, 100, 0.9)';
        audioIndicator.style.boxShadow = '0 0 15px lime';
      }
      const pulse = 1.1 + Math.sin(Date.now() * 0.02) * 0.1;
      audioIndicator.style.transform = `scale(${pulse})`;
    }

    function endScrubEffect() {
      isScrubbing = false;
      scrubDirection = null;
      targetScrubRate = 1.0;
      accumulatedScrubDistance = 0;
      scratchIntensity = 0;
      maxScratchIntensity = 0;
      if (audioIndicator) {
        audioIndicator.textContent = '1.00x';
        audioIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        audioIndicator.style.transform = 'scale(1.0)';
        audioIndicator.style.boxShadow = 'none';
      }
    }

    function updateScratchSound(intensity) {
      const volume = Math.min(1.0, intensity * 50);
      if (!scratchSound.paused && scratchSound.currentTime > 0) {
        scratchSound.volume = volume;
      } else if (volume > 0.1) {
        scratchSound.currentTime = 0;
        scratchSound.volume = volume;
        scratchSound.play().catch(() => {});
      }
    }

    function startScratchFade() {
      scratchFadeTimeout = setTimeout(() => {
        if (scratchSound && !scratchSound.paused) {
          const fadeInterval = setInterval(() => {
            if (scratchSound.volume > 0.1) {
              scratchSound.volume = Math.max(0, scratchSound.volume - 0.1);
            } else {
              scratchSound.pause();
              scratchSound.volume = 1.0;
              clearInterval(fadeInterval);
            }
          }, 20);
        }
        endScrubEffect();
      }, 200);
    }

    function updatePanningEffects() {
      if (!isPlaying) return;
      currentAzimuth = controls.getAzimuthalAngle();
      azimuthVelocity = currentAzimuth - previousAzimuth;
      previousAzimuth = currentAzimuth;

      const scratchIntensity = Math.abs(azimuthVelocity);

      if (scratchIntensity > 0.005) {
        if (!isScrubbing) {
          isScrubbing = true;
          if (audioIndicator) {
            audioIndicator.textContent = 'scratch';
            audioIndicator.style.backgroundColor = 'rgba(255, 100, 0, 0.9)';
            audioIndicator.style.transform = 'scale(1.1)';
            audioIndicator.style.boxShadow = '0 0 12px orange';
          }
        }
        // Duck the music under the scratch
        if (gainNode) gainNode.gain.value = 0.15;
        updateScratchSound(scratchIntensity);
        if (scratchFadeTimeout) {
          clearTimeout(scratchFadeTimeout);
          scratchFadeTimeout = null;
        }
      } else if (isScrubbing) {
        scratchFadeTimeout = setTimeout(() => {
          isScrubbing = false;
          // Restore music volume
          if (gainNode) gainNode.gain.value = 1.0;
          if (audioIndicator) {
            audioIndicator.textContent = '1.00x';
            audioIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            audioIndicator.style.transform = 'scale(1.0)';
            audioIndicator.style.boxShadow = 'none';
          }
        }, 200);
        startScratchFade();
      }
    }

    function updateZoomEffects() {
      if (!isPlaying) return;
      currentZoom = camera.zoom;
      zoomVelocity = currentZoom - previousZoom;
      previousZoom = currentZoom;
      const zoomIntensity = Math.abs(zoomVelocity) * ZOOM_SENSITIVITY;

      if (Math.abs(zoomVelocity) > 0.0005) {
        const slowMotionFactor = Math.min(zoomIntensity, 0.85);
        targetPlaybackRate = Math.max(MIN_SLOW_MOTION, 1.0 - slowMotionFactor);
        targetVolume = Math.max(0.1, 1.0 - slowMotionFactor * MAX_VOLUME_REDUCTION);
      }

      targetPlaybackRate = targetPlaybackRate * DECAY_RATE + 1.0 * (1 - DECAY_RATE);
      targetVolume = targetVolume * DECAY_RATE + 1.0 * (1 - DECAY_RATE);
      currentPlaybackRate += (targetPlaybackRate - currentPlaybackRate) * 0.35;
      currentVolume += (targetVolume - currentVolume) * 0.35;

      if (backgroundMusic) {
        const finalRate = isScrubbing
          ? targetScrubRate
          : Math.max(MIN_SLOW_MOTION, Math.min(2.0, currentPlaybackRate));
        backgroundMusic.playbackRate = Math.abs(finalRate);

        if (audioIndicator && !isScrubbing) {
          const displayRate = Math.abs(finalRate);
          audioIndicator.textContent = `${displayRate.toFixed(2)}x`;
          if (displayRate < 0.95) {
            if (displayRate < 0.3) {
              audioIndicator.style.backgroundColor = 'rgba(200, 20, 255, 0.95)';
              audioIndicator.style.color = 'white';
              audioIndicator.style.transform = 'scale(1.2)';
              audioIndicator.style.boxShadow = '0 0 20px rgba(200, 20, 255, 0.8)';
            } else if (displayRate < 0.6) {
              audioIndicator.style.backgroundColor = 'rgba(150, 50, 255, 0.9)';
              audioIndicator.style.color = 'white';
              audioIndicator.style.transform = 'scale(1.1)';
              audioIndicator.style.boxShadow = '0 0 15px rgba(150, 50, 255, 0.6)';
            } else {
              audioIndicator.style.backgroundColor = 'rgba(100, 100, 255, 0.8)';
              audioIndicator.style.color = 'white';
              audioIndicator.style.transform = 'scale(1.05)';
              audioIndicator.style.boxShadow = '0 0 10px rgba(100, 100, 255, 0.4)';
            }
          } else {
            audioIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            audioIndicator.style.color = 'white';
            audioIndicator.style.transform = 'scale(1.0)';
            audioIndicator.style.boxShadow = 'none';
          }
        }
      }

      if (gainNode) {
        gainNode.gain.value = Math.max(0.1, Math.min(2.0, currentVolume));
      }
    }

    // ─── Audio: play / stop ───────────────────────────────────────────────────
    function initAudioContext() {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
        if (!sourceNode) {
          sourceNode = audioContext.createMediaElementSource(backgroundMusic);
          sourceNode.connect(gainNode);
        }
      }
    }

    function togglePlayStop() {
      if (isPlaying) {
        backgroundMusic.pause();
        isPlaying = false;
        callbackRef.current.onPlayStateChange?.(false);
      } else {
        initAudioContext();
        backgroundMusic.play().catch(() => {});
        isPlaying = true;
        callbackRef.current.onPlayStateChange?.(true);
      }
    }

    function stopMusic() {
      backgroundMusic.pause();
      backgroundMusic.currentTime = 0;
      isPlaying = false;
      callbackRef.current.onPlayStateChange?.(false);
      currentPlaybackRate = 1.0;
      currentVolume = 1.0;
      targetPlaybackRate = 1.0;
      targetVolume = 1.0;
      zoomVelocity = 0;
      backgroundMusic.playbackRate = 1.0;
      if (gainNode) gainNode.gain.value = 1.0;
    }

    function switchToNextSong() {
      const wasPlaying = isPlaying;
      if (isPlaying) backgroundMusic.pause();

      currentSongIndex = (currentSongIndex + 1) % songList.length;
      const newSong = songList[currentSongIndex];
      backgroundMusic.src = newSong.file;
      backgroundMusic.load();

      changeSound.currentTime = 0;
      changeSound.play().catch(() => {});

      const shortName = newSong.name.replace('RIIZE ', '').replace(' Instrumental', '');
      callbackRef.current.onSongChange?.(shortName);

      if (audioIndicator) {
        const shortName = newSong.name.replace('RIIZE ', '').replace(' Instrumental', '');
        audioIndicator.textContent = shortName;
        audioIndicator.style.backgroundColor = 'rgba(255, 215, 0, 0.9)';
        audioIndicator.style.transform = 'scale(1.3)';
        audioIndicator.style.boxShadow = '0 0 20px gold';

        setTimeout(() => {
          if (audioIndicator && !isScrubbing && Math.abs(currentPlaybackRate - 1.0) < 0.05) {
            audioIndicator.textContent = '1.00x';
            audioIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            audioIndicator.style.transform = 'scale(1.0)';
            audioIndicator.style.boxShadow = 'none';
          }
        }, 2000);
      }

      if (wasPlaying) {
        backgroundMusic.addEventListener('loadeddata', () => {
          backgroundMusic.play().catch(() => {});
        }, { once: true });
      }
    }

    // Expose play/stop/next via refs
    togglePlayRef.current = togglePlayStop;
    stopMusicRef.current = stopMusic;
    nextSongRef.current = switchToNextSong;

    // ─── Event handlers ───────────────────────────────────────────────────────
    function onResize() {
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;
      const asp = sizes.width / sizes.height;
      camera.left = -asp * 50;
      camera.right = asp * 50;
      camera.top = 50;
      camera.bottom = -50;
      camera.updateProjectionMatrix();
      renderer.setSize(sizes.width, sizes.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      composer.setSize(sizes.width, sizes.height);
      retroPass.uniforms.resolution.value.set(sizes.width, sizes.height);
    }

    function onClick() {
      if (intersectObject !== '') showModal(intersectObject);
    }

    function onPointerMove(event) {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    function onKeyDown(event) {
      if (character.isMoving || !character.instance) return;
      const targetPosition = new THREE.Vector3().copy(character.instance.position);
      let targetRotation = 0;
      switch (event.key.toLowerCase()) {
        case 'w': case 'arrowup':
          targetPosition.z -= character.moveDistance;
          targetRotation = Math.PI;
          break;
        case 's': case 'arrowdown':
          targetPosition.z += character.moveDistance;
          targetRotation = 0;
          break;
        case 'a': case 'arrowleft':
          targetPosition.x -= character.moveDistance;
          targetRotation = -Math.PI / 2;
          break;
        case 'd': case 'arrowright':
          targetPosition.x += character.moveDistance;
          targetRotation = Math.PI / 2;
          break;
        default:
          return;
      }
      moveCharacter(targetPosition, targetRotation);
    }

    window.addEventListener('resize', onResize);
    window.addEventListener('click', onClick);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', onKeyDown);

    // ─── Animation loop ───────────────────────────────────────────────────────
    function animate() {
      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObjects(intersectObjects);

      if (intersects.length > 0) {
        document.body.style.cursor = 'pointer';
        intersectObject = intersects[0].object.parent.name;
      } else {
        document.body.style.cursor = 'default';
        intersectObject = '';
      }

      updateStars();
      updateTape();
      updateBoundingBoxes();

      if (currentView === 'character' && character.instance) {
        // Lazy follow — camera drifts behind rather than snapping, feels less "game controller"
        controls.target.x += (character.instance.position.x - controls.target.x) * 0.06;
        controls.target.z += (character.instance.position.z - controls.target.z) * 0.06;
      }

      controls.update();

      if (currentView === 'explore') {
        updateZoomEffects();
        updatePanningEffects();
      }

      retroPass.uniforms.time.value = Date.now() * 0.001;

      checkStarCollisionsBoundingBox();
      checkTapeCollision();

      composer.render();
    }

    renderer.setAnimationLoop(animate);

    // ─── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('click', onClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      renderer.setAnimationLoop(null);
      backgroundMusic.pause();
      backgroundMusic.src = '';
      renderer.dispose();
    };
  }, []); // run once

  return (
    <div id="experience">
      <canvas ref={canvasRef} id="experience-canvas" />
    </div>
  );
});

export default ThreeCanvas;
