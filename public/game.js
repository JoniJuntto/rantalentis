class TwitchKeeper {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.balls = new Map();
        this.handPositions = [];
        this.socket = null;
        this.hands = null;

        this.gridSize = 5; // 5x5 grid
        this.gridCellSize = 80;

        this.init();
    }

    init() {
        this.setupThreeJS();
        this.setupSocket();
        this.setupGrid();
        this.setupHandTracking();
        this.animate();
    }

    setupThreeJS() {
        // Scene setup
        this.scene = new THREE.Scene();
        // Make background transparent so webcam shows through

        // Camera setup
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 10;

        // Renderer setup with transparency
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setClearColor(0x000000, 0); // Transparent background
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Position renderer canvas above webcam but below UI
        const canvas = this.renderer.domElement;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.zIndex = '25';
        canvas.style.pointerEvents = 'none';

        document.getElementById('gameContainer').appendChild(canvas);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0, 0, 5);
        this.scene.add(directionalLight);
    }

    setupSocket() {
        this.socket = io();

        this.socket.on('gameState', (gameState) => {
            this.updateUI(gameState);
        });

        this.socket.on('newShot', (ball) => {
            this.createBall(ball);
        });
    }

    setupGrid() {
        const gridContainer = document.getElementById('grid');
        const rows = ['A', 'B', 'C', 'D', 'E'];

        rows.forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'grid-row';

            for (let col = 1; col <= 5; col++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                cell.textContent = row + col;
                cell.id = 'cell-' + row + col;
                rowDiv.appendChild(cell);
            }

            gridContainer.appendChild(rowDiv);
        });
    }

    setupHandTracking() {
        const videoElement = document.getElementById('webcam');
        const trackingStatus = document.getElementById('trackingStatus');

        // Initialize MediaPipe Hands
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults((results) => {
            this.handPositions = results.multiHandLandmarks || [];
            trackingStatus.textContent = this.handPositions.length > 0 ? 'Active' : 'No hands detected';
        });

        // Setup camera
        const camera = new Camera(videoElement, {
            onFrame: async () => {
                await this.hands.send({ image: videoElement });
            },
            width: 1280,
            height: 720
        });

        camera.start().then(() => {
            trackingStatus.textContent = 'Camera started';
        }).catch((error) => {
            trackingStatus.textContent = 'Camera error';
            console.error('Camera setup failed:', error);
        });
    }

    createBall(ballData) {
        const geometry = new THREE.SphereGeometry(1.5, 16, 16); // Much larger ball
        const material = new THREE.MeshPhongMaterial({
            color: 0xff4444,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });
        const ball = new THREE.Mesh(geometry, material);

        // Calculate target position based on grid coordinates
        const targetPos = this.getGridPosition(ballData.target);

        // Start ball from viewer's perspective (far forward) toward goalkeeper
        ball.position.copy(targetPos);
        ball.position.z = 25; // Start far in front (from viewer/chat)
        ball.scale.set(2.5, 2.5, 2.5); // Start much larger (closer to viewer)

        ball.userData = {
            ...ballData,
            targetPosition: targetPos,
            startTime: Date.now(),
            duration: 5000 // 5 seconds to reach goalkeeper (much slower)
        };

        this.scene.add(ball);
        this.balls.set(ballData.id, ball);

        // Highlight target cell with pulsing effect
        const cell = document.getElementById('cell-' + ballData.target);
        if (cell) {
            cell.style.backgroundColor = 'rgba(255, 68, 68, 0.4)';
            cell.style.boxShadow = '0 0 20px rgba(255, 68, 68, 0.6)';
            cell.style.transform = 'scale(1.1)';
            cell.style.transition = 'all 0.3s ease';

            setTimeout(() => {
                cell.style.backgroundColor = '';
                cell.style.boxShadow = '';
                cell.style.transform = '';
            }, 5000); // Match the longer duration
        }
    }

    getGridPosition(gridCoord) {
        const row = gridCoord.charCodeAt(0) - 65; // A=0, B=1, etc.
        const col = parseInt(gridCoord[1]) - 1; // 1=0, 2=1, etc.

        // Map grid to screen coordinates (goalkeeper's perspective)
        const x = (col - 2) * 3; // Wider spread for 5x5 grid
        const y = (2 - row) * 2.5; // Taller spread

        return new THREE.Vector3(x, y, -2); // End position behind goalkeeper (goal line)
    }

    updateBalls() {
        const currentTime = Date.now();

        this.balls.forEach((ball, ballId) => {
            const elapsed = currentTime - ball.userData.startTime;
            const progress = Math.min(elapsed / ball.userData.duration, 1);

            if (progress >= 1) {
                // Ball reached goal line - check for save
                const result = this.checkSave(ball);

                if (result === 'save') {
                    // Ball was saved - start bounce back animation
                    ball.userData.bouncing = true;
                    ball.userData.bounceStartTime = Date.now();
                    ball.userData.bounceDuration = 1500; // 1.5 seconds bounce back

                    // Create explosion effect
                    this.createSaveExplosion(ball.position);
                } else {
                    // Goal - handle result and remove ball
                    if (this.socket && this.socket.connected) {
                        this.socket.emit('ballResult', { ballId, result });
                    } else {
                        this.updateScoreLocally(result);
                    }
                    this.scene.remove(ball);
                    this.balls.delete(ballId);
                }
            } else if (ball.userData.bouncing) {
                // Handle bounce back animation for saved balls
                const bounceElapsed = Date.now() - ball.userData.bounceStartTime;
                const bounceProgress = Math.min(bounceElapsed / ball.userData.bounceDuration, 1);

                if (bounceProgress >= 1) {
                    // Bounce animation complete - handle result and remove
                    if (this.socket && this.socket.connected) {
                        this.socket.emit('ballResult', { ballId: ballId, result: 'save' });
                    } else {
                        this.updateScoreLocally('save');
                    }
                    this.scene.remove(ball);
                    this.balls.delete(ballId);
                } else {
                    // Animate bounce back toward viewer
                    const bounceEase = this.easeOutBounce(bounceProgress);
                    ball.position.z = ball.userData.targetPosition.z + (30 * bounceEase);

                    // Spin the ball dramatically during bounce
                    ball.rotation.x += 0.3;
                    ball.rotation.y += 0.2;
                    ball.rotation.z += 0.1;

                    // Scale up slightly during bounce for emphasis
                    const bounceScale = 0.7 + (0.5 * Math.sin(bounceProgress * Math.PI));
                    ball.scale.set(bounceScale, bounceScale, bounceScale);
                }
            } else {
                // Animate ball movement from viewer toward goal
                const targetPos = ball.userData.targetPosition;
                const startZ = 25; // Start from viewer's side
                const endZ = targetPos.z; // End at goal line

                // Smooth easing for realistic ball movement
                const easedProgress = this.easeInOut(progress);

                // Update position (ball flies from viewer toward goal)
                ball.position.z = startZ + (endZ - startZ) * easedProgress;

                // Scale ball as it gets farther (perspective effect)
                const scale = 2.5 - (1.8 * easedProgress); // Start much bigger, get smaller
                ball.scale.set(scale, scale, scale);

                // Add slight rotation for realism
                ball.rotation.x += 0.1;
                ball.rotation.y += 0.05;
            }
        });
    }

    checkSave(ball) {
        if (this.handPositions.length === 0) return 'goal';

        // Convert ball position to screen coordinates for comparison
        const ballScreenPos = this.worldToScreen(ball.position);

        // Check if any hand is near the ball position
        for (const handLandmarks of this.handPositions) {
            // Use multiple hand landmarks for better detection
            const landmarks = [
                handLandmarks[8],  // Index finger tip
                handLandmarks[12], // Middle finger tip
                handLandmarks[16], // Ring finger tip
                handLandmarks[20], // Pinky tip
                handLandmarks[4],  // Thumb tip
                handLandmarks[9]   // Palm center
            ];

            for (const landmark of landmarks) {
                const handScreenX = (1 - landmark.x) * window.innerWidth; // Flip X for mirrored webcam
                const handScreenY = landmark.y * window.innerHeight;

                const distance = Math.sqrt(
                    Math.pow(ballScreenPos.x - handScreenX, 2) +
                    Math.pow(ballScreenPos.y - handScreenY, 2)
                );

                // If any part of hand is within 120 pixels of ball, it's a save
                if (distance < 120) {
                    return 'save';
                }
            }
        }

        return 'goal';
    }

    worldToScreen(position) {
        const vector = position.clone();
        vector.project(this.camera);

        return {
            x: (vector.x + 1) * window.innerWidth / 2,
            y: (-vector.y + 1) * window.innerHeight / 2
        };
    }

    easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    easeOutBounce(t) {
        if (t < 1 / 2.75) {
            return 7.5625 * t * t;
        } else if (t < 2 / 2.75) {
            return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        } else if (t < 2.5 / 2.75) {
            return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        } else {
            return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
        }
    }

    createSaveExplosion(position) {
        // Create multiple particles for explosion effect
        for (let i = 0; i < 12; i++) {
            const particleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
            const particleMaterial = new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(Math.random() * 0.1 + 0.05, 1, 0.7), // Orange/yellow colors
                transparent: true,
                opacity: 0.8
            });
            const particle = new THREE.Mesh(particleGeometry, particleMaterial);

            // Position at ball location
            particle.position.copy(position);

            // Random velocity for explosion effect
            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20
            );

            particle.userData = {
                velocity: velocity,
                startTime: Date.now(),
                lifetime: 1000 // 1 second lifetime
            };

            this.scene.add(particle);

            // Store particle for cleanup
            if (!this.explosionParticles) {
                this.explosionParticles = new Map();
            }
            this.explosionParticles.set(Date.now() + i, particle);
        }
    }

    updateExplosionParticles() {
        if (!this.explosionParticles) return;

        const currentTime = Date.now();

        this.explosionParticles.forEach((particle, particleId) => {
            const elapsed = currentTime - particle.userData.startTime;
            const progress = elapsed / particle.userData.lifetime;

            if (progress >= 1) {
                // Remove expired particle
                this.scene.remove(particle);
                this.explosionParticles.delete(particleId);
            } else {
                // Update particle position and appearance
                particle.position.add(particle.userData.velocity.clone().multiplyScalar(0.016)); // ~60fps
                particle.userData.velocity.multiplyScalar(0.95); // Slow down over time

                // Fade out
                particle.material.opacity = 0.8 * (1 - progress);

                // Scale down
                const scale = 1 - (progress * 0.5);
                particle.scale.set(scale, scale, scale);
            }
        });
    }

    updateUI(gameState) {
        document.getElementById('saves').textContent = gameState.score.saves;
        document.getElementById('goals').textContent = gameState.score.goals;

        // Update top shooters
        const topShootersDiv = document.getElementById('topShooters');
        const sortedShooters = Object.entries(gameState.topShooters)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);

        topShootersDiv.innerHTML = '<div>Top Shooters:</div>' +
            sortedShooters.map(([name, count]) => `<div>${name}: ${count}</div>`).join('');
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.updateBalls();
        this.updateExplosionParticles();
        this.renderer.render(this.scene, this.camera);
    }

    // Handle window resize
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Local score tracking for offline mode
    updateScoreLocally(result) {
        if (result === 'save') {
            const saves = parseInt(document.getElementById('saves').textContent) + 1;
            document.getElementById('saves').textContent = saves;
        } else {
            const goals = parseInt(document.getElementById('goals').textContent) + 1;
            document.getElementById('goals').textContent = goals;
        }
    }

    // Reset score
    resetScore() {
        document.getElementById('saves').textContent = '0';
        document.getElementById('goals').textContent = '0';
        document.getElementById('topShooters').innerHTML = '<div>Top Shooters:</div>';
    }
}

