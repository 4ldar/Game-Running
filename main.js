// ========== GLOBAL VARIABLES ========== 
let scene, camera, renderer, starfield;
let keys = {};
let screenShake = { active: false, duration: 0, intensity: 0 };
let isInvincible = false, invincibilityTimer = 0;
let lastPositionX = 0, stationaryFrames = 0;

// Ship and player management
let player; 
const shipData = [
    {
        name: 'STARFIRE',
        path: 'assets/models/spaceship/scene.gltf',
        correctionalRotation: new THREE.Euler(0, Math.PI, 0)
    },
    {
        name: 'BLUE NOVA',
        path: 'assets/models/spaceshipblue/scene.gltf',
        correctionalRotation: new THREE.Euler(0, 0, 0)
    }
];
let loadedShipModels = [];
let currentShipIndex = 0;

// Game objects
let asteroids = [], bullets = [], debris = [];
let shieldMesh, thruster;

// ========== GAME STATE ========== 
let gameState = 'loading';
let score = 0, distance = 0, asteroidsDestroyed = 0, health = 3;
let level = 1, levelProgress = 0;
let asteroidSpawnCounter = 0;
let shieldActive = false, shieldTimer = 0, shieldCooldown = 0;
let isPlanetLevel = false;
let skillActive = false, skillCooldown = 0;
let laser = null;

// Camera positions
const menuCameraPos = new THREE.Vector3(0, 2, 12);
const gameCameraPos = new THREE.Vector3(0, 4, 10);
const planetCameraPos = new THREE.Vector3(0, 4, 15);

// ========== AUDIO & EFFECTS HELPERS ========== 
const mainMenuMusic = new Audio('assets/sounds/mainmenu.ogg');
mainMenuMusic.loop = true;
const inGameMusic = new Audio('assets/sounds/bgmingame.wav');
inGameMusic.loop = true;
inGameMusic.volume = 0.95;
const inGameAmbient = new Audio('assets/sounds/ingame.mp3');
inGameAmbient.loop = true;
inGameAmbient.volume = 0.6;

function playSound(soundFile, volume = 1.0) {
    try {
        const audio = new Audio(`assets/sounds/${soundFile}`);
        audio.volume = volume;
        audio.play();
        console.log(`Playing sound: ${soundFile}`); // Added for debugging
    } catch (e) {
        console.log(`Could not play sound: ${soundFile}. Error: ${e.message}`); // Added error message
    }
}

function startMainMenuMusic() {
    inGameMusic.pause();
    inGameAmbient.pause();
    mainMenuMusic.currentTime = 0;
    mainMenuMusic.play().catch(e => console.log("Menu music play failed. User interaction needed."));
}

function startGameMusic() {
    mainMenuMusic.pause();
    inGameAmbient.pause();
    inGameMusic.currentTime = 0;
    inGameMusic.play().catch(e => console.log("In-game music play failed."));
}

function stopAllMusic() {
    mainMenuMusic.pause();
    inGameMusic.pause();
    inGameAmbient.pause();
}

function triggerScreenShake(duration = 10, intensity = 0.1) {
    screenShake.duration = duration;
    screenShake.intensity = intensity;
}

// ========== INITIALIZATION ========== 
function init() {
    setupEventListeners();
    initThree();
    loadAllShips();
    displayHighScore();
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

function setupEventListeners() {
    document.getElementById('startBtn').addEventListener('click', showShipSelection);
    document.getElementById('quitBtn').addEventListener('click', () => { window.location.href = 'login.html'; });
    document.getElementById('prevShipBtn').addEventListener('click', () => changeShip(-1));
    document.getElementById('nextShipBtn').addEventListener('click', () => changeShip(1));
    document.getElementById('confirmShipBtn').addEventListener('click', confirmShipSelection);
    document.getElementById('resumeBtn').addEventListener('click', resumeGame);
    document.getElementById('quitToMenuBtn').addEventListener('click', quitToMenu);

    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (e.code === "Escape" && gameState === 'playing') togglePause();
        if (e.code === "Space" && gameState === 'playing' && !keys['SpaceFired']) {
            if (skillActive && shipData[currentShipIndex].name === 'STARFIRE') {
                // handled in update
            } else {
                shootBullet();
            }
            keys['SpaceFired'] = true;
        }
        if (e.code === "KeyS" && gameState === 'playing' && !shieldActive && shieldCooldown <= 0) activateShield();
        if (e.code === "Digit1" && gameState === 'playing' && !skillActive && skillCooldown <= 0) activateSkill();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; if (e.code === "Space") keys['SpaceFired'] = false; });
    window.addEventListener('resize', onWindowResize);
}

