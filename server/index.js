const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { ChatClient } = require('@twurple/chat');
const { StaticAuthProvider } = require('@twurple/auth');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// Game state
let gameState = {
    score: { saves: 0, goals: 0 },
    activeBalls: [],
    topShooters: {}
};

// Twitch chat configuration - anonymous connection for listening only
const channelName = process.env.TWITCH_CHANNEL || 'huikkakoodaa';

// Create anonymous auth provider (no authentication needed for reading chat)
const authProvider = new StaticAuthProvider('anonymous_client_id');

// Create chat client
const chatClient = new ChatClient({
    authProvider,
    channels: [channelName],
    isAlwaysMod: false,
    requestMembershipEvents: false
});

// Connect to Twitch chat
chatClient?.connect()?.then(() => {
    console.log(`Connected to Twitch chat for channel: ${channelName}`);
}).catch(error => {
    console.error('Failed to connect to Twitch chat:', error);
    console.log('Note: You may need to set TWITCH_CHANNEL environment variable');
});

// Listen for chat messages
chatClient.onMessage((channel, user, text, msg) => {
    const shootMatch = text.match(/!shoot\s+([A-E][1-5])/i);
    if (shootMatch) {
        const target = shootMatch[1].toUpperCase();
        const shooter = msg.userInfo.displayName || msg.userInfo.userName;

        // Add to top shooters
        gameState.topShooters[shooter] = (gameState.topShooters[shooter] || 0) + 1;

        // Create ball object
        const ball = {
            id: Date.now() + Math.random(),
            target: target,
            shooter: shooter,
            timestamp: Date.now(),
            status: 'incoming'
        };

        gameState.activeBalls.push(ball);

        // Broadcast to all connected clients
        io.emit('newShot', ball);

        console.log(`Shot from ${shooter} targeting ${target}`);
    }
});

// Handle connection errors
chatClient.onConnect(() => {
    console.log('Successfully connected to Twitch chat');
});

chatClient.onDisconnect((manually, reason) => {
    console.log(`Disconnected from Twitch chat. Manual: ${manually}, Reason: ${reason}`);
});

// Socket.io connections
io.on('connection', (socket) => {
    console.log('Client connected');

    // Send current game state to new client
    socket.emit('gameState', gameState);

    // Handle save/goal results from frontend
    socket.on('ballResult', (data) => {
        const { ballId, result } = data; // result: 'save' or 'goal'

        // Update score
        if (result === 'save') {
            gameState.score.saves++;
        } else {
            gameState.score.goals++;
        }

        // Remove ball from active balls
        gameState.activeBalls = gameState.activeBalls.filter(ball => ball.id !== ballId);

        // Broadcast updated game state
        io.emit('gameState', gameState);

        console.log(`Ball ${ballId}: ${result}. Score: ${gameState.score.saves}-${gameState.score.goals}`);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const PORT = process.env.PORT || 3012;
server.listen(PORT, () => {
    console.log(`Twitch Keeper server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} to view the game`);
});