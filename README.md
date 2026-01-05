<img style="width: 128px; height: 128px" src="public/favicon.svg" /><h1 style="font-size: 48px"><a href="https://editmash.com">EditMash.com</a> - the multiplayer video editor.</h1>

[Privacy Policy](https://editmash.com/legal/privacy) | [Terms of Service](https://editmash.com/legal/terms) | [License](LICENSE)

## About

EditMash is a multiplayer collaborative video editor where hundreds of players join timed "matches" to create videos together on a shared timeline. When time expires, the final timeline is rendered and uploaded to the viewable Library.

## Features

- 🎬 **Real-time Multiplayer Editing** - Multiple players edit the same timeline simultaneously
- ⏱️ **Timed Matches** - Lobby-based gameplay with configurable match durations (5s, 30s, 60s max)
- 🎨 **Multi-track Timeline** - Support for up to 100 video and audio tracks
- 🎵 **Audio & Video Support** - Upload and edit video clips with separate audio control
- 🔧 **Match Configuration** - Customizable parameters including:
  - Timeline duration
  - Clip size limits (min/max duration for "blobs")
  - Audio volume ceiling (max dB)
  - Maximum track count
  - Player limit (supports hundreds to (probably) thousands of concurrent players)
- 🎮 **Timeline Tools** - Move, trim, split, and snap alignmen
- 📺 **Live Preview** - Real-time 1920x1080 canvas rendering
- 🚀 **YouTube Upload** - Automatic rendering and upload of completed collaborative videos
- 💬 **Match Chat** - In-match communication between players

![Preview](public/thumbnail.png)
![Preview 2](public/preview.png)

## Development Setup

### Prerequisites

Before you begin, make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or higher, LTS recommended)
- [Bun](https://bun.sh/) (for WebSocket server)
- [Docker](https://www.docker.com/) (for running Redis and the project itself)
- [FFmpeg](https://ffmpeg.org/) (for video rendering)

### Getting Started

1. **Clone the repository**

   ```bash
   git clone https://github.com/outpoot/editmash.git
   cd editmash
   ```

2. **Set up Redis**

   Redis is used for session management and real-time state synchronization.

   Create a Redis Docker container:
   ```bash
   docker run -d --name editmash-redis -p 6379:6379 -v editmash_redisdata:/data --restart unless-stopped redis:8-alpine redis-server --save 60 1
   ```

   **Alternative:** You can also [download and install Redis directly](https://redis.io/downloads/) or use a managed Redis service such as [Redis Cloud](https://redis.com/cloud/).

3. **Set up PostgreSQL**

   PostgreSQL stores user data, match history, media metadata, and lobby configurations.

   - **Run Postgres locally with Docker:**
     ```bash
     docker run -d --name editmash-postgres -e POSTGRES_USER=pguser -e POSTGRES_PASSWORD=pgpass -e POSTGRES_DB=editmash -p 5432:5432 -v editmash_pgdata:/var/lib/postgresql/data --restart unless-stopped postgres:16
     ```

   - **Use a managed cloud Postgres provider:**
     Services like [Supabase](https://supabase.com/), [Neon](https://neon.tech/), or [Railway](https://railway.app/) provide managed PostgreSQL instances with free tiers.

   After your database is running, update your `DATABASE_URL` in the `.env` file to point to your Postgres instance.

   Run database migrations:
   ```bash
   npx drizzle-kit push
   ```

4. **Set up Backblaze B2 Storage**

   EditMash uses Backblaze B2 for storing user-uploaded media files (video and audio clips).

   - Create a [Backblaze account](https://www.backblaze.com/b2/sign-up.html)
   - Create a new B2 bucket (note the bucket name and region)
   - Generate application keys (Application Key ID and Application Key)
   - Configure CORS rules for your bucket:
     ```bash
     # Install B2 CLI: https://www.backblaze.com/docs/cloud-storage-command-line-tools
     b2 bucket update --cors-rules "$(cat ./cors-rules.json)" <bucketName> allPublic
     ```

5. **Configure Google OAuth**

   - Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Create OAuth 2.0 credentials:
     - Application type: "Web application"
     - Authorized redirect URIs:
       - `http://localhost:3000/api/auth/callback/google` (development)
       - `https://YOUR_WEBSITE.com/api/auth/callback/google` (optional - production)

7. **Configure Environment Variables**

   Create a `.env` file in the root directory:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your values:

   ```ini
   # --- Database ---
   DATABASE_URL=postgres://pguser:pgpass@localhost:5432/editmash

   # --- Redis ---
   REDIS_URL=redis://localhost:6379

   # --- Auth ---
   BETTER_AUTH_SECRET=your_random_secret_here_minimum_32_chars
   BETTER_AUTH_URL=http://localhost:3000  # Change to your production URL in production

   # --- Google OAuth ---
   GOOGLE_CLIENT_ID=your_google_client_id
   GOOGLE_CLIENT_SECRET=your_google_client_secret

   # --- Backblaze B2 Storage ---
   B2_APPLICATION_KEY_ID=your_b2_key_id
   B2_APPLICATION_KEY=your_b2_application_key
   B2_BUCKET_NAME=your_bucket_name
   B2_BUCKET_ID=your_bucket_id
   B2_REGION=us-west-004  # Your bucket region

   # --- WebSocket Server ---
   NEXT_PUBLIC_WS_URL=ws://localhost:8080
   ```

8. **Configure WebSocket Server Environment**

   Create a `.env` file in the `websocket/` directory:

   ```bash
   cd websocket
   cp .env.example .env
   cd ..
   ```

   Edit `websocket/.env` with your values:

   ```ini
   # --- WebSocket Server ---
   WS_PORT=8080
   WS_API_KEY=your_secure_random_key_here  # Must match the key used by Next.js app

   # --- Database (same as root .env) ---
   DATABASE_URL=postgres://pguser:pgpass@localhost:5432/editmash

   # --- Redis (same as root .env) ---
   REDIS_URL=redis://localhost:6379

   # --- Your website URL ---
   NEXT_PUBLIC_API_URL=http://localhost:3000
   ```

   **Important Notes:**
   - `WS_API_KEY` is used to secure internal HTTP endpoints (e.g., `/notify/lobbies`) - generate a secure random string
   - Database and Redis URLs should match your root `.env` configuration

9. **Install Dependencies**

   Install dependencies for the main application:
   ```bash
   npm install
   ```

   Set up the WebSocket server:
   ```bash
   cd websocket
   bun install
   cd ..
   ```

### Running the Application

1. **Start the WebSocket server** (in one terminal)

   The WebSocket server handles real-time collaboration between players:
   ```bash
   cd websocket
   bun run server.ts
   ```

2. **Start the Next.js application** (in another terminal)

   ```bash
   npm run dev
   ```

   The development server will be available at http://localhost:3000

3. **Verify FFmpeg Installation**

   EditMash requires FFmpeg for rendering final videos. Verify it's installed:
   ```bash
   ffmpeg -version
   ```

   If not installed, download from [ffmpeg.org](https://ffmpeg.org/download.html) or use a package manager:
   - **Windows**: `choco install ffmpeg` or `winget install ffmpeg`
   - **macOS**: `brew install ffmpeg`
   - **Linux**: `apt install ffmpeg` or `yum install ffmpeg`

### Production Deployment

1. **Configure production environment variables**

   Update `.env` with production values (database URLs, domains, etc.)

2. **Build and start:**

   ```bash
   ./build.sh
   ```

3. The app will be available at http://localhost:3002

## License

This project is licensed under the **Creative Commons Attribution-NonCommercial 4.0 International** License (**CC BY-NC 4.0**). See the [LICENSE](LICENSE) file for details.

Made by [FaceDev](https://youtube.com/@FaceDevStuff) (:
