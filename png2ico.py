import struct
import sys
import os

png_path = sys.argv[1]
ico_path = sys.argv[2]

with open(png_path, 'rb') as f:
    png_data = f.read()

png_size = len(png_data)

# ICO header (6 bytes)
# 0-1: Reserved (0)
# 2-3: Image type (1 = ICO)
# 4-5: Number of images (1)
header = struct.pack('<HHH', 0, 1, 1)

# ICO directory entry (16 bytes)
# 0: Width (0 means 256, but we'll use 0 for whatever size)
# 1: Height (0 means 256)
# 2: Color count (0)
# 3: Reserved (0)
# 4-5: Color planes (1)
# 6-7: Bits per pixel (32)
# 8-11: Size of image data
# 12-15: Offset of image data from beginning of file (6 + 16 = 22)
directory = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, png_size, 22)

with open(ico_path, 'wb') as f:
    f.write(header)
    f.write(directory)
    f.write(png_data)

print(f"Successfully converted to {ico_path}")