// ========== HIGH SCORE LOGIC ========== 
function displayHighScore() {
    const bestScore = parseInt(localStorage.getItem('spaceDodgerBestScore'));
    const bestDistance = parseInt(localStorage.getItem('spaceDodgerBestDistance'));
    const highScoreElement = document.getElementById('high-score-value');

    if (isNaN(bestScore) || isNaN(bestDistance)) {
        highScoreElement.textContent = 'N/A';
    } else {
        highScoreElement.textContent = `${bestScore}; ${(bestDistance / 1000).toFixed(1)} km`;
    }
}

function updateHighScore() {
    const bestScore = parseInt(localStorage.getItem('spaceDodgerBestScore') || '0', 10);
    if (score > bestScore) {
        localStorage.setItem('spaceDodgerBestScore', score);
    }

    const bestDistance = parseInt(localStorage.getItem('spaceDodgerBestDistance') || '0', 10);
    if (distance > bestDistance) {
        localStorage.setItem('spaceDodgerBestDistance', distance);
    }
    displayHighScore();
}

// ========== SHIP & GAMEPLAY SETUP ========== 
function loadAllShips() {
    const loader = new THREE.GLTFLoader();
    let shipsLoaded = 0;
    const subtitle = document.querySelector('#menu .subtitle');
    subtitle.textContent = 'LOADING ASSETS...';

    shipData.forEach((shipInfo, index) => {
        loader.load(shipInfo.path, (gltf) => {
            const model = gltf.scene;
            model.scale.set(0.5, 0.5, 0.5);
            model.rotation.copy(shipInfo.correctionalRotation);
            model.visible = false;
            loadedShipModels[index] = model;
            scene.add(model);
            shipsLoaded++;
            if (shipsLoaded === shipData.length) {
                gameState = 'menu';
                subtitle.textContent = 'A JOURNEY THROUGH THE COSMOS';
                player = loadedShipModels[currentShipIndex];
                startMainMenuMusic();
            }
        }, undefined, (error) => {
            console.error(`Failed to load ship: ${shipInfo.name}`, error);
            shipsLoaded++;
            if (shipsLoaded === shipData.length) { gameState = 'menu'; subtitle.textContent = 'ERROR: COULD NOT LOAD ASSETS'; }
        });
    });
}

function showShipSelection() {
    if (gameState !== 'menu') return;
    gameState = 'ship_selection';
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('ship-selection').classList.remove('hidden');
    updateShipSelectionUI();
}

function changeShip(direction) {
    if (!player) return;
    player.visible = false;
    currentShipIndex = (currentShipIndex + direction + loadedShipModels.length) % loadedShipModels.length;
    player = loadedShipModels[currentShipIndex];
    player.visible = true;
    updateShipSelectionUI();
}

function updateShipSelectionUI() {
    document.getElementById('ship-name').textContent = shipData[currentShipIndex].name;
}

function confirmShipSelection() {
    if (gameState !== 'ship_selection') return;
    gameState = 'transitioning';
    document.getElementById('ship-selection').classList.add('hidden');
    resetGameStats();
    createThruster();
    startGameMusic();
}

function startLevelTransition() {
    gameState = 'level_transitioning';
    createPlanetscape();
    inGameMusic.pause();
    inGameAmbient.currentTime = 0;
    inGameAmbient.play().catch(e => console.log("In-game ambient play failed."));
}

let particles; // Define particles in a broader scope

