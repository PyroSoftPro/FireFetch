# Troubleshooting Guide

This guide covers common issues encountered when developing, building, or using FireFetch, along with their solutions.

## Installation & Setup Issues

### Node.js and Dependencies

**Issue: `npm install` fails**
```
Error: Cannot resolve dependency tree
```

**Solution:**
On Windows (PowerShell):

```powershell
npm cache clean --force
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

**Issue: `electron` not found**
```
'electron' is not recognized as an internal or external command
```

**Solution:**
```bash
# Install electron globally (optional)
npm install -g electron

# Or use npx
npx electron .
```

### External Dependencies

**Issue: Missing tools in `dep/` folder**
```
ERROR: dep folder not found!
ERROR: aria2c.exe not found in dep folder!
```

**Solution:**
1. Create `dep/` folder in project root
2. Download required tools:
   - [yt-dlp](https://github.com/yt-dlp/yt-dlp/releases) → `dep/yt-dlp.exe`
   - [aria2c](https://github.com/aria2/aria2/releases) → `dep/aria2c.exe`  
   - [ffmpeg](https://ffmpeg.org/download.html) → `dep/ffmpeg.exe`
3. Ensure executables are not corrupted/quarantined by antivirus

**Issue: Tools blocked by antivirus**
```
Access denied
Permission denied
File not found (even though it exists)
```

**Solution:**
- Add `dep/` folder to antivirus exclusions
- Temporarily disable real-time protection during setup
- Download tools from official sources only
- Check Windows Defender quarantine and restore files

## Development Issues

### Application Won't Start

**Issue: `npm start` fails**
```
Error: Cannot find module 'express'
Port 3000 already in use
```

**Solution:**
```powershell
# Ensure dependencies are installed
npm install

# Find who owns port 3000
netstat -ano | findstr :3000

# Kill by PID (replace <pid>)
taskkill /PID <pid> /F

npm start
```

**Issue: Blank white screen**
```
Application opens but shows blank screen
```

**Solution:**
1. Check browser console for errors (Ctrl+Shift+I)
2. Verify Express server is running on port 3000
3. Check file paths in console output
4. Ensure `public/` folder exists with HTML files

### Path Resolution Issues

**Issue: Resources not found in packaged app**
```
Cannot read property 'public' of undefined
ENOENT: no such file or directory, open 'public/index.html'
```

**Solution:**
1. Check `extraResources` in `package.json`
2. Verify path resolution logic in `app.js`:
   ```javascript
   // Debug path resolution
   console.log('Paths:', {
       basePath,
       resourcesPath, 
       depPath,
       isPackaged: app.isPackaged
   });
   ```
3. Ensure resources are copied during build

## Build Issues

### Build Failures

**Issue: `electron-builder` fails**
```
Error: Application entry file "dist/main.js" in the "dist" does not exist
```

**Solution:**
```bash
# Clear build cache
rm -rf dist/
rm -rf node_modules/.cache/

# Rebuild
npm run build-clean
```

**Issue: Missing executable in build**
```
Error: Build failed! Executable not created.
```

**Solution:**
1. Check Node.js version compatibility (use LTS)
2. Verify all dependencies are installed
3. Run build with verbose output:
   ```bash
   DEBUG=electron-builder npx electron-builder
   ```
4. Check disk space and permissions

### Build Size Issues

**Issue: Build too large (>500MB)**
```
Final package size exceeds reasonable limits
```

**Solution:**
1. Review `files` exclusions in `package.json`
2. Check for accidentally included files:
   ```bash
   # Analyze build contents
   ls -la dist/win-unpacked/
   ```
3. Exclude unnecessary files:
   ```json
   "files": [
     "**/*",
     "!downloads/**/*",
     "!cookies/**/*", 
     "!*.log",
     "!node_modules/*/.git/**"
   ]
   ```

## Runtime Issues

### Video Download Problems

**Issue: "Authentication required" errors**
```
Sign in to confirm you're not a bot
Private video
Cookies are needed
```

**Solution:**
1. Export cookies from browser:
   - Install cookie export extension
   - Export to Netscape format (.txt)
   - Upload via Settings → Cookie Management
2. Verify cookie file format (should start with `# Netscape HTTP Cookie File`)
3. Test with a public video first

**Issue: Download fails with "DRM protected"**
```
This video is DRM protected and cannot be downloaded
```

**Solution:**
- This is expected behavior - DRM content cannot be downloaded
- Try alternative sources or formats
- Check if video has non-DRM versions available

**Issue: Slow download speeds**
```
Downloads are slower than expected
```

**Solution:**
1. Adjust connection settings in Settings:
   - Increase connections (up to 16)
   - Increase segments (up to 16)
   - Adjust segment size
2. Check internet connection speed
3. Some servers limit connection counts

### File System Issues

**Issue: Permission denied errors**
```
EACCES: permission denied, mkdir 'downloads'
EPERM: operation not permitted
```

