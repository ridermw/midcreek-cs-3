"""Cabinet, cooling manifold and service-loop forms from the declared turnarounds."""

import math


def bezier(a, b, c, d, steps=20):
    return [tuple((1-t)**3*a[k]+3*(1-t)**2*t*b[k]+3*(1-t)*t*t*c[k]+t**3*d[k]
                  for k in range(3)) for t in (index/steps for index in range(steps+1))]


def build(builder, root, cooling):
    s = lambda p, size, color, **kw: builder.shape(root,p,size,color,**kw)
    tube = lambda points, radius, color, closed=False, resolution=1: builder.tube(
        root,points,radius,color,closed,resolution)

    def grille(x, y, z, width, height, back=False):
        points = [(x-width/2,y,z-height/2),(x+width/2,y,z-height/2),
                  (x+width/2,y,z+height/2),(x-width/2,y,z+height/2)]
        uv = [(0,0),(1,0),(1,1),(0,1)]
        indices = [3,2,1,0] if back else [0,1,2,3]
        mesh = builder.bpy.data.meshes.new("Grille")
        mesh.from_pydata(points,[],[indices])
        obj = builder.bpy.data.objects.new("Grille",mesh)
        builder.bpy.context.collection.objects.link(obj)
        builder.paint(obj,root,"steel")
        for loop in mesh.loops:
            mesh.uv_layers.active.data[loop.index].uv = builder.atlas.grille_uv(*uv[loop.vertex_index])

    def socket(x, z, radius=0.038):
        for y, r, depth, color in [(0.335,radius*1.25,0.035,"ink"),
                                    (0.355,radius,0.025,"steel"),
                                    (0.373,radius*0.8,0.015,"yellow"),
                                    (0.385,radius*0.6,0.012,"hose")]:
            s((x,y,z),(r*2,r*2,depth),color,kind="cylinder",rotation=(math.pi/2,0,0))

    s((0,0,0.025),(0.78,0.78,0.05),"ink",bevel=0.005)
    s((0,0,0.085),(0.8,0.8,0.08),"white",bevel=0.006)
    s((0,0,1.965),(0.8,0.8,0.07),"white",bevel=0.007)
    for x in (-0.374,0.374):
        for y in (-0.374,0.374):
            s((x,y,1.04),(0.052,0.052,1.84),"white",bevel=0.004)
    for x in (-0.39,0.39):
        s((x,0,1.025),(0.017,0.70,1.78),"white")
        for y in (-0.335,0.335):
            s((x*1.019,y,1.025),(0.002,0.003,1.73),"steel")
        if cooling:
            for y in (-0.19,0.19):
                s((x*1.019,y,0.78),(0.002,0.11,0.043),"ink",bevel=0.0004)
                s((x*1.022,y,0.79),(0.001,0.08,0.016),"silver")
        else:
            for index in range(13):
                s((x*1.019,-0.18,1.44+index*0.018),(0.002,0.067,0.006),"steel")
            s((x*1.019,0.26,0.77),(0.002,0.03,0.15),"steel",bevel=0.0004)
            s((x*1.022,0.26,0.77),(0.001,0.012,0.10),"ink")
    s((0,-0.35,1.02),(0.68,0.018,1.78),"ink")
    s((0,0.308,1.02),(0.69,0.016,1.78),"rack-shadow")
    for x in (-0.20,0.20):
        for y in (-0.395,0.395):
            s((x,y,0.082),(0.14,0.008,0.039),"steel")
            s((x,y*1.007,0.083),(0.11,0.002,0.023),"ink")

    if cooling:
        for x in (-0.34,0.34):
            for y in (-0.34,0.34):
                arc = [(x+0.035*math.cos(a),y,2.02+0.068*math.sin(a))
                       for a in (i*math.pi/16 for i in range(17))]
                tube([(x+0.035,y,1.989)]+arc+[(x-0.035,y,1.989)],0.012,"steel",resolution=4)
        for x in (-0.365,0.365):
            for y in (-0.37,0.37):
                for z in (0.155,1.92):
                    s((x,y,z),(0.063,0.05,0.10),"yellow",bevel=0.004)
        for z in (0.64,1.30):
            tube([(-0.055+0.205*math.cos(a),-0.366,z+0.205*math.sin(a))
                  for a in (i*math.tau/40 for i in range(41))],0.014,"teal",closed=True)
            s((-0.055,-0.369,z),(0.10,0.10,0.018),"steel",kind="cylinder",rotation=(math.pi/2,0,0))
            for blade in range(6):
                a = blade*math.tau/6
                tube([(-0.055+r*math.cos(a+turn),-0.368,z+r*math.sin(a+turn))
                      for r,turn in [(0.04,0),(0.09,0.15),(0.15,0.32),(0.19,0.43)]],0.025,"teal")
        for index in range(25):
            s((-0.055,-0.378,0.25+index*0.061),(0.535,0.025,0.017),"white",
              rotation=(0.15,0,0),bevel=0.002)
        s((0.293,-0.369,1.16),(0.080,0.032,0.49),"steel",bevel=0.006)
        s((0.293,-0.387,1.16),(0.059,0.004,0.443),"hose")
        for index in range(9):
            color = "red" if index == 0 else "teal" if index < 3 else "green"
            s((0.293,-0.391,0.979+index*0.044),(0.044,0.003,0.029),color)
        pipe_x = (-0.25,-0.085,0.085,0.25)
        header = bezier((-0.25,0.349,1.66),(-0.25,0.349,1.80),
                        (-0.25,0.349,1.80),(-0.13,0.349,1.80))
        header += bezier((0.13,0.349,1.80),(0.25,0.349,1.80),
                         (0.25,0.349,1.80),(0.25,0.349,1.66))
        tube(header,0.031,"teal")
        for x in pipe_x:
            tube([(x,0.349,0.76),(x,0.349,1.70 if abs(x) > 0.2 else 1.80)],0.025,"teal")
            for z in (0.88,1.01,1.44,1.68):
                s((x,0.349,z),(0.065,0.065,0.032),"steel",kind="cylinder")
            s((x,0.384,0.895),(0.029,0.018,0.12),"yellow",bevel=0.005)
            s((x,0.395,0.905),(0.009,0.003,0.059),"ink")
        s((0,0.345,0.685),(0.665,0.082,0.16),"hose",bevel=0.014)
        for index in range(8):
            x = -0.285+index*0.081
            end = -0.31+index*0.070
            socket(x,0.65,0.023)
            tube(bezier((x,0.37,0.63),(x+0.025,0.37,0.35),
                        (end-0.08,0.37,0.18),(end,0.37,0.145)),0.019,"hose")
        tube(bezier((0.27,0.345,0.14),(0.35,0.345,0.14),
                    (0.335,0.345,0.36),(0.335,0.345,0.43)),0.019,"teal")
    else:
        for center in (-0.12,0.09):
            arc = [(center+0.065*math.cos(a),0.16,2.02+0.068*math.sin(a))
                   for a in (i*math.pi/16 for i in range(17))]
            tube([(center+0.065,0.16,1.989)]+arc+[(center-0.065,0.16,1.989)],
                 0.012,"hose",resolution=4)
        for index in range(23):
            z = 0.18+index*0.075
            s((0,-0.373,z),(0.659,0.025,0.068),"steel",bevel=0.002)
            grille(-0.071,-0.387,z,0.458,0.053)
            s((-0.311,-0.389,z),(0.019,0.009,0.049),"teal",bevel=0.002)
            s((0.246,-0.389,z),(0.14,0.009,0.049),"hose")
            for x,color in [(0.196,"green"),(0.235,"teal"),(0.285,"red")]:
                s((x,-0.396,z+0.011),(0.009,0.003,0.010),color)
            s((0.248,-0.396,z-0.012),(0.031,0.003,0.007),"silver")
        for x in (-0.342,0.342):
            s((x,-0.383,1.01),(0.009,0.016,1.75),"yellow")
            for index in range(16):
                s((x,-0.393,0.21+index*0.106),(0.008,0.002,0.007),"ink")
        for x in (-0.16,0.16):
            socket(x,1.83)
            tube(bezier((x,0.38,1.83),(x,0.38,1.76),
                        (x*0.9,0.37,1.66),(x*0.85,0.35,1.62)),0.022,"hose")
        for z in (1.49,1.37):
            s((0,0.325,z),(0.59,0.035,0.087),"steel")
        for z in (0.56,0.77,0.98,1.19):
            s((0,0.338,z),(0.575,0.034,0.166),"steel",bevel=0.006)
            grille(0,0.36,z+0.038,0.51,0.045,back=True)
            for side,color in [(-1,"teal"),(1,"yellow")]:
                start=(side*0.252,0.375,z+0.05)
                end=(-side*0.13,0.375,z-0.055)
                tube(bezier(start,(side*0.29,0.375,z-0.08),
                            (side*0.05,0.375,z-0.08),end),0.010,color)
                s((side*0.24,0.369,z+0.03),(0.025,0.037,0.055),"hose")
        for x in (-0.17,0.17):
            s((x,0.33,0.31),(0.16,0.035,0.19),"steel",bevel=0.01)
            socket(x,0.32,0.045)
            tube(bezier((x,0.375,0.32),(x,0.375,0.13),
                        (x*1.5,0.37,0.13),(x*1.55,0.35,0.17)),0.025,"hose")


