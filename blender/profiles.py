"""Shared garment/head profiles for geometry and conforming texture coordinates."""

TORSO = [(-0.015,0.151,0.102,0), (0.055,0.165,0.116,0),
         (0.18,0.171,0.123,0.006), (0.31,0.202,0.125,0.008),
         (0.395,0.213,0.110,0.007), (0.45,0.168,0.089,0.006),
         (0.475,0.074,0.062,0)]
HEAD = [(-0.068,0.044,0.041,-0.018), (-0.05,0.066,0.060,-0.011),
        (-0.005,0.084,0.077,0), (0.045,0.093,0.080,0.003),
        (0.087,0.096,0.078,0.008), (0.132,0.094,0.071,0.008),
        (0.163,0.075,0.051,0.006)]


def sample(rings, z):
    for lower, upper in zip(rings, rings[1:]):
        if lower[0] <= z <= upper[0]:
            t = (z-lower[0])/(upper[0]-lower[0])
            return tuple(lower[i]*(1-t)+upper[i]*t for i in (1,2,3))
    raise ValueError(f"PROFILE_HEIGHT: {z}")
