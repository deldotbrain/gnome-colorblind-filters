#!/usr/bin/env python3

import numpy as np
import json

# sRGB definition (https://en.wikipedia.org/wiki/SRGB#Primaries):
rgb2xyz = np.matrix(
    '0.4124, 0.3576, 0.1805; 0.2126, 0.7152, 0.0722; 0.0193, 0.1192, 0.9505'
)

# XYZ to LMS transformation from AOSP. I don't know where they got this matrix,
# but it doesn't agree with my vision personally.
#
# https://github.com/LineageOS/android_frameworks_native/blob/lineage-22.2/services/surfaceflinger/Effects/Daltonizer.cpp
# NB: AOSP's mat4's constructor accepts a column-major array!
aosp_xyz2lms = np.matrix(
    '0.7328,-0.7036, 0.0030; 0.4296, 1.6975, 0.0136; -0.1624, 0.0061, 0.9834'
).T

# Hunt-Pointer-Estevez transformation (https://en.wikipedia.org/wiki/LMS_color_space#Hunt,_RLAB):
hpe_xyz2lms = np.matrix(
    # Equal-energy
    # '0.38971, 0.68898, -0.07868; -0.22981, 1.18340, 0.04641; 0, 0, 1'
    # D65-normalized
    '0.4002, 0.7076, -0.0808; -0.2263, 1.1653, 0.0457; 0.0000, 0.0000, 0.9182'
)

aosp_rgb2lms = aosp_xyz2lms * rgb2xyz
rgb2lms = hpe_xyz2lms * rgb2xyz

print(
    json.dumps(
        {
            'HPE': {
                'rgb2lms': list(rgb2lms.T.flat),
                'lms2rgb': list(rgb2lms.I.T.flat),
            },
            'AOSP': {
                'rgb2lms': list(aosp_rgb2lms.T.flat),
                'lms2rgb': list(aosp_rgb2lms.I.T.flat),
            },
        },
        indent=2,
    )
)
