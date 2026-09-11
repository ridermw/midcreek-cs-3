"""Reference-led adult technician geometry on the existing rigid node hierarchy."""

import math


def repair_pose(phase):
    return {
        "Torso": (0.06, 0, 0),
        "Head": (0.38, 0, -0.035),
        "UpperArmL": (-0.25, 0, 0.35),
        "ForearmL": (-1.75, 0, 0),
        "UpperArmR": (-0.30, 0, -0.35),
        "ForearmR": (-1.98+0.055*(1-math.cos(2*phase)), 0, 0),
    }


def build(builder, root):
    from mathutils import Euler, Vector
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

    def loft(parent, rings, color, sides=20, power=2, chart=None):
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
            if chart is not None:
                indices = [obj.data.loops[index].vertex_index for index in polygon.loop_indices]
                seam = any(index % sides == 0 for index in indices) and any(
                    index % sides == sides-1 for index in indices)
                for loop_index, vertex in zip(polygon.loop_indices, indices):
                    u = (vertex % sides)/sides
                    if seam and u == 0:
                        u = 1
                    obj.data.uv_layers.active.data[loop_index].uv = builder.atlas.chart_uv(
                        chart, u, rings[vertex//sides][0])
        return obj

    def line(parent, points, color="ink", radius=0.0018):
        return builder.tube(parent, points, radius, color)

    def diagnostic_tablet(forearm):
        pose = repair_pose(0)
        upper = Euler(pose["UpperArmL"], "XYZ").to_matrix()
        rotation = upper @ Euler(pose["ForearmL"], "XYZ").to_matrix()
        elbow = Vector((-0.21,0.008,0.41)) + upper @ Vector((0,0,-0.26))
        inverse = rotation.transposed()
        across = Vector((1,0,0))
        along = Vector((0,0.86,-0.51)).normalized()
        normal = across.cross(along)
        center = Vector((0,-0.275,0.335))

        def panel(width, height, depth, color, x=0, y=0, lift=0):
            cut = min(width,height)*0.06
            outline = [(-width/2+cut,-height/2),(width/2-cut,-height/2),
                       (width/2,-height/2+cut),(width/2,height/2-cut),
                       (width/2-cut,height/2),(-width/2+cut,height/2),
                       (-width/2,height/2-cut),(-width/2,-height/2+cut)]
            vertices = [inverse @ (center+across*(u+x)+along*(v+y)+normal*(w+lift)-elbow)
                        for w in (-depth/2,depth/2) for u,v in outline]
            faces = [tuple(reversed(range(8))), tuple(range(8,16)),
                     *[(i,(i+1)%8,(i+1)%8+8,i+8) for i in range(8)]]
            mesh(forearm, vertices, faces, color)

        panel(0.276,0.190,0.016,"ink")
        panel(0.244,0.158,0.002,"hose",lift=0.0095)
        panel(0.166,0.006,0.001,"silver",x=-0.016,y=0.048,lift=0.011)
        panel(0.041,0.013,0.001,"green",x=0.077,y=0.012,lift=0.011)
        for y,width in ((-0.009,0.119),(-0.031,0.156),(-0.053,0.093)):
            panel(width,0.005,0.001,"coolant-light",x=-0.017,y=y,lift=0.011)

    hips = builder.node("Hips", root, (0, 0, 0.90))
    torso = builder.node("Torso", hips)
    loft(torso, builder.profiles.TORSO, "shirt", power=2.4, chart="torso")

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
    loft(head, builder.profiles.HEAD, "skin", power=2.5, chart="head")
    for sign in (-1, 1):
        s(head, (sign*0.092,0.012,0.025), (0.026,0.043,0.064), "skin", kind="sphere")
    mesh(head, [(-0.016,-0.080,0.068),(0.016,-0.080,0.068),
                (-0.018,-0.081,0.012),(0.018,-0.081,0.012),
                (-0.010,-0.112,0.022),(0.010,-0.112,0.022)],
         [(0,1,5,4),(0,2,4),(1,5,3),(2,3,5,4)], "skin")

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
        if suffix == "L":
            diagnostic_tablet(forearm)

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
