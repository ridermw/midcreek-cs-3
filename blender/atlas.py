"""Owned flat-color clothing and face marks; no reference pixels or baked lighting."""

import math
import struct
import zlib

SIZE = 512
CHARTS = {
    "torso": (32,48,192,384,-0.015,0.475),
    "head": (288,48,192,384,-0.068,0.163),
}


def chart_uv(name, u, z):
    x,y,width,height,low,high = CHARTS[name]
    if not 0 <= u <= 1 or not low <= z <= high:
        raise ValueError("CHART_COORDINATE")
    return ((x+0.5+u*(width-1))/SIZE,
            1-(y+0.5+(high-z)/(high-low)*(height-1))/SIZE)


def torso_color(x, z, theta):
    front = math.sin(theta) < 0
    top = 0.265+0.18*min(abs(x)/0.10,1) if front else 0.425
    if abs(math.cos(theta)) > 0.85:
        top = min(top,0.33)
    strap = 0.068 < abs(x) < 0.138 and z > 0.30
    vest = z >= 0.022 and (z <= top or strap)
    if not vest:
        return "shirt"
    if abs(z-0.022) < 0.002 or (not strap and abs(z-top) < 0.0015):
        return "ink"
    if z < 0.030 or (not strap and z > top-0.007) or (front and abs(x) < 0.005 and z < 0.275):
        return "orange"
    band = 0.11 < z < 0.157
    vertical = abs(abs(x)-0.103) < 0.024 and z > 0.11
    if band or vertical:
        if min(abs(z-0.11),abs(z-0.157)) < 0.001 or (
                not band and abs(abs(abs(x)-0.103)-0.024) < 0.001):
            return "ink"
        return "silver"
    if front and abs(x) < 0.086 and abs(z-(0.235+20*x*x)) < 0.0018:
        return "orange"
    return "lime"


def head_color(x, z, theta):
    if (math.sin(theta) > 0.1 and z > 0.005) or (abs(x) > 0.083 and 0.005 < z < 0.09):
        return "hair"
    if math.sin(theta) < -0.3:
        eye_x = (abs(x)-0.040)/0.013
        if eye_x*eye_x+((z-0.061)/0.004)**2 < 1:
            return "ink" if abs(abs(x)-0.040) < 0.003 else "white"
        if abs(abs(x)-0.041) < 0.018 and abs(z-(0.080+0.003*(1-eye_x*eye_x))) < 0.0015:
            return "ink"
        if abs(x) < 0.024 and abs(z-(-0.020+0.005*(x/0.024)**2)) < 0.001:
            return "boots"
    return "skin"


def pixels(spec, profiles):
    palette = {name: tuple(bytes.fromhex(color[1:])) for name,color in spec["palette"].items()}
    data = bytearray((*palette["white"],255) * (SIZE*SIZE))
    for index, color in enumerate(palette.values()):
        pixel = bytes((*color,255))
        for y in range(8):
            start = (y*SIZE+index*8)*4
            data[start:start+32] = pixel*8
    for name, (left,top,width,height,low,high) in CHARTS.items():
        rings = profiles.TORSO if name == "torso" else profiles.HEAD
        power = 2.4 if name == "torso" else 2.5
        choose = torso_color if name == "torso" else head_color
        for y in range(height):
            for x in range(width):
                channels = [0,0,0]
                for dx,dy in ((0.25,0.25),(0.75,0.25),(0.25,0.75),(0.75,0.75)):
                    u = min(1,max(0,(x+dx-0.5)/(width-1)))
                    z = min(high,max(low,high-min(1,max(0,(y+dy-0.5)/(height-1)))*(high-low)))
                    radius,_,_ = profiles.sample(rings,z)
                    theta = u*math.tau
                    cosine = math.cos(theta)
                    world_x = radius*math.copysign(abs(cosine)**(2/power),cosine)
                    color = palette[choose(world_x,z,theta)]
                    for channel in range(3):
                        channels[channel] += color[channel]
                offset = ((top+y)*SIZE+left+x)*4
                data[offset:offset+4] = bytes([round(value/4) for value in channels]+[255])
        for y in range(top-32,top+height+32):
            for x in range(left-32,left+width+32):
                if left <= x < left+width and top <= y < top+height:
                    continue
                source_x = min(left+width-1,max(left,x))
                source_y = min(top+height-1,max(top,y))
                source = (source_y*SIZE+source_x)*4
                target = (y*SIZE+x)*4
                data[target:target+4] = data[source:source+4]
    return bytes(data)


def png(data):
    if len(data) != SIZE*SIZE*4:
        raise ValueError("ATLAS_PIXEL_COUNT")
    def chunk(kind, payload):
        return struct.pack(">I",len(payload))+kind+payload+struct.pack(">I",zlib.crc32(kind+payload))
    rows = b"".join(b"\0"+data[y*SIZE*4:(y+1)*SIZE*4] for y in range(SIZE))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR",struct.pack(">IIBBBBB",SIZE,SIZE,8,6,0,0,0))
            + chunk(b"sRGB",b"\0") + chunk(b"IDAT",zlib.compress(rows,9)) + chunk(b"IEND",b""))
