import os
from PIL import Image

def process_icon(src_path, dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    img = Image.open(src_path).convert("RGBA")
    
    if img.size != (32, 32):
        img = img.resize((32, 32), Image.Resampling.NEAREST)
        
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

src_pass = r"C:\Users\adam\.gemini\antigravity\brain\0c64fa2e-5955-49c3-893b-19e0d92df050\badge_trial_pass_raw_1772387670510.png"
dest_pass = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default\badges\badge_trial_pass.png"

src_node = r"C:\Users\adam\.gemini\antigravity\brain\0c64fa2e-5955-49c3-893b-19e0d92df050\icon_genepack_raw_1772387685742.png"
dest_node = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default\badges\icon_genepack_node.png"

process_icon(src_pass, dest_pass)
process_icon(src_node, dest_node)
