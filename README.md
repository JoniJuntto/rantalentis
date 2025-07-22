# Twitch Keeper 🎮

An interactive real-time goalkeeper game where Twitch chat controls the shots and streamers use hand tracking to make saves!

## Features

- **Real-time Twitch chat integration** - Viewers type `!shoot B3` to fire shots
- **Hand tracking** - Uses MediaPipe to detect goalkeeper movements
- **3D ball animations** - Three.js powered visual effects
- **Live scoring** - Tracks saves vs goals in real-time
- **Top shooters leaderboard** - Shows most active chat participants

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Twitch channel:**
   - Copy `.env.example` to `.env`
   - Set your Twitch channel name (no authentication needed for listening)

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open the game:**
   - Navigate to `http://localhost:3000`
   - Allow camera access for hand tracking
   - Add as browser source in OBS (1920x1080 recommended)

## How to Play

### For Streamers:
- Position yourself in front of the camera
- Watch the grid overlay for incoming shots
- Use your hands to block balls before they reach the back wall
- The system detects saves when your hands are near the ball's target location

### For Viewers:
- Type `!shoot [GRID_COORDINATE]` in chat
- Grid coordinates: A1-E5 (like Battleship)
- Examples: `!shoot C3`, `!shoot A1`, `!shoot E5`

## Technical Details

- **Backend:** Node.js with Express and Socket.io
- **Frontend:** Three.js for 3D graphics, MediaPipe for hand tracking
- **Twitch Integration:** Twurple for modern chat API functionality
- **Real-time Communication:** WebSockets for instant updates

## OBS Setup

1. Add Browser Source
2. URL: `http://localhost:3000`
3. Width: 1920, Height: 1080
4. Check "Shutdown source when not visible"
5. Position behind your camera feed with chroma key if needed

## Development

Run in development mode with auto-restart:
```bash
npm run dev
```

Test shots without Twitch chat by opening browser console and running:
```javascript
testShot('C3'); // Shoots at grid position C3
```

## Customization

- Adjust grid size in `game.js` (currently 5x5)
- Modify ball speed by changing `duration` in `createBall()`
- Customize save detection sensitivity in `checkSave()`
- Style the overlay in `index.html`