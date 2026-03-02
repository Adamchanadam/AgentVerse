import os
import sys
from PIL import Image

def process_frame(src_path, dest_path):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    # 讀取圖片並轉為 RGBA
    img = Image.open(src_path).convert("RGBA")
    
    # AI 生成的圖片有可能不是完美的 320x180，強制 resize，使用 NEAREST 保持像素感
    if img.size != (320, 180):
        img = img.resize((320, 180), Image.Resampling.NEAREST)
        
    data = img.getdata()
    new_data = []
    
    # 黑屏去背邏輯：只要 RGB 數值都很低 (接近純黑)，就將 Alpha 設為 0
    # 容忍度設為 30，因為 AI 生成的黑色有時候不是絕對的 0
    tolerance = 30
    for item in data:
        r, g, b, a = item
        if r <= tolerance and g <= tolerance and b <= tolerance:
            new_data.append((0, 0, 0, 0)) # 透明
        else:
            # 強制將非黑色的像素轉為標準的螢光綠，並保留 Alpha
            # 若它本來是暗色系的邊緣(例如陰影)，也可以強制轉換為 #00FF41 或保留亮度
            # 這裡為了符合 100% tokens 規範，我們將亮度轉換為透明度，確保主要是綠色
            # 或者最穩定的作法：原本就是亮的像素，我們盡量替換為 Terminal Green
            if g > 50: # 如果是亮綠色塊
                new_data.append((0, 255, 65, a)) # #00FF41
            else:
                new_data.append(item)

    img.putdata(new_data)
    
    # 將圖片轉換為 P 模式並使用自定義調色盤 (Quantization) 強制只使用給點色彩
    # 在這個階段我們先以 RGBA 儲存，因為透明度邊緣由 NEAREST 縮放可能不需 dither
    img.save(dest_path, "PNG", optimize=True)
    
    size_kb = os.path.getsize(dest_path) / 1024
    print(f"File saved: {dest_path}")
    print(f"Size: {img.size}, Mode: {img.mode}, File size: {size_kb:.2f} KB")

# src 絕對路徑替換成剛才由 Nano Banana 儲存的路徑
src_file = r"C:\Users\adam\.gemini\antigravity\brain\0c64fa2e-5955-49c3-893b-19e0d92df050\frame_basic_raw_1772385230960.png"
dest_file = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default\card_frames\frame_basic.png"

process_frame(src_file, dest_file)