function createThruster() {
    if (thruster && thruster.parent) thruster.parent.remove(thruster);
    if (particles && particles.parent) particles.parent.remove(particles);

    const particleCount = 200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    const textureLoader = new THREE.TextureLoader();
    const particleTexture = textureLoader.load('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABGdBTUEAALGPC/xhBQAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAABlBMVEUAAAD///+l2Z/dAAAAAnRSTlMA/1uRIrUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAADKSURBVDjL7ZJBDsQgDEMtHhQ99/3/v6xCIk6iQCL6iIunYg0l4sE4wzC8xEB2h+k2GR8wV+emh3NnIysj5Xy/XQY1+yLg5Lz/HwZ+wX8gBI4gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB44gB4e8/aqAAAAAYagAAAABJRU5ErkJggg==');

    const material = new THREE.PointsMaterial({
        color: 0xffa500,
        size: 0.5, // Increased size
        map: particleTexture,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false
    });

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 2] = Math.random() * 1.0; // Increased initial Z spread

        velocities[i * 3] = (Math.random() - 0.5) * 0.01;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
        velocities[i * 3 + 2] = Math.random() * 0.2 + 0.1; // Increased Z velocity
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    particles = new THREE.Points(geometry, material);
    particles.position.set(0, 0, 0.8);
    particles.visible = false; // Initially hidden
    player.add(particles);
}

// ========== STATE TRANSITIONS & CLEANUP ========== 
function clearGameObjects() {
    asteroids.forEach(ast => scene.remove(ast));
    bullets.forEach(b => scene.remove(b));
    debris.forEach(d => scene.remove(d));
    asteroids = [];
    bullets = [];
    debris = [];
    if (thruster && thruster.parent) thruster.parent.remove(thruster);
    thruster = null;
    if (shieldMesh && shieldMesh.parent) shieldMesh.parent.remove(shieldMesh);
    shieldMesh = null;
}

function resetGameStats() {
    clearGameObjects();
    score = 0; distance = 0; asteroidsDestroyed = 0; health = 3;
    level = 1; levelProgress = 0;
    shieldActive = false; shieldTimer = 0; shieldCooldown = 0;
    isInvincible = false; invincibilityTimer = 0;
    isPlanetLevel = false; // Reset planet level flag
    skillActive = false; skillCooldown = 0; // Reset skill state
    if (laser) { scene.remove(laser); laser = null; } // Remove laser if active
    if (player) {
        player.position.set(0, 0, 0);
        player.rotation.copy(shipData[currentShipIndex].correctionalRotation);
    }
}

function quitToMenu() {
    gameState = 'menu';
    clearGameObjects();
    document.getElementById('pauseMenu').classList.add('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('ship-selection').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
    displayHighScore();
    startMainMenuMusic();
    // Reset camera and background to galaxy
    camera.position.copy(menuCameraPos);
    scene.background = new THREE.Color(0x000011);
    if (!starfield) createGalaxy(); // Recreate galaxy if it was removed for planetscape
}

function gameOver() {
    gameState = 'gameover';
    updateHighScore();
    if(player) player.visible = false;
    stopAllMusic();
    
    setTimeout(() => {
        alert(`GAME OVER\nScore: ${score}\nDistance: ${(distance / 1000).toFixed(1)} km\nAsteroids Destroyed: ${asteroidsDestroyed}\nLevel Reached: ${level}`);
        quitToMenu(); // Call quitToMenu for full reset
    }, 500);
}

// ========== GAME MECHANICS ========== 
function createExplosion(position) {
    playSound('pop.mp3');
    triggerScreenShake(10, 0.05);
    for (let i = 0; i < 10; i++) {
        const piece = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 0.2),
            new THREE.MeshStandardMaterial({ color: 0xaaaaaa, transparent: true })
        );
        piece.position.copy(position);
        piece.userData.velocity = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).normalize().multiplyScalar(0.3);
        piece.userData.lifespan = 40 + Math.random() * 30;
        scene.add(piece);
        debris.push(piece);
    }
}

function showBossWarning() {
    const warning = document.createElement('div');
    warning.className = 'boss-warning-subtle';
    warning.innerHTML = `
        <div class="boss-warning-subtle-content">
            <span class="boss-warning-icon">⚠️</span>
            <span class="boss-warning-text">BOSS INCOMING</span>
            <span class="boss-warning-level">Level ${level}</span>
        </div>
    `;
    document.body.appendChild(warning);
    
    setTimeout(() => {
        if (warning.parentNode) {
            warning.parentNode.removeChild(warning);
        }
    }, 4000);
}

function showLevelUp() {
    const levelUp = document.createElement('div');
    levelUp.className = 'level-up-subtle';
    levelUp.innerHTML = `
        <div class="level-up-subtle-content">
            <span class="level-up-icon">🎉</span>
            <span class="level-up-text">LEVEL ${level}</span>
            <span class="level-up-bonus">+${(level * 0.05).toFixed(1)} Speed</span>
        </div>
    `;
    document.body.appendChild(levelUp);
    
    setTimeout(() => {
        if (levelUp.parentNode) {
            levelUp.parentNode.removeChild(levelUp);
        }
    }, 3000);
}

