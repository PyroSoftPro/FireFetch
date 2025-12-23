# FireFetch - Supported Formats and Sites

FireFetch is a downloader built on `yt-dlp` + `aria2c` + `ffmpeg` and can handle many video sites supported by `yt-dlp`, plus direct file URLs and torrent/magnet links.

## 🎥 Supported Video Formats

### Video File Types
- **MP4** - Universal compatibility, default format
- **AVI** - Windows standard video format
- **MKV** - High quality, supports multiple audio tracks and subtitles
- **MOV** - QuickTime video format
- **WMV** - Windows Media Video
- **FLV** - Flash Video format
- **WebM** - Web-optimized format, smaller file sizes
- **M4V** - iTunes video format
- **3GP** - Mobile video format
- **MPEG/MPG** - Standard video format
- **TS** - Transport Stream format
- **VOB** - DVD video format

### Audio File Types
- **MP3** - Most common audio format
- **WAV** - Uncompressed audio
- **FLAC** - Lossless audio compression
- **AAC** - Advanced Audio Coding
- **OGG** - Open source audio format
- **WMA** - Windows Media Audio
- **M4A** - MPEG-4 audio
- **OPUS** - High-quality audio codec
- **AIFF** - Audio Interchange File Format

## 📐 Quality Options

FireFetch supports automatic quality selection with these options:

- **Best Quality** (default) - Automatically selects highest available quality
- **1080p** - Full HD resolution (1920x1080)
- **720p** - HD resolution (1280x720) 
- **480p** - Standard definition (854x480)
- **360p** - Lower quality for faster downloads (640x360)

## 🌐 Supported Video Platforms (1000+)

### Popular Video Platforms
- **YouTube** - All video types, playlists, live streams
- **Vimeo** - Professional video hosting
- **Dailymotion** - European video platform
- **Twitch** - Gaming streams and VODs
- **Facebook** - Social media videos
- **Instagram** - Stories, reels, IGTV
- **TikTok** - Short-form videos
- **Twitter** - Social media videos
- **Reddit** - Video posts and comments

### Streaming Services & News
- **BBC iPlayer** - British broadcasting
- **CNN** - News videos
- **ESPN** - Sports content
- **Fox News** - News and commentary
- **NBC** - Network television
- **CBS** - Network television
- **ABC** - Network television

### Educational Platforms
- **Khan Academy** - Educational content
- **Coursera** - Online courses
- **edX** - University courses
- **Udemy** - Professional training
- **YouTube Educational** - Educational channels

### International Platforms
- **Bilibili** - Chinese video platform
- **Niconico** - Japanese video sharing
- **Youku** - Chinese streaming service
- **VK** - Russian social network
- **Rutube** - Russian video platform
- **And hundreds more...**

## 📁 Other Supported File Types

FireFetch can also download various other file formats:

### Documents
- **PDF** - Portable Document Format
- **DOC/DOCX** - Microsoft Word documents
- **XLS/XLSX** - Microsoft Excel spreadsheets
- **PPT/PPTX** - Microsoft PowerPoint presentations
- **TXT** - Plain text files
- **MD** - Markdown files
- **CSV** - Comma-separated values
- **JSON** - JavaScript Object Notation
- **XML** - Extensible Markup Language

### Archives
- **ZIP** - Standard archive format
- **RAR** - WinRAR archive format
- **7Z** - 7-Zip archive format
- **TAR** - Unix archive format
- **GZ** - Gzip compressed files
- **BZ2** - Bzip2 compressed files
- **XZ** - LZMA compressed files

### Images
- **JPG/JPEG** - Standard image format
- **PNG** - Portable Network Graphics
- **GIF** - Graphics Interchange Format
- **BMP** - Bitmap image format
- **TIFF** - Tagged Image File Format
- **SVG** - Scalable Vector Graphics
- **WebP** - Modern web image format
- **ICO** - Icon format

### Software & Applications
- **EXE** - Windows executables
- **MSI** - Windows installer packages
- **DMG** - macOS disk images
- **DEB** - Debian packages
- **RPM** - Red Hat packages
- **APK** - Android packages

## 🔗 Special Content Types

### Torrent Downloads
- **Magnet Links** - `magnet:` protocol support
- **Torrent Files** - Direct `.torrent` file downloads
- High-speed multi-connection downloading via aria2c

### Premium/Restricted Content
- **Cookie Authentication** - Upload cookies.txt for private content
- **Age-Restricted Videos** - Access with proper authentication
- **Premium Content** - Support for subscription-based platforms
- **Geo-Restricted Content** - With appropriate access credentials

## ⚙️ Output Container Formats

FireFetch can convert and merge downloaded content into these container formats:

- **MP4** (default) - Universal compatibility, works on all devices
- **MKV** - High quality, supports multiple audio tracks and subtitles
- **WebM** - Web-optimized format, smaller file sizes

## 🚀 Technical Features

### Download Optimization
- **Multi-connection downloads** - Up to 16 simultaneous connections
- **Segmented downloading** - Faster download speeds
- **Resume capability** - Continue interrupted downloads
- **Format selection** - Automatic best quality with fallbacks

### Processing Capabilities
- **Video/Audio merging** - Combine separate streams
- **Format conversion** - Convert between different formats
- **Quality optimization** - Intelligent format selection
- **Metadata preservation** - Keep video information intact

---

*FireFetch’s site support is effectively the set of extractors supported by your bundled `yt-dlp` version. If a site changes, updating `yt-dlp` via the in-app Dependency Manager may restore support.*