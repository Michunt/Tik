# TikTok Video Downloader

A modern web application built with Next.js that allows users to download TikTok videos easily using yt-dlp. The application provides options to download videos with or without watermarks, and also extract audio from TikTok videos.

## Features

- Clean and modern UI
- Paste URL functionality
- Multiple download options:
  - Download video with watermark
  - Download video without watermark
  - Download audio only
- Progress indication
- Error handling

## Prerequisites

Before running this application, make sure you have the following installed:
- Node.js (v18 or later)
- yt-dlp (must be installed and accessible in your system PATH)

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

## Usage

1. Copy a TikTok video URL
2. Paste it into the input field (or click the clipboard button)
3. Click "Check URL" to validate the TikTok video
4. Choose your preferred download option:
   - Download Video (with watermark)
   - Download Audio Only
   - Download Without Watermark

## How It Works

This application uses yt-dlp, a powerful command-line tool for downloading videos from various platforms including TikTok. The web interface provides a user-friendly way to interact with yt-dlp.

When you submit a TikTok URL:
1. The application first validates the URL and retrieves video information
2. Then it offers download options based on your preference
3. When you select an option, it uses yt-dlp to download the video in the requested format
4. The downloaded file is then served to your browser for download

## Tech Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- yt-dlp (for video downloading)

## License

MIT License
