'use client';

import { useState, useEffect } from 'react';

interface VideoInfo {
  success: boolean;
  title?: string;
  duration?: number;
  webpage_url?: string;
  error?: string;
  details?: string;
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadType, setDownloadType] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleValidate = async () => {
    if (!url) {
      setError('URL parameter is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    setVideoInfo(null);
    
    try {
      // First, check if the URL is valid with a more comprehensive regex
      // This will handle various TikTok URL formats including @icc/video/7474632974
      if (!url.match(/https?:\/\/(www\.|vm\.)?(tiktok\.com)(\/[@\w.-]+\/video\/\d+|\/@[\w.-]+\/video\/\d+|\/.*\/video\/\d+)/i)) {
        throw new Error('Invalid TikTok URL');
      }
      
      // Set basic video info
      setVideoInfo({
        success: true,
        title: 'TikTok Video',
        duration: 30 // Placeholder
      });
    } catch (error: unknown) {
      console.error('Error:', error);
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: string) => {
    if (!url) {
      setError('URL parameter is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    setDownloadType(format);
    
    try {
      // Create URL with query parameters
      const apiUrl = `/.netlify/functions/node-ytdlp?url=${encodeURIComponent(url)}&format=${format}`;
      
      // Download the video using our Netlify function with GET request
      const response = await fetch(apiUrl);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to download video');
      }

      // Parse the JSON response
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to download video');
      }
      
      // Create a blob from the base64 data
      const byteCharacters = atob(data.data);
      const byteArrays = [];
      
      for (let offset = 0; offset < byteCharacters.length; offset += 512) {
        const slice = byteCharacters.slice(offset, offset + 512);
        
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      
      // Determine content type
      const contentType = data.contentType || (format === 'audio' ? 'audio/mp3' : 'video/mp4');
      
      // Create blob and download
      const blob = new Blob(byteArrays, { type: contentType });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = data.filename || `tiktok-${format}.${format === 'audio' ? 'mp3' : 'mp4'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error: unknown) {
      console.error('Error:', error);
      let errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Make error messages more user-friendly
      if (errorMessage.includes('command not found')) {
        errorMessage = 'Server configuration error: Required tools are not available. Please try again later.';
      } else if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('fetch')) {
        errorMessage = 'Network error: Please check your internet connection and try again.';
      } else if (errorMessage.includes('tiktok')) {
        errorMessage = 'Error processing TikTok video: Please ensure you have a valid TikTok video URL.';
      } else if (errorMessage.includes('Failed to download')) {
        errorMessage = 'Download error: Could not download the video. The video might be private or removed.';
      } else if (errorMessage.includes('API')) {
        errorMessage = 'API error: Our video processing service is experiencing issues. Please try again later.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
      setDownloadType(null);
    }
  };

  // Don't render anything until mounted to prevent hydration errors
  if (!mounted) {
    return null;
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-6 space-y-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">TikTok Downloader</h1>
          <p className="text-gray-600 text-sm">Download TikTok videos with ease!</p>
        </div>

        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Paste TikTok video URL here"
              className="w-full p-3 border rounded-lg pr-10 focus:outline-none focus:border-pink-500"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.readText().then(text => setUrl(text));
                }
              }}
            >
              📋
            </button>
          </div>

          {error && (
            <div className="text-red-500 text-sm text-center p-2 bg-red-50 rounded-lg">
              {error}
            </div>
          )}

          {!videoInfo ? (
            <button
              onClick={handleValidate}
              disabled={loading || !url}
              className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-300"
            >
              {loading ? 'Processing...' : 'Check URL'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-50 p-3 rounded-lg">
                <h3 className="font-medium text-center mb-2">{videoInfo.title}</h3>
                {videoInfo.duration && (
                  <p className="text-sm text-center text-gray-500">Duration: {videoInfo.duration} seconds</p>
                )}
              </div>
              
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => handleDownload('video')}
                  disabled={loading}
                  className="w-full bg-black text-white py-2 rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-300"
                >
                  {loading && downloadType === 'video' ? 'Downloading...' : 'Download Video'}
                </button>
                <button 
                  onClick={() => handleDownload('audio')}
                  disabled={loading}
                  className="w-full bg-blue-500 text-white py-2 rounded-lg font-medium hover:bg-blue-600 disabled:bg-gray-300"
                >
                  {loading && downloadType === 'audio' ? 'Downloading...' : 'Download Audio Only'}
                </button>
                <button 
                  onClick={() => handleDownload('hd')}
                  disabled={loading}
                  className="w-full bg-red-500 text-white py-2 rounded-lg font-medium hover:bg-red-600 disabled:bg-gray-300"
                >
                  {loading && downloadType === 'hd' ? 'Processing HD Video...' : 'Download Enhanced HD (No Watermark)'}
                </button>
                <button 
                  onClick={() => {
                    setUrl('');
                    setVideoInfo(null);
                    setError(null);
                  }}
                  className="w-full text-gray-500 text-sm hover:text-gray-700"
                >
                  Try another video
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
