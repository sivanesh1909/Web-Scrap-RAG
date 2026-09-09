import subprocess
import sys
import time
import os

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

print("=" * 60)
print("🚀 Starting AethelExult.AI Autonomous Platform")
print("=" * 60)

root_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(root_dir, "backend")
frontend_dir = os.path.join(root_dir, "frontend")

# 1. Start FastAPI Backend
print("\n[1/2] Launching FastAPI Backend on http://127.0.0.1:8000 ...")
backend_proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"],
    cwd=root_dir
)

time.sleep(2)

# 2. Start Next.js Frontend
print("\n[2/2] Launching Next.js Frontend on http://localhost:3000 ...")
npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
frontend_proc = subprocess.Popen(
    f"{npm_cmd} run dev",
    shell=True,
    cwd=frontend_dir
)

print("\n" + "=" * 60)
print("✨ AethelExult.AI is LIVE!")
print("🌐 Frontend: http://localhost:3000")
print("⚡ Backend API: http://127.0.0.1:8000")
print("📖 API Docs: http://127.0.0.1:8000/docs")
print("=" * 60)
print("Press Ctrl+C to terminate both servers.\n")

try:
    backend_proc.wait()
    frontend_proc.wait()
except KeyboardInterrupt:
    print("\nShutting down AethelExult.AI services...")
    backend_proc.terminate()
    frontend_proc.terminate()
    print("Services stopped.")
