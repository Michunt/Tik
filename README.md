# TikTok Video Downloader

A modern web application built with Next.js that allows users to download TikTok videos easily using yt-dlp. The application provides options to download videos with or without watermarks, extract audio from TikTok videos, and enhance video quality.

## Features

- Clean and modern UI
- Paste URL functionality
- Multiple download options:
  - Download video with watermark
  - Download video without watermark
  - Download audio only
  - Download enhanced HD video (no watermark)
- Progress indication
- Error handling

## Prerequisites

Before running this application, make sure you have the following installed:
- Node.js (v18 or later)
- yt-dlp (must be installed and accessible in your system PATH)
- FFmpeg (for video enhancement features)

### Installing yt-dlp

#### Windows
1. Download the latest yt-dlp.exe from the [official GitHub releases page](https://github.com/yt-dlp/yt-dlp/releases)
2. Place the exe file in a directory that's in your PATH (e.g., C:\Windows)
3. Verify installation by opening Command Prompt or PowerShell and typing:
   ```
   yt-dlp --version
   ```

#### macOS/Linux
1. Install using pip:
   ```bash
   pip install yt-dlp
   ```
2. Or using Homebrew (macOS):
   ```bash
   brew install yt-dlp
   ```
3. Verify installation:
   ```bash
   yt-dlp --version
   ```

### Installing FFmpeg

#### Windows
1. Download FFmpeg from the [official website](https://ffmpeg.org/download.html) or use a Windows build from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/)
2. Extract the archive to a location like `C:\FFmpeg`
3. Add the `bin` folder to your PATH environment variable or set the FFMPEG_PATH environment variable
4. Verify installation by opening Command Prompt or PowerShell and typing:
   ```
   ffmpeg -version
   ```

#### macOS
```bash
brew install ffmpeg
```

#### Linux
```bash
sudo apt update
sudo apt install ffmpeg
```

## Installation

1. Clone the repository:
```bash
git clone [repository-url]
cd tiktok-downloader
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment on Netlify

This application can be deployed on Netlify with the following steps:

1. Fork or clone this repository to your GitHub account
2. Log in to Netlify and click "New site from Git"
3. Select your repository
4. Configure the build settings:
   - Build command: `npm run build` (the install-dependencies.js script will run automatically)
   - Publish directory: `.next`
5. No need to set environment variables manually - the deployment script will handle this automatically
6. Deploy the site

### How the Netlify Deployment Works

This application includes a custom deployment script (`scripts/install-dependencies.js`) that automatically:

1. Installs yt-dlp during the build process
2. Sets up the necessary environment variables
3. Makes yt-dlp available to the application at runtime

This ensures that the application works correctly on Netlify without manual configuration. The script:

- Downloads the latest yt-dlp binary
- Makes it executable
- Creates symlinks to make it available in the PATH
- Sets up environment variables pointing to the installed binaries

If you're deploying to a different platform, you may need to adapt this script or manually install yt-dlp.

## Usage

1. Copy a TikTok video URL
2. Paste it into the input field (or click the clipboard button)
3. Click "Check URL" to validate the TikTok video
4. Choose your preferred download option:
   - Download Video (with watermark)
   - Download Audio Only
   - Download Without Watermark
   - Download Enhanced HD Video (no watermark)

## How It Works

This application uses yt-dlp, a powerful command-line tool for downloading videos from various platforms including TikTok. The web interface provides a user-friendly way to interact with yt-dlp.

When you submit a TikTok URL:
1. The application first validates the URL and retrieves video information
2. Then it offers download options based on your preference
3. When you select an option, it uses yt-dlp to download the video in the requested format
4. For enhanced HD videos, FFmpeg is used to improve video quality
5. The downloaded file is then served to your browser for download

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- yt-dlp (for video downloading)
- FFmpeg (for video enhancement)

## License

MIT License
