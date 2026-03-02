import os
from PIL import Image

def process_image(src_path, dest_path, target_size, is_transparent):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    
    img = Image.open(src_path).convert("RGBA")
    
    if img.size != target_size:
        img = img.resize(target_size, Image.Resampling.NEAREST)
        
    data = img.getdata()
    new_data = []
    
    tolerance = 30
    for item in data:
        r, g, b, a = item
        brightness = (r + g + b) // 3
        if is_transparent and r <= tolerance and g <= tolerance and b <= tolerance:
            new_data.append((0, 0, 0, 0)) # Go completely transparent for black backgrounds
        else:
            if not is_transparent:
                # For the background tile, make sure black is really deep ANSI blue
                if brightness < 20:
                    new_data.append((0, 0, 170, 255)) # Deep ANSI Blue (#0000AA)
                elif brightness < 60:
                    new_data.append((10, 10, 80, 255)) # Darker blue grid
                else:
                    # Keep original color
                    new_data.append(item)
            else:
                new_data.append(item)

    img.putdata(new_data)
    
    # Save optimized png
    img.save(dest_path, "PNG", optimize=True)
    size_kb = os.path.getsize(dest_path) / 1024
    print(f"Processed: {dest_path} ({img.size}) | size: {size_kb:.2f} KB")


# Paths
base_dir = r"C:\Users\adam\.gemini\antigravity\brain\0c64fa2e-5955-49c3-893b-19e0d92df050"
target_dir = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default"

files = [
    {
        "src": os.path.join(base_dir, "rich_frame_basic_raw_1772388326176.png"),
        "dest": os.path.join(target_dir, "card_frames", "frame_basic.png"),
        "size": (320, 180),
        "trans": True
    },
    {
        "src": os.path.join(base_dir, "rich_bg_agentdex_tile_raw_1772388340060.png"),
        "dest": os.path.join(target_dir, "backgrounds", "bg_agentdex_tile.png"),
        "size": (128, 128),
        "trans": False
    },
    {
        "src": os.path.join(base_dir, "rich_badge_trial_pass_raw_1772388351900.png"),
        "dest": os.path.join(target_dir, "badges", "badge_trial_pass.png"),
        "size": (32, 32),
        "trans": True
    },
    {
        "src": os.path.join(base_dir, "rich_icon_genepack_node_raw_1772388367094.png"),
        "dest": os.path.join(target_dir, "badges", "icon_genepack_node.png"),
        "size": (32, 32),
        "trans": True
    }
]

for f in files:
    process_image(f["src"], f["dest"], f["size"], f["trans"])
