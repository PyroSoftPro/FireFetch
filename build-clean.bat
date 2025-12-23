@echo off
echo Building FireFetch with minimal structure...
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

REM Build the application
echo Building Windows application...
call npx electron-builder build --win --dir

REM Check if the build was successful
if not exist "dist\win-unpacked\FireFetch.exe" (
    echo Error: Build failed! Executable not created.
    pause
    exit /b 1
)

REM Create the final distribution folder with desired structure
echo Creating minimal distribution...
if exist "dist\FireFetch" rmdir /s /q "dist\FireFetch"
mkdir "dist\FireFetch"

REM Copy only essential files
echo Copying essential files...

REM Main executable
copy "dist\win-unpacked\FireFetch.exe" "dist\FireFetch\" >nul

REM Essential Electron files
copy "dist\win-unpacked\chrome_100_percent.pak" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\chrome_200_percent.pak" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\d3dcompiler_47.dll" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\ffmpeg.dll" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\icudtl.dat" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\libEGL.dll" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\libGLESv2.dll" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\LICENSE*" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\resources.pak" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\snapshot_blob.bin" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\v8_context_snapshot.bin" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\vk_swiftshader.dll" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\vk_swiftshader_icd.json" "dist\FireFetch\" >nul 2>&1
copy "dist\win-unpacked\vulkan-1.dll" "dist\FireFetch\" >nul 2>&1

REM Copy locales folder
xcopy "dist\win-unpacked\locales" "dist\FireFetch\locales\" /E /Y /I >nul

REM Copy resources
mkdir "dist\FireFetch\resources"
copy "dist\win-unpacked\resources\app.asar" "dist\FireFetch\resources\" >nul
xcopy "dist\win-unpacked\resources\app.asar.unpacked\node_modules" "dist\FireFetch\resources\app.asar.unpacked\node_modules\" /E /Y /I >nul 2>&1

REM Copy our resources (dep and public)
xcopy "dist\win-unpacked\resources\dep" "dist\FireFetch\resources\dep\" /E /Y /I >nul
xcopy "dist\win-unpacked\resources\public" "dist\FireFetch\resources\public\" /E /Y /I >nul

REM Create empty folders
mkdir "dist\FireFetch\downloads" 2>nul
mkdir "dist\FireFetch\cookies" 2>nul

REM Create launcher scripts
echo @echo off > "dist\FireFetch\FireFetch.bat"
echo cd /d "%%~dp0" >> "dist\FireFetch\FireFetch.bat"
echo start "" "FireFetch.exe" >> "dist\FireFetch\FireFetch.bat"

REM Create a readme
echo Creating README...
(
echo FireFetch - Video Downloader
echo ===========================
echo.
echo How to run:
echo - Double-click FireFetch.exe
echo - Or run FireFetch.bat
echo.
echo Directory Structure:
echo - FireFetch.exe - Main application
echo - resources\dep\ - Required tools (aria2c, ffmpeg, yt-dlp)
echo - resources\public\ - Application UI files
echo - downloads\ - Your downloaded videos
echo - cookies\ - Cookie files for authentication
echo - locales\ - Language files
echo.
echo Settings are saved in settings.json next to the exe.
echo.
echo Enjoy FireFetch!
) > "dist\FireFetch\README.txt"

echo.
echo Build complete! 
echo Location: dist\FireFetch\
echo.
echo Distribution size: 
dir "dist\FireFetch" | find "File(s)"
echo.
pause