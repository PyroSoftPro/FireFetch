@echo off
echo Building FireFetch Portable Edition...
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

REM Create required directories
if not exist "downloads" mkdir downloads
if not exist "cookies" mkdir cookies
if not exist "dep" (
    echo ERROR: dep folder not found!
    echo Please create a 'dep' folder and add:
    echo - aria2c.exe
    echo - ffmpeg.exe
    echo - yt-dlp.exe
    pause
    exit /b 1
)

REM Check if all required executables exist in dep folder
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

REM Build the portable application
echo Building Windows portable executable...
call npx electron-builder --win portable

REM Check if the build was successful
if not exist "dist\FireFetch-Portable.exe" (
    echo Error: Build failed! Portable executable not created.
    pause
    exit /b 1
)

REM Create the final distribution folder
echo Creating portable distribution...
if exist "dist\FireFetch-Portable" rmdir /s /q "dist\FireFetch-Portable"
mkdir "dist\FireFetch-Portable"

REM Move the portable exe
move "dist\FireFetch-Portable.exe" "dist\FireFetch-Portable\" >nul

REM Copy external folders
xcopy "dep" "dist\FireFetch-Portable\dep\" /E /Y /I >nul
mkdir "dist\FireFetch-Portable\downloads" 2>nul
mkdir "dist\FireFetch-Portable\cookies" 2>nul

REM Create launcher scripts
echo @echo off > "dist\FireFetch-Portable\FireFetch.bat"
echo start "" "%%~dp0FireFetch-Portable.exe" >> "dist\FireFetch-Portable\FireFetch.bat"

REM Create readme
echo Creating README...
(
echo FireFetch Portable Edition
echo =========================
echo.
echo This is a single-file portable version of FireFetch.
echo.
echo Structure:
echo - FireFetch-Portable.exe - Main application (all resources included)
echo - dep\ - External tools (aria2c, ffmpeg, yt-dlp)
echo - downloads\ - Your downloaded videos
echo - cookies\ - Cookie files for authentication
echo.
echo To run:
echo - Double-click FireFetch-Portable.exe
echo - Or run FireFetch.bat
echo.
echo The portable exe extracts to a temporary folder on first run.
echo Settings, downloads, and cookies are saved next to the exe.
echo.
echo You can move this entire folder to any location or USB drive.
echo.
) > "dist\FireFetch-Portable\README.txt"

echo.
echo Portable build complete!
echo Location: dist\FireFetch-Portable\
echo.
echo Files:
dir /b "dist\FireFetch-Portable"
echo.
echo Size of portable exe:
powershell -Command "$size = (Get-Item 'dist\FireFetch-Portable\FireFetch-Portable.exe').Length; Write-Host ('{0:N2} MB' -f ($size / 1MB))"
echo.
pause