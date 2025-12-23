// Simple test to verify the API endpoint works
const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3001; // Use different port

// Simple version of the videos endpoint
app.get('/api/videos', async (req, res) => {
    try {
        const downloadsDir = path.join(__dirname, 'downloads');
        const files = await fs.readdir(downloadsDir);
        
        const videos = [];
        
        for (const file of files) {
            if (file.startsWith('.')) continue;
            
            const filePath = path.join(downloadsDir, file);
            const stats = await fs.stat(filePath);
            
            if (stats.isFile() && !file.endsWith('.info.json')) {
                // Check if metadata file exists
                const metadataFile = path.join(downloadsDir, `${file}.info.json`);
                let metadata = null;
                
                try {
                    const metadataContent = await fs.readFile(metadataFile, 'utf8');
                    metadata = JSON.parse(metadataContent);
                } catch (e) {
                    // No metadata file
                }
                
                // Determine if it's a torrent download
                const isTorrentDownload = file.match(/\.(iso|img|dmg|exe|zip|rar|7z|tar|gz|bin|deb|rpm|pkg)$/i);
                
                const videoData = {
                    filename: file,
                    title: metadata?.title || file,
                    description: metadata?.description || '',
                    thumbnail: metadata?.thumbnail || '',
                    duration: metadata?.duration_string || (isTorrentDownload ? 'N/A' : ''),
                    uploader: metadata?.uploader || (isTorrentDownload ? 'BitTorrent Network' : ''),
                    site: metadata?.extractor || (isTorrentDownload ? 'torrent' : ''),
                    siteKey: metadata?.extractor_key || (isTorrentDownload ? 'torrent' : ''),
                    siteDomain: metadata?.webpage_url_domain || (isTorrentDownload ? 'torrent' : ''),
                    siteUrl: metadata?.webpage_url || '',
                    fileType: isTorrentDownload ? 'torrent' : 'video',
                    downloadDate: metadata?.download_date || stats.birthtime,
                    size: stats.size,
                    totalSize: metadata?.total_size || stats.size
                };
                
                videos.push(videoData);
            }
        }
        
        console.log('Found videos:', videos.length);
        console.log('Videos:', videos.map(v => `${v.filename} (${v.fileType})`));
        
        res.json({ videos });
    } catch (error) {
        console.error('Error in /api/videos:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Test server running at http://localhost:${PORT}`);
    console.log(`Test URL: http://localhost:${PORT}/api/videos`);
});