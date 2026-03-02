import os
from PIL import Image

def process_frame(src_path, dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    img = Image.open(src_path).convert("RGBA")
    if img.size != (320, 180):
        img = img.resize((320, 180), Image.Resampling.NEAREST)
        
    data = img.getdata()
    new_data = []
    
    # We want to make the center completely transparent
    tolerance = 25
    
    # For a frame, we usually want to make pure black transparent
    for item in data:
        r, g, b, a = item
        if r <= tolerance and g <= tolerance and b <= tolerance:
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item)

    img.putdata(new_data)
    img.save(dest_path, "PNG", optimize=True)
    
    size_kb = os.path.getsize(dest_path) / 1024
    print(f"Processed Dark Frame: {dest_path} ({img.size}) | size: {size_kb:.2f} KB")

src_frame = r"C:\Users\adam\.gemini\antigravity\brain\0c64fa2e-5955-49c3-893b-19e0d92df050\rich_frame_basic_dark_1772449724228.png"
dest_frame = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default\card_frames\frame_basic.png"

process_frame(src_frame, dest_frame)
