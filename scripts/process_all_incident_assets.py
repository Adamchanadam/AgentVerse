import os
import sys
from PIL import Image

BRAIN_DIR = r"C:\Users\adam\.gemini\antigravity\brain\bd8f81b2-8663-40f8-b1b6-f3b47c197060"
HUB_ASSETS = r"d:\_Adam_Projects\OpenClaw\packages\hub\public\assets\mvp-default"

files_to_process = [
    {
        "src": os.path.join(BRAIN_DIR, "avatar_default_01_1772478290610.png"),
        "dest": os.path.join(HUB_ASSETS, "avatars", "avatar_default_01.png"),
        "size": (64, 64),
        "trans": True
    },
    {
        "src": os.path.join(BRAIN_DIR, "avatar_default_02_1772478303994.png"),
        "dest": os.path.join(HUB_ASSETS, "avatars", "avatar_default_02.png"),
        "size": (64, 64),
        "trans": True
    },
    {
        "src": os.path.join(BRAIN_DIR, "avatar_default_03_1772478320170.png"),
        "dest": os.path.join(HUB_ASSETS, "avatars", "avatar_default_03.png"),
        "size": (64, 64),
        "trans": True
    },
    {
        "src": os.path.join(BRAIN_DIR, "badge_first_pair_1772478346385.png"),
        "dest": os.path.join(HUB_ASSETS, "badges", "badge_first_pair.png"),
        "size": (32, 32),
        "trans": True
    },
    {
        "src": os.path.join(BRAIN_DIR, "badge_sg_1772478359370.png"),
        "dest": os.path.join(HUB_ASSETS, "badges", "badge_security_guard.png"),
        "size": (32, 32),
        "trans": True
    },
    {
        "src": os.path.join(BRAIN_DIR, "badge_messenger_1772478376359.png"),
        "dest": os.path.join(HUB_ASSETS, "badges", "badge_messenger.png"),
        "size": (32, 32),
        "trans": True
    },
    {
        "src": os.path.join(BRAIN_DIR, "badge_trial_pass_1772478210414.png"),
        "dest": os.path.join(HUB_ASSETS, "badges", "badge_trial_pass.png"),
        "size": (32, 32),
        "trans": True
    },
    {
        "src": os.path.join(BRAIN_DIR, "icon_gp_node_1772478223243.png"),
        "dest": os.path.join(HUB_ASSETS, "badges", "icon_genepack_node.png"),
        "size": (32, 32),
        "trans": True
    }
]

def process_sprite(src, dest, size, trans):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    img = Image.open(src).convert("RGBA")
    if img.size != size:
        img = img.resize(size, Image.Resampling.NEAREST)
    
    data = img.getdata()
    new_data = []
    # Find background color dynamically by picking top-left pixel
    bg_color = data[0] 
    bg_r, bg_g, bg_b, _ = bg_color
    tolerance = 45 # The old scripts used 25, but AI might have gradient. I'll use 45 for deep blue.
    for item in data:
        r, g, b, a = item
        if trans and abs(r-bg_r) <= tolerance and abs(g-bg_g) <= tolerance and abs(b-bg_b) <= tolerance:
            new_data.append((0, 0, 0, 0))
        else:
            new_data.append(item)
            
    img.putdata(new_data)
    img.save(dest, "PNG", optimize=True)
    print(f"Processed: {dest}")

for f in files_to_process:
    process_sprite(f["src"], f["dest"], f["size"], f["trans"])

# Process Frame
src_frame = os.path.join(BRAIN_DIR, "frame_basic_1772478239932.png")
dest_frame = os.path.join(HUB_ASSETS, "card_frames", "frame_basic.png")
os.makedirs(os.path.dirname(dest_frame), exist_ok=True)
frame_img = Image.open(src_frame).convert("RGBA")
if frame_img.size != (320, 180):
    frame_img = frame_img.resize((320, 180), Image.Resampling.NEAREST)
f_data = frame_img.getdata()
new_f_data = []
# Make black center transparent
for item in f_data:
    r, g, b, a = item
    if r <= 35 and g <= 35 and b <= 35:
        new_f_data.append((0, 0, 0, 0))
    else:
        new_f_data.append(item)
frame_img.putdata(new_f_data)
frame_img.save(dest_frame, "PNG", optimize=True)
print(f"Processed: {dest_frame}")

# Process Background Tile
src_bg = os.path.join(BRAIN_DIR, "bg_agentdex_tile_1772478253760.png")
dest_bg = os.path.join(HUB_ASSETS, "backgrounds", "bg_agentdex_tile.png")
os.makedirs(os.path.dirname(dest_bg), exist_ok=True)
bg_img = Image.open(src_bg).convert("RGBA")
if bg_img.size != (128, 128):
    bg_img = bg_img.resize((128, 128), Image.Resampling.NEAREST)

data = bg_img.getdata()
new_data = []
for item in data:
    r, g, b, a = item
    brightness = (r + g + b) // 3
    if brightness < 20:
        new_data.append((5, 5, 5, 255))
    elif brightness < 60:
        new_data.append((10, 17, 10, 255))
    else:
        new_data.append((0, int(min(g, 100)), 0, 255))
        
bg_img.putdata(new_data)
q_img = bg_img.quantize(colors=12, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
q_img.save(dest_bg, "PNG", optimize=True)
print(f"Processed: {dest_bg}")