**Solution:**
1. Run as administrator (Windows)
2. Check download directory permissions
3. Change download directory to user-writable location
4. For portable mode, ensure exe has write permissions

**Issue: Downloads folder not found**
```
Error creating downloads directory
```

**Solution:**
1. Check download directory path in settings
2. Ensure parent directory exists
3. Use absolute paths, not relative
4. Verify disk space availability

### Performance Issues

**Issue: High CPU/memory usage**
```
Application becomes unresponsive
High memory consumption
```

**Solution:**
1. Limit concurrent downloads
2. Reduce connection/segment counts
3. Close unused browser tabs in app
4. Check for memory leaks in child processes
5. Restart application periodically

**Issue: UI freezing during downloads**
```
Interface becomes unresponsive during download
```

**Solution:**
1. Check the Downloads page for live progress and retry status
2. Check for blocking operations in main thread
3. Verify SSE (Server-Sent Events) are working
4. Monitor network activity

## Platform-Specific Issues

### Windows Issues

**Issue: Windows Defender blocks execution**
```
Windows protected your PC
This app can't run on your PC
```

**Solution:**
1. Click "More info" → "Run anyway"
2. Add to Windows Defender exclusions
3. Sign executable (for distribution)
4. Submit to Microsoft for analysis

**Issue: PowerShell execution policy**
```
Execution of scripts is disabled on this system
```

**Solution:**
```powershell
# Allow current user to run scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Portable Mode Issues

**Issue: Settings not persisting in portable mode**
```
Settings reset on restart
Downloads disappear
```

**Solution:**
1. Ensure portable exe is not in read-only location
2. Check if running from CD/DVD (copy to hard drive)
3. Verify user has write permissions to exe directory
4. Check antivirus isn't blocking file creation

## Network Issues

### Connectivity Problems

**Issue: Cannot fetch video info**
```
Network error
Failed to fetch video info
Connection timeout
```

**Solution:**
1. Check internet connection
2. Verify firewall isn't blocking the application
3. Try different DNS servers (8.8.8.8, 1.1.1.1)
4. Test with different video URLs
5. Check proxy settings if applicable

**Issue: Rate limiting**
```
Too many requests
Rate limit exceeded
```

**Solution:**
1. Wait before retrying
2. Use cookies for authentication
3. Reduce connection counts
4. Avoid rapid successive requests

## Debug Information Collection

### Enable Debug Logging
Add to `app.js` for troubleshooting:

```javascript
// Debug environment info
console.log('Debug Info:', {
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    basePath,
    depPath,
    userDataPath,
    execPath: process.execPath
});

// Debug external tools
const tools = ['yt-dlp.exe', 'aria2c.exe', 'ffmpeg.exe'];
tools.forEach(tool => {
    const toolPath = path.join(depPath, tool);
    console.log(`${tool}:`, {
        exists: fsSync.existsSync(toolPath),
        path: toolPath,
        size: fsSync.existsSync(toolPath) ? fsSync.statSync(toolPath).size : 'N/A'
    });
});
```

### Browser DevTools
Access debugging tools:
- Ctrl+Shift+I (Windows/Linux) or Cmd+Opt+I (Mac)

### Log Files
Check these locations for logs:
- **Console output:** Main process logs
- **DevTools Console:** Renderer process logs  
- **Windows Event Viewer:** System-level errors
- **Antivirus logs:** Blocked file information

## Getting Help

### Information to Include
When reporting issues, include:

1. **System Information:**
   - Operating system and version
   - Node.js version (`node --version`)
   - FireFetch version

2. **Error Details:**
   - Complete error message
   - Steps to reproduce
   - Expected vs actual behavior

3. **Environment:**
   - Development vs packaged version
   - File paths and permissions
   - Network configuration

4. **Logs:**
   - Console output
   - Error screenshots
   - Debug information

### Common Solutions Summary

| Issue Type | First Check | Common Fix |
|------------|-------------|------------|
| Won't start | Dependencies installed | `npm install` |
| Build fails | Disk space, permissions | Clear cache, rebuild |
| Tools missing | `dep/` folder exists | Download from official sources |
| Permission errors | Run as administrator | Change directory permissions |
| Network issues | Internet connection | Check firewall, DNS |
| Downloads fail | Authentication | Upload cookies file |
| Slow performance | System resources | Reduce connection counts |

### Quick Fixes Checklist

1. ✅ Restart the application
2. ✅ Clear browser cache (Ctrl+Shift+R)
3. ✅ Check internet connection
4. ✅ Verify all files in `dep/` folder
5. ✅ Run as administrator (Windows)
6. ✅ Check antivirus exclusions
7. ✅ Update to latest yt-dlp version
8. ✅ Try with a different video URL
9. ✅ Clear `node_modules` and reinstall
10. ✅ Check available disk space