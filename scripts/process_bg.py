import os
import sys
from PIL import Image

def process_bg_tile(src_path, dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    img = Image.open(src_path).convert("RGBA")
    
    # 強制 resize 為 128x128，保持像素感
    if img.size != (128, 128):
        img = img.resize((128, 128), Image.Resampling.NEAREST)
        
    data = img.getdata()
    new_data = []
    
    # 這個背景磚不需要透明，我們只需要確保它的顏色接近暗綠色和黑色
    for item in data:
        r, g, b, a = item
        # 強制壓抑紅色與藍色，使其偏向純粹的綠色/黑色光譜
        # 將 g 降低以符合 "extremely dark green #0A110A" 的感覺
        # 這裡做一個簡單的色彩映射，確保符合 retro palette
        # 取顏色的亮度，映射到黑、暗綠色
        brightness = (r + g + b) // 3
        if brightness < 20:
            new_data.append((5, 5, 5, 255)) # 近乎黑
        elif brightness < 60:
            new_data.append((10, 17, 10, 255)) # #0A110A
        else:
            new_data.append((0, int(min(g, 100)), 0, 255)) # 暗綠色線條

    img.putdata(new_data)
    
    # Quantize to 12 colors (from mvp-default.yaml palette_max_colors_override: 12)
    # Backgrounds are not transparent, so we don't need RGBA for saving, but P mode works well
    q_img = img.quantize(colors=12, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    
    q_img.save(dest_path, "PNG", optimize=True)
    
    size_kb = os.path.getsize(dest_path) / 1024
    print(f"File saved: {dest_path}")
    print(f"Size: {q_img.size}, Mode: {q_img.mode}, File size: {size_kb:.2f} KB")

# src 絕對路徑替換成剛才由 Nano Banana 儲存的路徑
src_file = r"C:\Users\adam\.gemini\antigravity\brain\0c64fa2e-5955-49c3-893b-19e0d92df050\bg_agentdex_tile_raw_1772385287962.png"
dest_file = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default\backgrounds\bg_agentdex_tile.png"

process_bg_tile(src_file, dest_file)
