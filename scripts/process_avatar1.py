import os
from PIL import Image

def process_avatar(src_path, dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    img = Image.open(src_path).convert("RGBA")
    
    if img.size != (64, 64):
        img = img.resize((64, 64), Image.Resampling.NEAREST)
        
    data = img.getdata()
    new_data = []
    
    tolerance = 25
    for item in data:
        r, g, b, a = item
        # Remove black background
        if r <= tolerance and g <= tolerance and b <= tolerance:
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(dest_path, "PNG", optimize=True)
    
    size_kb = os.path.getsize(dest_path) / 1024
    print(f"Processed: {dest_path} | Size: {img.size} | Mode: {img.mode} | File: {size_kb:.2f} KB")

src_avatar = r"C:\Users\adam\.gemini\antigravity\brain\0c64fa2e-5955-49c3-893b-19e0d92df050\rich_avatar_01_raw_1772435666482.png"
dest_avatar = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default\avatars\avatar_default_01.png"

process_avatar(src_avatar, dest_avatar)