// Initialize the game when page loads
window.addEventListener('load', () => {
    window.game = new TwitchKeeper();

    window.addEventListener('resize', () => {
        window.game.onWindowResize();
    });
});

// Test function for development
function testShot(target = 'C3') {
    const testBall = {
        id: Date.now(),
        target: target,
        shooter: 'TestUser',
        timestamp: Date.now(),
        status: 'incoming'
    };

    if (window.game) {
        window.game.createBall(testBall);
    }
}

// Offline testing functions
function shootRandomBall() {
    const rows = ['A', 'B', 'C', 'D', 'E'];
    const cols = ['1', '2', '3', '4', '5'];
    const randomRow = rows[Math.floor(Math.random() * rows.length)];
    const randomCol = cols[Math.floor(Math.random() * cols.length)];
    const target = randomRow + randomCol;

    const testBall = {
        id: Date.now() + Math.random(),
        target: target,
        shooter: 'TestBot',
        timestamp: Date.now(),
        status: 'incoming'
    };

    if (window.game) {
        window.game.createBall(testBall);
    }
}

function shootBarrage() {
    // Shoot 5 balls in quick succession
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            shootRandomBall();
        }, i * 800); // 800ms delay between each ball
    }
}

function resetScore() {
    if (window.game) {
        window.game.resetScore();
    }
}