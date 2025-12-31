@echo off
echo Building FireFetch as a SINGLE portable executable...
echo.

REM Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies...
    call npm install
)

REM Clean previous build
if exist "dist" (
    echo Removing previous build...
    rmdir /s /q dist
)

REM Validate required external executables exist at build time.
REM NOTE: dep/ is NOT bundled into the portable exe. The final runtime expects dep/ to exist next to the portable exe.
if not exist "dep" (
    echo ERROR: dep folder not found!
    echo Please create a 'dep' folder and add:
    echo - aria2c.exe
    echo - ffmpeg.exe
    echo - yt-dlp.exe
    pause
    exit /b 1
)
if not exist "dep\aria2c.exe" (
    echo ERROR: aria2c.exe not found in dep folder!
    pause
    exit /b 1
)
if not exist "dep\ffmpeg.exe" (
    echo ERROR: ffmpeg.exe not found in dep folder!
    pause
    exit /b 1
)
if not exist "dep\yt-dlp.exe" (
    echo ERROR: yt-dlp.exe not found in dep folder!
    pause
    exit /b 1
)

REM Build the portable application (single self-extracting exe; app extracts to temp at runtime)
echo Building Windows portable executable...
call npx electron-builder --win portable

REM Check if the build was successful
if not exist "dist\FireFetch-Portable.exe" (
    echo Error: Build failed! Portable executable not created.
    pause
    exit /b 1
)

echo.
echo Single-file portable build complete!
echo Location: dist\FireFetch-Portable.exe
echo.
echo Size of portable exe:
powershell -Command "$size = (Get-Item 'dist\FireFetch-Portable.exe').Length; Write-Host ('{0:N2} MB' -f ($size / 1MB))"
echo.
pause




