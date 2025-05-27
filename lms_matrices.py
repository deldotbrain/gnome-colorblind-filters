#!/usr/bin/env python3

import numpy as np
import json

# Coefficients from AOSP. See e.g.
# https://github.com/LineageOS/android_frameworks_native/blob/lineage-22.2/services/surfaceflinger/Effects/Daltonizer.cpp
# NB: AOSP's mat4's constructor accepts a column-major array!
rgb2xyz = np.matrix('0.4124, 0.2126, 0.0193; 0.3576, 0.7152, 0.1192; 0.1805, 0.0722, 0.9505').T
xyz2lms = np.matrix('0.7328,-0.7036, 0.0030; 0.4296, 1.6975, 0.0136; -0.1624, 0.0061, 0.9834').T

rgb2lms = xyz2lms * rgb2xyz

# Dump things as column-major lists
print(json.dumps({
    "rgb2lms": list(rgb2lms.T.flat),
    "lms2rgb": list(rgb2lms.I.T.flat),
    }, indent=2))