def build_coolant(builder, root):
    outline = []
    for index in range(80):
        angle = index*math.tau/80
        radius = 0.32*(1+0.13*math.sin(3*angle)+0.08*math.sin(7*angle)-0.06*math.cos(5*angle))
        outline.append((radius*math.cos(angle),radius*0.82*math.sin(angle)))
    vertices = [(*point,z) for z in (0.001,0.003) for point in outline]
    count = len(outline)
    faces = [tuple(reversed(range(count))),tuple(range(count,count*2))]
    faces += [(index,(index+1)%count,(index+1)%count+count,index+count) for index in range(count)]
    mesh = builder.bpy.data.meshes.new("CoolantSurface")
    mesh.from_pydata(vertices,[],faces)
    obj = builder.bpy.data.objects.new("CoolantSurface",mesh)
    builder.bpy.context.collection.objects.link(obj)
    builder.paint(obj,root,"teal")
    for start,end,scale in [(4,26,0.97),(36,58,0.97),(63,73,0.95)]:
        builder.tube(root,[(x*scale,y*scale,0.004) for x,y in outline[start:end]],0.003,"coolant-light")
    for x,y,radius in [(0.31,-0.22,0.027),(-0.32,0.20,0.022),(0.36,-0.18,0.010)]:
        builder.shape(root,(x,y,0.002),(radius*2,radius*1.3,0.002),"teal",kind="cylinder")
