// ========== GLOBAL VARIABLES ========== 
let scene, camera, renderer, starfield;
const menuCameraPos = new THREE.Vector3(0, 2, 12);

// ========== AUDIO & EFFECTS HELPERS ========== 
const mainMenuMusic = new Audio('assets/sounds/mainmenu.ogg');
mainMenuMusic.loop = true;

function startMainMenuMusic() {
    sessionStorage.setItem('musicPlaying', 'true');
    mainMenuMusic.currentTime = 0;
    mainMenuMusic.play().catch(e => {
        console.log("Menu music play failed. User interaction needed.");
        window.addEventListener('click', () => {
            if (mainMenuMusic.paused) {
                mainMenuMusic.play();
            }
        }, { once: true });
    });
}

// ========== INITIALIZATION ========== 
function init() {
    initThree();
    animate();
}

function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
    camera.position.copy(menuCameraPos);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);
    createGalaxy();
}

function createGalaxy() {
    const positions = new Float32Array(15000 * 3);
    for (let i = 0; i < positions.length; i++) { positions[i] = (Math.random() - 0.5) * 4000; }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 2 });
    starfield = new THREE.Points(geometry, material);
    scene.add(starfield);
}

// ========== MAIN ANIMATION LOOP ========== 
function animate() {
    requestAnimationFrame(animate);
    if (starfield) { starfield.rotation.y += 0.0001; starfield.rotation.x += 0.00005; }
    camera.position.lerp(menuCameraPos, 0.05);
    camera.lookAt(0,0,0);
    renderer.render(scene, camera);
}

window.addEventListener('load', init);