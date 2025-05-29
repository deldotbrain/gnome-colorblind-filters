#!/usr/bin/env python3

import numpy as np
import json

# sRGB to XYZ from https://en.wikipedia.org/wiki/SRGB#Primaries:
srgb2xyz = np.matrix(
    [
        [0.4124, 0.3576, 0.1805],
        [0.2126, 0.7152, 0.0722],
        [0.0193, 0.1192, 0.9505],
    ]
)

# CIECAM02 transformation (https://en.wikipedia.org/wiki/LMS_color_space#Later_CIECAMs):
#
# Used by AOSP's filters. It converts to spectrally-sharpened LMS that doesn't
# reflect actual cone sensitivity, yet the AOSP algorithm relies on it to infer
# the sensitivity of the unaffected cones. This is why AOSP's filters don't
# look right.
ciecam02 = np.matrix(
    [
        [0.7328, 0.4296, -0.1624],
        [-0.7036, 1.6975, 0.0061],
        [0.003, 0.0136, 0.9834],
    ]
)


# From http://brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
#
# Effectively the same as the matrix given by Wikipedia, but with the advantage
# that this matrix is given with an explicitly stated illuminant: D65.
srgb_to_d65_xyz = np.matrix(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ]
)

# Hunt-Pointer-Estevez transformation (https://en.wikipedia.org/wiki/LMS_color_space#Hunt,_RLAB):
#
# This version of the matrix is normalized to D65.
hpe_d65_xyz_to_lms = np.matrix(
    [
        [0.4002, 0.7076, -0.0808],
        [-0.2263, 1.1653, 0.0457],
        [0.0000, 0.0000, 0.9182],
    ]
)

aosp_rgb2lms = ciecam02 * srgb2xyz
hpe_rgb2lms = hpe_d65_xyz_to_lms * srgb_to_d65_xyz

print(
    json.dumps(
        {
            "HPE": {
                "rgb2lms": list(hpe_rgb2lms.T.flat),
                "lms2rgb": list(hpe_rgb2lms.I.T.flat),
            },
            "AOSP": {
                "rgb2lms": list(aosp_rgb2lms.T.flat),
                "lms2rgb": list(aosp_rgb2lms.I.T.flat),
            },
        },
        indent=4,
    )
)
