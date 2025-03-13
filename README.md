# Kluster

A multiplayer magnetic stone clustering game where players strategically place stones that interact through magnetic forces.

## Game Rules

- Stones have magnetic properties and will cluster when close enough.
- If stones cluster during your turn, you must collect them all.
- The first player to place all their stones without causing a cluster wins.

## Features

- Real-time multiplayer gameplay
- Magnetic stone interactions with visual feedback
- Room-based matchmaking
- Modern UI with animations and visual effects
- Responsive design for different screen sizes

## Development

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Setup

1. Clone the repository:
   ```
   git clone <repository-url>
   cd kluster
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`

### Server Development

The multiplayer server uses Socket.IO and Express:

1. Install server dependencies:
   ```
   cd server
   npm install
   ```

2. Start the server in development mode:
   ```
   npm run dev
   ```

## Deployment

### Option 1: Using the deployment script

1. Make the deployment script executable:
   ```
   chmod +x deploy.sh
   ```

2. Run the deployment script:
   ```
   ./deploy.sh
   ```

3. The production build will be in the `dist-prod` directory.

4. Deploy to your hosting provider:
   ```
   cd dist-prod
   npm install
   npm start
   ```

### Option 2: Manual deployment

1. Build the client:
   ```
   npm run build
   ```

2. Build the server:
   ```
   cd server
   npm install
   npm run build
   ```

3. Deploy the contents of the `dist` directory and the `server/dist` directory to your hosting provider.

## Hosting Options

### Heroku

1. Create a new Heroku app:
   ```
   heroku create kluster-game
   ```

2. Add the Node.js buildpack:
   ```
   heroku buildpacks:set heroku/nodejs
   ```

3. Deploy to Heroku:
   ```
   git push heroku main
   ```

### Render

1. Create a new Web Service on Render.
2. Connect your GitHub repository.
3. Set the build command to `./deploy.sh`.
4. Set the start command to `cd dist-prod && npm start`.

### Netlify + Render

1. Deploy the client to Netlify:
   - Connect your GitHub repository to Netlify.
   - Set the build command to `npm run build`.
   - Set the publish directory to `dist`.

2. Deploy the server to Render:
   - Create a new Web Service on Render.
   - Connect your GitHub repository.
   - Set the build command to `cd server && npm install && npm run build`.
   - Set the start command to `cd server && node dist/index.js`.

## Playing the Game

1. Create a new game room by clicking "Create New Game".
2. Share the room code with your opponent.
3. Your opponent joins the game by entering the room code and clicking "Join Game".
4. The host starts the game when both players are ready.
5. Take turns placing stones on the board.
6. Watch for magnetic interactions and try to avoid clustering your stones.
7. The first player to place all their stones without causing a cluster wins!

## License

MIT