// ========== LEVEL & DIFFICULTY SYSTEM ========== 
function getCurrentLevel() {
    return Math.floor(distance / 1000) + 1;
}

function getLevelProgress() {
    return (distance % 1000) / 10;
}

function getAsteroidSpeed() {
    const baseSpeed = 0.2 + (level * 0.02);
    const scoreBonus = Math.min(0.00002 * distance, 0.1);
    return baseSpeed + scoreBonus + Math.random() * 0.02; 
}

function getAsteroidSpawnInterval() {
    const baseInterval = Math.max(10, 50 - (level * 1.5));
    const scoreReduction = Math.floor(distance / 800);
    return Math.max(8, baseInterval - scoreReduction); 
}

function getAsteroidSize() {
    const sizeVariation = Math.random();
    if (level >= 5 && sizeVariation < 0.3) {
        return Math.random() * 0.3 + 0.3;
    } else if (level >= 3 && sizeVariation < 0.6) {
        return Math.random() * 0.4 + 0.6;
    } else {
        return Math.random() * 0.5 + 0.8;
    }
}

function getAsteroidHealth(size) {
    if (size < 0.6) return 1;
    else if (size < 1.0) return 2;
    else return 3;
}

function shouldSpawnBoss() {
    return level % 5 === 0 && levelProgress >= 90;
}

function spawnAsteroid() {
    const lane = [-4, -2, 0, 2, 4][Math.floor(Math.random() * 5)];
    const size = getAsteroidSize();
    const health = getAsteroidHealth(size);
    
    let color = 0xaaaaaa;
    if (health === 1) color = 0xff6666;
    else if (health === 2) color = 0xaaaaaa;
    else color = 0x666666;
    
    const ast = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0), 
        new THREE.MeshStandardMaterial({ color: color, flatShading: true })
    );
    ast.position.set(lane, 0, -100);
    ast.userData = { 
        speed: getAsteroidSpeed(), 
        health: health,
        maxHealth: health,
        rotationSpeed: new THREE.Vector3(Math.random()*0.02-0.01, Math.random()*0.02-0.01, Math.random()*0.02-0.01) 
    };
    scene.add(ast);
    asteroids.push(ast);
}

function spawnBossAsteroid() {
    const bossSize = 2.5;
    const bossHealth = level * 2;
    
    const boss = new THREE.Mesh(
        new THREE.DodecahedronGeometry(bossSize, 1), 
        new THREE.MeshStandardMaterial({
            color: 0xff0000, 
            flatShading: true,
            emissive: 0x330000,
            emissiveIntensity: 0.3
        })
    );
    
    boss.position.set(0, 0, -100);
    boss.userData = { 
        speed: getAsteroidSpeed() * 0.5,
        health: bossHealth,
        maxHealth: bossHealth,
        isBoss: true,
        rotationSpeed: new THREE.Vector3(0.01, 0.01, 0.01)
    };
    
    const glowGeometry = new THREE.SphereGeometry(bossSize + 0.3, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000, 
        transparent: true, 
        opacity: 0.3 
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    boss.add(glow);
    
    scene.add(boss);
    asteroids.push(boss);
    
    showBossWarning();
}

function shootBullet() {
    if (!player) return;

    if (skillActive) {
        // TODO: Add new laser sounds for skills when provided
        if (shipData[currentShipIndex].name === 'STARFIRE') {
            playSound('laserstarfire.mp3');
            if (!laser) {
                const laserGeo = new THREE.CylinderGeometry(0.1, 0.1, 100, 8);
                const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
                laser = new THREE.Mesh(laserGeo, laserMat);
                laser.rotation.x = Math.PI / 2;
                laser.position.set(player.position.x, player.position.y, player.position.z - 50);
                scene.add(laser);
            }
        } else if (shipData[currentShipIndex].name === 'BLUE NOVA') {
            playSound('laserbluenova.wav', 0.5); // Reduced volume
            for (let i = -1; i <= 1; i++) {
                const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
                bullet.position.copy(player.position);
                bullet.position.x += i * 0.5;
                bullet.position.z -= 1.5;
                bullet.userData = { speed: -0.8 };
                scene.add(bullet);
                bullets.push(bullet);
            }
        }
    } else {
        playSound('laser.mp3');
        const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
        bullet.position.copy(player.position);
        bullet.position.z -= 1.5;
        bullet.userData = { speed: -0.8 };
        scene.add(bullet);
        bullets.push(bullet);
    }
}

function activateShield() {
    if (shieldActive || shieldCooldown > 0) return;
    shieldActive = true; shieldTimer = 300;
    if (player && !shieldMesh) {
        shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 32), new THREE.MeshStandardMaterial({ color: 0x0088ff, transparent: true, opacity: 0.3, emissive: 0x0088ff, emissiveIntensity: 1, depthWrite: false }));
        player.add(shieldMesh);
    }
    updateHUD();
}

