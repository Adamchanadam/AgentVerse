import os
from PIL import Image

BRAIN_DIR = r"C:\Users\adam\.gemini\antigravity\brain\bd8f81b2-8663-40f8-b1b6-f3b47c197060"
HUB_ASSETS = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default"

files_to_process = [
    {
        "src": os.path.join(BRAIN_DIR, "avatar_v2_01_1772478611873.png"),
        "dest": os.path.join(HUB_ASSETS, "avatars", "avatar_default_01.png"),
        "size": (64, 64)
    },
    {
        "src": os.path.join(BRAIN_DIR, "avatar_v2_02_1772478626044.png"),
        "dest": os.path.join(HUB_ASSETS, "avatars", "avatar_default_02.png"),
        "size": (64, 64)
    },
    {
        "src": os.path.join(BRAIN_DIR, "avatar_v2_03_1772478639505.png"),
        "dest": os.path.join(HUB_ASSETS, "avatars", "avatar_default_03.png"),
        "size": (64, 64)
    }
]

def process_avatar(src, dest, size):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    img = Image.open(src).convert("RGBA")
    if img.size != size:
        img = img.resize(size, Image.Resampling.NEAREST)
    
    data = img.getdata()
    new_data = []
    
    # We used "Solid pitch black background" in the prompt
    tolerance = 30
    for item in data:
        r, g, b, a = item
        if r <= tolerance and g <= tolerance and b <= tolerance:
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(dest, "PNG", optimize=True)
    size_kb = os.path.getsize(dest) / 1024
    print(f"Processed: {dest} | Size: {size_kb:.2f} KB")

for f in files_to_process:
    process_avatar(f["src"], f["dest"], f["size"])
