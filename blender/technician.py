"""Reference-led adult technician geometry on the existing rigid node hierarchy."""

import math


def build(builder, root):
    bpy = builder.bpy
    s = lambda parent, position, size, color, **kw: builder.shape(
        parent, position, size, color, segments=2, **kw)

    def mesh(parent, vertices, faces, color):
        data = bpy.data.meshes.new("Tailored profile")
        data.from_pydata(vertices, [], faces)
        data.update()
        obj = bpy.data.objects.new("Tailored profile", data)
        bpy.context.collection.objects.link(obj)
        return builder.paint(obj, parent, color)

    def loft(parent, rings, color, sides=20, power=2):
        vertices, faces = [], []
        for ring in rings:
            z, rx, ry, cy = ring[:4]
            cx = ring[4] if len(ring) == 5 else 0
            for i in range(sides):
                angle = math.tau * i / sides
                x, y = math.cos(angle), math.sin(angle)
                vertices.append((cx + rx * math.copysign(abs(x)**(2/power), x),
                                 cy + ry * math.copysign(abs(y)**(2/power), y), z))
        for row in range(len(rings)-1):
            for i in range(sides):
                a, b = row*sides+i, row*sides+(i+1) % sides
                faces.append((a, b, b+sides, a+sides))
        faces.extend([tuple(reversed(range(sides))),
                      tuple(range((len(rings)-1)*sides, len(rings)*sides))])
        obj = mesh(parent, vertices, faces, color)
        for polygon in list(obj.data.polygons)[:-2]:
            polygon.use_smooth = True
        return obj

    def surface(rings, z, x, extra=0, back=False, power=2):
        for lower, upper in zip(rings, rings[1:]):
            if lower[0] <= z <= upper[0]:
                t = (z-lower[0])/(upper[0]-lower[0])
                rx, ry, cy = [lower[i]*(1-t)+upper[i]*t for i in (1, 2, 3)]
                extent = ry * max(0, 1-(abs(x)/rx)**power)**(1/power) + extra
                return cy + (extent if back else -extent)
        raise ValueError(f"PROFILE_HEIGHT: {z}")

    def line(parent, points, color="ink", radius=0.0018):
        return builder.tube(parent, points, radius, color)

    hips = builder.node("Hips", root, (0, 0, 0.90))
    torso = builder.node("Torso", hips)
    body = [(-0.015,0.151,0.102,0), (0.055,0.165,0.116,0),
            (0.18,0.171,0.123,0.006), (0.31,0.202,0.125,0.008),
            (0.395,0.213,0.110,0.007), (0.45,0.168,0.089,0.006),
            (0.475,0.074,0.062,0)]
    loft(torso, body, "shirt", power=2.4)

    vest = [(0.022,0.168,0.121,0), (0.085,0.175,0.131,0),
            (0.20,0.181,0.138,0.006), (0.325,0.206,0.133,0.008),
            (0.39,0.193,0.113,0.007)]
    loft(torso, vest, "lime", power=2.4)
    neckline = []
    for z, width in ((0.266,0.001),(0.325,0.055),(0.389,0.095)):
        for x in (-width, width):
            neckline.append((x,surface(vest,z,x,0.005,power=2.4),z))
    mesh(torso, neckline, [(0,1,3,2),(2,3,5,4)], "shirt")
    for z in (0.025, 0.388):
        rx, ry, cy = (vest[0][1:] if z < 0.1 else vest[-1][1:])
        line(torso, [(rx*math.cos(a), cy+ry*math.sin(a), z)
                     for a in [math.tau*i/32 for i in range(33)]], "orange", 0.004)
    band = [(z, 0.179+(z-0.11)*0.055, 0.137+(z-0.11)*0.028, 0.003)
            for z in (0.11, 0.157)]
    loft(torso, band, "silver", power=2.4)
    for back in (False, True):
        for sign in (-1, 1):
            vertices, faces = [], []
            for z in (0.158, 0.24, 0.325, 0.385):
                for x in (sign*0.078, sign*0.126):
                    vertices.append((x, surface(vest, z, x, 0.003, back, 2.4), z))
            for i in range(0, 6, 2):
                face = (i, i+1, i+3, i+2)
                faces.append(tuple(reversed(face)) if (back == (sign > 0)) else face)
            mesh(torso, vertices, faces, "silver")
    for sign in (-1, 1):
        for width, extra, color in ((0.069,0.003,"orange"),(0.061,0.004,"lime"),
                                    (0.047,0.005,"silver")):
            vertices = []
            for row in range(5):
                for x in (sign*0.103-width/2, sign*0.103+width/2):
                    if row == 2:
                        z = 0.45+(0.168-abs(x))/0.094*0.025+extra
                        y = 0.006
                    else:
                        z = 0.39 if row in (0,4) else 0.44
                        y = surface(body,z,x,extra,back=row > 2,power=2.4)
                    vertices.append((x,y,z))
            mesh(torso, vertices, [(i,i+1,i+3,i+2) for i in range(0,8,2)], color)
    line(torso, [(0, surface(vest,z,0,0.004), z) for z in (0.025,0.10,0.20,0.325,0.388)],
         "orange", 0.004)
    for sign in (-1, 1):
        points = [(sign*x, surface(vest,z,sign*x,0.004), z)
                  for x,z in ((0,0.265),(0.055,0.325),(0.095,0.387))]
        line(torso, points, "orange", 0.004)
    line(torso, [(-0.083,-0.128,0.39),(-0.073,-0.150,0.30),
                 (-0.028,-0.151,0.235),(0.025,-0.151,0.24),
                 (0.079,-0.142,0.365)], "orange", 0.003)

    loft(hips, [(-0.022,0.169,0.120,0),(0.019,0.169,0.120,0)], "ink", power=2.6)
    s(hips, (0,-0.127,0), (0.045,0.015,0.032), "steel", bevel=0.004)
    s(hips, (0,-0.137,0), (0.025,0.006,0.015), "ink")
    for sign in (-1, 1):
        pouch = sign*0.19
        s(hips, (pouch,0.012,-0.055), (0.065,0.117,0.15), "hose", bevel=0.009)
        for y in (-0.033,0.006,0.045):
            s(hips, (pouch,y,-0.025), (0.075,0.024,0.09), "ink", bevel=0.006)
        s(hips, (pouch,-0.03,0.029), (0.013,0.016,0.065), "orange", bevel=0.004)
        s(hips, (pouch,0.005,0.033), (0.012,0.013,0.05), "yellow", bevel=0.004)

    head = builder.node("Head", torso, (0, 0, 0.60))
    s(head, (0,0.008,-0.098), (0.094,0.094,0.135), "skin", kind="cylinder", bevel=0.009)
    skull = [(-0.068,0.044,0.041,-0.018), (-0.05,0.066,0.060,-0.011),
             (-0.005,0.084,0.077,0), (0.045,0.093,0.080,0.003),
             (0.087,0.096,0.078,0.008), (0.132,0.094,0.071,0.008),
             (0.163,0.075,0.051,0.006)]
    loft(head, skull, "skin", power=2.5)
    s(head, (0,0.056,0.077), (0.178,0.075,0.145), "hair", bevel=0.028)
    for sign in (-1, 1):
        s(head, (sign*0.092,0.012,0.025), (0.026,0.043,0.064), "skin", kind="sphere")
        x = sign*0.040
        y = surface(skull,0.063,x,0.002,power=2.5)
        s(head, (x,y,0.063), (0.025,0.007,0.007), "ink", bevel=0.002)
        s(head, (x,y-0.002,0.061), (0.014,0.005,0.003), "white")
        s(head, (x,y-0.005,0.061), (0.005,0.003,0.005), "ink")
        line(head, [(sign*0.025,y,0.079),(sign*0.043,y+0.001,0.082),
                    (sign*0.057,y+0.004,0.078)], radius=0.0023)
    mesh(head, [(-0.016,-0.080,0.068),(0.016,-0.080,0.068),
                (-0.018,-0.081,0.012),(0.018,-0.081,0.012),
                (-0.010,-0.112,0.022),(0.010,-0.112,0.022)],
         [(0,1,5,4),(0,2,4),(1,5,3),(2,3,5,4)], "skin")
    line(head, [(-0.023,-0.076,-0.013),(0,-0.083,-0.017),(0.022,-0.076,-0.013)],
         "boots", 0.0012)

    hat = [(0.129,0.121,0.112,0), (0.146,0.132,0.116,0),
           (0.182,0.118,0.106,0), (0.21,0.077,0.075,0),
           (0.23,0.017,0.019,0)]
    loft(head, hat, "hat", sides=24)
    brim = []
    for i in range(32):
        a = math.tau*i/32
        brim.append((0.135*math.cos(a), 0.12*math.sin(a)-0.026*max(0,-math.sin(a)),
                     0.132-0.011*max(0,-math.sin(a))))
    mesh(head, [*brim, *[(x,y,z-0.002) for x,y,z in brim]],
         [tuple(range(32)), tuple(reversed(range(32,64))),
          *[(i,32+i,32+(i+1)%32,(i+1)%32) for i in range(32)]], "hat")
    line(head, [*brim,brim[0]], radius=0.002)
    line(head, [(0,-0.11,0.166),(0,-0.073,0.210),(0,0,0.229),
                (0,0.07,0.212),(0,0.105,0.175)], "hat", 0.001)
    for sign in (-1, 1):
        s(head, (sign*0.116,0.028,0.112), (0.037,0.079,0.081), "ink", kind="sphere")
        s(head, (sign*0.131,0.029,0.114), (0.021,0.058,0.061), "hose", kind="sphere")
        s(head, (sign*0.115,-0.021,0.099), (0.015,0.023,0.032), "steel", bevel=0.004)
        s(head, (sign*0.095,-0.007,0.020), (0.011,0.010,0.018), "orange", kind="sphere")

    for suffix, sign in (("L",-1),("R",1)):
        arm = builder.node(f"UpperArm{suffix}", torso, (sign*0.21,0.008,0.41))
        loft(arm, [(-0.267,0.047,0.052,0),(-0.215,0.050,0.056,0),
                   (-0.115,0.060,0.065,0),(-0.040,0.066,0.070,0),
                   (0.020,0.047,0.055,0,-sign*0.020),
                   (0.045,0.015,0.020,0,-sign*0.035)], "shirt", power=2.4)
        forearm = builder.node(f"Forearm{suffix}", arm, (0,0,-0.26))
        loft(forearm, [(-0.229,0.041,0.043,-0.004),(-0.18,0.044,0.047,-0.003),
                      (-0.075,0.057,0.057,0),(0.014,0.048,0.052,0)], "shirt", power=2.4)
        loft(forearm, [(-0.238,0.043,0.045,-0.004),(-0.215,0.043,0.045,-0.004)],
             "shirt", power=2.8)
        s(forearm, (0,-0.008,-0.288), (0.068,0.080,0.113), "skin", bevel=0.014)
        s(forearm, (-sign*0.029,-0.030,-0.268), (0.027,0.032,0.061),
          "skin", kind="sphere")
        for x in (-0.016,0.002,0.020):
            line(forearm, [(x,-0.049,-0.285),(x,-0.048,-0.32)], "boots", 0.0009)
        for z in (-0.09,-0.16):
            line(forearm, [(-0.037,-0.035,z),(0,-0.053,z+0.008),(0.032,-0.034,z-0.004)])

        thigh = builder.node(f"Thigh{suffix}", hips, (sign*0.086,0,0))
        loft(thigh, [(-0.408,0.066,0.071,-0.004),(-0.34,0.072,0.080,0),
                    (-0.19,0.081,0.090,0.008),(-0.045,0.085,0.102,0.01),
                    (0.018,0.078,0.095,0.005)], "denim", power=2.5)
        shin = builder.node(f"Shin{suffix}", thigh, (0,0,-0.40))
        loft(shin, [(-0.367,0.065,0.079,-0.003),(-0.30,0.064,0.070,0),
                   (-0.17,0.064,0.071,0),(-0.065,0.066,0.076,0),
                   (0.015,0.066,0.072,-0.003)], "denim", power=2.6)
        for node, z in ((thigh,-0.33),(shin,-0.09),(shin,-0.30)):
            line(node, [(-0.050,-0.054,z),(0,-0.081,z+0.012),(0.045,-0.052,z-0.007)],
                 radius=0.0014)
        line(shin, [(sign*0.060,0,-0.02),(sign*0.063,0,-0.18),(sign*0.065,0,-0.35)],
             radius=0.0013)
        foot = builder.node(f"Foot{suffix}", shin, (0,0,-0.425))
        s(foot, (0,-0.044,-0.0615), (0.145,0.251,0.027), "ink", bevel=0.008)
        s(foot, (0,-0.051,-0.029), (0.136,0.24,0.064), "boots", bevel=0.020)
        s(foot, (0,0.012,0.018), (0.115,0.134,0.112), "boots", bevel=0.014)
        for y,z in ((-0.061,0.005),(-0.035,0.030),(-0.012,0.052)):
            line(foot, [(-0.036,y,z),(0.036,y,z)], "ink", 0.002)
    return sorted((node for node in root.children_recursive if node.type == "EMPTY"), key=lambda n: n.name)