function activateSkill() {
    if (skillActive || skillCooldown > 0) return;
    // TODO: Add new laser sounds for skills when provided
    skillActive = true;
    skillCooldown = 600; // 10 seconds cooldown
    updateHUD();
}

// ========== UPDATE LOGIC (called from animate) ========== 
function updateDebris() {
    for (let i = debris.length - 1; i >= 0; i--) {
        const piece = debris[i];
        piece.position.add(piece.userData.velocity);
        piece.userData.lifespan--;
        piece.material.opacity = piece.userData.lifespan / 60;

        if (piece.userData.lifespan <= 0) {
            scene.remove(piece);
            debris.splice(i, 1);
        }
    }
}

function updateParticles() {
    if (!particles) return;

    const positions = particles.geometry.attributes.position.array;
    const velocities = particles.geometry.attributes.velocity.array;

    for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3] += velocities[i * 3];
        positions[i * 3 + 1] += velocities[i * 3 + 1];
        positions[i * 3 + 2] += velocities[i * 3 + 2];

        if (positions[i * 3 + 2] > 2.0) { // Increased reset distance
            positions[i * 3] = (Math.random() - 0.5) * 0.2;
            positions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
            positions[i * 3 + 2] = Math.random() * 1.0; // Reset within new initial Z spread
        }
    }

    particles.geometry.attributes.position.needsUpdate = true;
}

