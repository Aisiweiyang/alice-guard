@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 24.19 or newer is required.
  pause
  exit /b 1
)
node -e "const [major, minor] = process.versions.node.split('.').map(Number); if (major < 24 || (major === 24 && minor < 19)) process.exit(1)"
if errorlevel 1 (
  echo Node.js 24.19 or newer is required. Check your installed version.
  pause
  exit /b 1
)
if not exist "node_modules\.bin\tsx.cmd" (
  echo Dependencies are missing. In this folder run:
  echo npx.cmd -y pnpm@11.19.0 install --frozen-lockfile
  pause
  exit /b 1
)
echo Alice Guard - offline proposal review demo
echo Open the local URL printed below. Keep this window open.
echo Signing, broadcast and funding are disabled.
call npm.cmd run demo:web
if errorlevel 1 (
  echo Demo stopped with an error. See the message above.
  pause
  exit /b 1
)
