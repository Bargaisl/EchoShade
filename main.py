import webview
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from threading import Thread
import window_manager  # Our new module for capture protection
import os
from api import websocket, config_api
from core.config import settings

# --- Development Flag (now from .env) ---
# DEV_MODE is now controlled via .env file - see core/config.py
DEV_MODE = settings.DEV_MODE


# --- FastAPI App Setup ---
app = FastAPI()
app.include_router(websocket.router)
app.include_router(config_api.router)

# Mount the 'web' directory to serve static files (CSS, JS)
# This makes files in 'web/css' and 'web/js' available under '/static/css' and '/static/js'
app.mount("/static", StaticFiles(directory="web"), name="static")


@app.get("/")
async def read_index(request: Request):
    """Serves the main index.html file."""
    return FileResponse(os.path.join('web', 'index.html'))


# --- Server and Window Management ---
def run_server():
    """Runs the Uvicorn server in a separate thread."""
    uvicorn.run(app, host="127.0.0.1", port=8002, log_level="warning")

if __name__ == '__main__':
    # 3. Run the server in a separate thread
    server_thread = Thread(target=run_server)
    server_thread.daemon = True  # Allows main thread to exit even if server is running
    server_thread.start()

    # 4. Create the pywebview window, loading the FastAPI server
    window = webview.create_window(
        'Aura',
        'http://127.0.0.1:8002',
        width=1000,
        height=750,
        resizable=True
    )

    # 5. Apply capture protection (or skip in DEV_MODE)
    if not DEV_MODE:
        window.events.shown += lambda: window_manager.apply_capture_protection(window)
    else:
        print("INFO: DEV_MODE is True. Skipping screen capture protection.")

    # 6. Start the pywebview event loop with debug based on DEV_MODE
    webview.start(debug=DEV_MODE)