function updatePlayingState() {
    if (!player) return;

    if (player.position.x === lastPositionX) {
        stationaryFrames++;
    } else {
        stationaryFrames = 0;
    }
    lastPositionX = player.position.x;

    if (isInvincible) {
        invincibilityTimer--;
        player.visible = (invincibilityTimer % 20 < 10); 
        
        if (invincibilityTimer <= 0) {
            isInvincible = false;
            player.visible = true;
        }
    }

    if (keys['KeyA'] || keys['ArrowLeft']) player.position.x -= 0.2;
    if (keys['KeyD'] || keys['ArrowRight']) player.position.x += 0.2;
    player.position.x = Math.max(-5, Math.min(5, player.position.x));

    const newLevel = getCurrentLevel();
    if (newLevel > level) {
        level = newLevel;
        showLevelUp();
        if (level === 11 && !isPlanetLevel) {
            isPlanetLevel = true;
            startLevelTransition();
        }
    }
    levelProgress = getLevelProgress();
    
    asteroidSpawnCounter++;
    if (asteroidSpawnCounter > getAsteroidSpawnInterval()) { 
        spawnAsteroid(); 
        asteroidSpawnCounter = 0; 
    }
    
    if (shouldSpawnBoss() && asteroids.every(ast => !ast.userData.isBoss)) {
        spawnBossAsteroid();
    }
    
    for (let i = asteroids.length - 1; i >= 0; i--) {
        const ast = asteroids[i];
        ast.position.z += ast.userData.speed;
        
        ast.rotation.x += ast.userData.rotationSpeed.x;
        ast.rotation.y += ast.userData.rotationSpeed.y;
        ast.rotation.z += ast.userData.rotationSpeed.z;
        
        if (ast.position.z > 10) { scene.remove(ast); asteroids.splice(i, 1); continue; }
        
        const baseCollisionDistance = ast.userData.isBoss ? 3.0 : 1.2;
        const collisionDistance = shieldActive ? baseCollisionDistance + 0.8 : baseCollisionDistance;
        
        if (player.position.distanceTo(ast.position) < collisionDistance) { 
            handleDamage(); 
            scene.remove(ast); 
            asteroids.splice(i, 1); 
        }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.position.z += b.userData.speed;
        if (b.position.z < -50) { scene.remove(b); bullets.splice(i, 1); continue; }
        for (let j = asteroids.length - 1; j >= 0; j--) {
            if (asteroids[j] && b.position.distanceTo(asteroids[j].position) < 1) {
                const asteroid = asteroids[j];
                asteroid.userData.health--;
                
                if (asteroid.userData.health < asteroid.userData.maxHealth) {
                    asteroid.material.emissive = new THREE.Color(0x333333);
                    asteroid.material.emissiveIntensity = 0.5;
                }
                
                if (asteroid.userData.health <= 0) {
                    const points = asteroid.userData.isBoss ? level * 100 : 50;
                    score += points;
                    asteroidsDestroyed++;
                    
                    createExplosion(asteroid.position);
                    scene.remove(asteroid); 
                    asteroids.splice(j, 1);
                }
                
                scene.remove(b); bullets.splice(i, 1);
                break;
            }
        }
    }

    if (shieldActive) {
        shieldTimer--;
        if (shieldTimer <= 0) { shieldActive = false; shieldCooldown = 600; if (player && shieldMesh) player.remove(shieldMesh); shieldMesh = null; }
    } else if (shieldCooldown > 0) { 
        shieldCooldown--; 
    }

    if (skillActive) {
        if (shipData[currentShipIndex].name === 'STARFIRE' && keys['Space']) {
            if (!laser) {
                const laserGeo = new THREE.CylinderGeometry(0.1, 0.1, 100, 8);
                const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5 });
                laser = new THREE.Mesh(laserGeo, laserMat);
                laser.rotation.x = Math.PI / 2;
                scene.add(laser);
            }
            laser.position.set(player.position.x, player.position.y, player.position.z - 50);

            for (let i = asteroids.length - 1; i >= 0; i--) {
                const ast = asteroids[i];
                if (Math.abs(ast.position.x - player.position.x) < 0.5) {
                    ast.userData.health -= 0.1; // Damage over time
                    if (ast.userData.health <= 0) {
                        const points = ast.userData.isBoss ? level * 100 : 50;
                        score += points;
                        asteroidsDestroyed++;
                        createExplosion(ast.position);
                        scene.remove(ast);
                        asteroids.splice(i, 1);
                    }
                }
            }

        } else if (laser) {
            scene.remove(laser);
            laser = null;
        }

        skillCooldown--;
        if (skillCooldown <= 0) {
            skillActive = false;
            if (laser) {
                scene.remove(laser);
                laser = null;
            }
        }
    } else if (skillCooldown > 0) {
        skillCooldown--;
    }

    if (particles) particles.visible = true;
    updateParticles();
    updateDebris();
    if (stationaryFrames < 300) {
        distance++;
    }
    updateHUD();
}

function handleDamage() { 
    if (isInvincible || shieldActive) return;

    health--; 
    triggerScreenShake(20, 0.2);
    playSound('hit.mp3');
    updateHearts(); 

    if (health <= 0) {
        gameOver(); 
    } else {
        isInvincible = true;
        invincibilityTimer = 120; // 2 seconds at 60fps
    }
}

// ========== UI & CONTROLS ========== 
function updateHUD() {
    document.getElementById('score').textContent = score;
    document.getElementById('distance').textContent = `${(distance / 1000).toFixed(1)} km`;
    document.getElementById('destroyed').textContent = asteroidsDestroyed;
    
    const levelDisplay = document.getElementById('level');
    if (levelDisplay) {
        levelDisplay.textContent = `LEVEL ${level}`;
        levelDisplay.style.color = level >= 5 ? '#ff6600' : '#00ff88';
    }
    
    const progressDisplay = document.getElementById('level-progress');
    if (progressDisplay) {
        progressDisplay.textContent = `${Math.floor(levelProgress)}%`;
        progressDisplay.style.color = levelProgress >= 90 ? '#ff0000' : '#ffffff';
    }
    
    const shieldDisplay = document.getElementById('shield');
    if (shieldActive) { shieldDisplay.textContent = `ACTIVE: ${Math.ceil(shieldTimer / 60)}s`; shieldDisplay.style.color = '#00ccff'; } 
    else if (shieldCooldown > 0) { shieldDisplay.textContent = `COOLDOWN: ${Math.ceil(shieldCooldown / 60)}s`; shieldDisplay.style.color = '#ff6600'; }
    else { shieldDisplay.textContent = 'READY'; shieldDisplay.style.color = '#00ff88'; }

    const skillDisplay = document.getElementById('skill');
    if (skillActive) { skillDisplay.textContent = `ACTIVE: ${Math.ceil(skillCooldown / 60)}s`; skillDisplay.style.color = '#ffcc00'; } 
    else if (skillCooldown > 0) { skillDisplay.textContent = `COOLDOWN: ${Math.ceil(skillCooldown / 60)}s`; skillDisplay.style.color = '#ff6600'; }
    else { skillDisplay.textContent = 'READY'; skillDisplay.style.color = '#00ff88'; }

    updateHearts();
}

