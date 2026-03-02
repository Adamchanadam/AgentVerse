import os
from PIL import Image

def process_image(src_path, dest_path, target_size, is_transparent):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    img = Image.open(src_path).convert("RGBA")
    
    if img.size != target_size:
        img = img.resize(target_size, Image.Resampling.NEAREST)
        
    data = img.getdata()
    new_data = []
    
    tolerance = 25
    for item in data:
        r, g, b, a = item
        if is_transparent and r <= tolerance and g <= tolerance and b <= tolerance:
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(dest_path, "PNG", optimize=True)
    
    size_kb = os.path.getsize(dest_path) / 1024
    print(f"Processed: {dest_path} ({img.size}) | size: {size_kb:.2f} KB")

base_dir = r"C:\Users\adam\.gemini\antigravity\brain\0c64fa2e-5955-49c3-893b-19e0d92df050"
target_dir = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default"

files = [
    {
        "src": os.path.join(base_dir, "rich_avatar_03_raw_1772437272329.png"),
        "dest": os.path.join(target_dir, "avatars", "avatar_default_03.png"),
        "size": (64, 64),
        "trans": True
    }
]

for f in files:
    process_image(f["src"], f["dest"], f["size"], f["trans"])
