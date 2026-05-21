import os
# pyrefly: ignore [missing-import]
import webview
from database import DatabaseAPI

if __name__ == "__main__":
    api = DatabaseAPI()
    
    # 1. This finds the exact folder where main.py lives (laundry_app/)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 2. This connects laundry_app/ + gui/ + index.html safely
    html_file_path = os.path.join(current_dir, 'gui', 'index.html')
    
    print(f"Attempting to load UI from: {html_file_path}") 
    
    window = webview.create_window(
        "Laundry App", 
        url=html_file_path,  # Make sure this variable is used here!
        js_api=api,
        width=1440,
        height=1024
    )
    webview.start()