function updateHearts() { document.getElementById('hearts').textContent = '❤️'.repeat(health); }

function togglePause() { 
    gameState = (gameState === 'playing') ? 'paused' : 'playing'; 
    document.getElementById('pauseMenu').classList.toggle('hidden'); 
    if(particles) particles.visible = (gameState === 'playing');
    if (gameState === 'paused') {
        if (isPlanetLevel) {
            inGameAmbient.pause();
        } else {
            inGameMusic.pause();
        }
    } else {
        if (isPlanetLevel) {
            inGameAmbient.play();
        } else {
            inGameMusic.play();
        }
    }
}

function resumeGame() { 
    gameState = 'playing'; 
    document.getElementById('pauseMenu').classList.add('hidden'); 
    if(particles) particles.visible = true; 
    if (isPlanetLevel) {
        inGameAmbient.play();
    } else {
        inGameMusic.play();
    }
}

function onWindowResize() { if (!camera || !renderer) return; camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

function createGalaxy() {
    const positions = new Float32Array(15000 * 3);
    for (let i = 0; i < positions.length; i++) { positions[i] = (Math.random() - 0.5) * 4000; }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 2 });
    starfield = new THREE.Points(geometry, material);
    scene.add(starfield);
}

function createPlanetscape() {
    scene.background = new THREE.Color(0x440000); // Reddish background
    // Remove existing starfield if any
    if (starfield) {
        scene.remove(starfield);
    }

    // Add a ground plane to represent the planet surface
    const groundGeometry = new THREE.PlaneGeometry(100, 200, 10, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -10;
    scene.add(ground);

    // Add some fog
    scene.fog = new THREE.Fog(0x440000, 10, 100);
}

// ========== MAIN ANIMATION LOOP ========== 
function animate() {
    requestAnimationFrame(animate);
    if (starfield) { starfield.rotation.y += 0.0001; starfield.rotation.x += 0.00005; }

    switch (gameState) {
        case 'menu':
            if (player && !player.visible) {
                currentShipIndex = 0;
                player = loadedShipModels[currentShipIndex];
                player.position.set(0,0,0);
                player.rotation.copy(shipData[currentShipIndex].correctionalRotation);
                player.visible = true;
            }
            if (player) { player.rotation.y += 0.005; }
            camera.position.lerp(menuCameraPos, 0.05);
            camera.lookAt(0,0,0);
            break;

        case 'ship_selection':
            if (player) { player.rotation.y += 0.005; }
            camera.position.lerp(menuCameraPos, 0.05);
            camera.lookAt(0,0,0);
            break;

        case 'transitioning':
            if(player) {
                const targetQuaternion = new THREE.Quaternion().setFromEuler(shipData[currentShipIndex].correctionalRotation);
                player.quaternion.slerp(targetQuaternion, 0.05);
            }
            camera.position.lerp(gameCameraPos, 0.05);
            camera.lookAt(0,0,0);
            if (camera.position.distanceTo(gameCameraPos) < 0.1) {
                gameState = 'playing';
                document.getElementById('hud').classList.remove('hidden');
                player.rotation.copy(shipData[currentShipIndex].correctionalRotation);
                updateHUD();
            }
            break;

        case 'level_transitioning':
            camera.position.lerp(planetCameraPos, 0.05);
            if (camera.position.distanceTo(planetCameraPos) < 0.1) {
                gameState = 'playing';
            }
            break;

        case 'playing':
            updatePlayingState();
            break;
    }

    if (screenShake.duration > 0) {
        camera.position.x += (Math.random() - 0.5) * screenShake.intensity;
        camera.position.y += (Math.random() - 0.5) * screenShake.intensity;
        screenShake.duration--;
    }

    renderer.render(scene, camera);
}

window.addEventListener('load', init);