/*
 * Copyright 2013 The Android Open Source Project
 * Copyright 2025 A. Pennucci <apennucci@protonmail.com>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// This algorithm is based on AOSP, specifically:
// https://github.com/LineageOS/android_frameworks_native/blob/1ec2d9a02a3c4e6baf9628ad4bfa90acbd4c981c/services/surfaceflinger/Effects/Daltonizer.cpp

'use strict';

import * as M from './matrix.js';

// See lms_matrices.py for where the magic numbers come from.
const transforms = {
    "HPE": {
        "rgb2lms": [
            0.3139902162,
            0.15537240627999999,
            0.01775238698,
            0.63951293834,
            0.7578944616300001,
            0.10944209440000001,
            0.04649754622000001,
            0.08670141862000001,
            0.87256922462
        ],
        "lms2rgb": [
            5.472212058380287,
            -1.1252418955335692,
            0.029801651173470223,
            -4.641960098354472,
            2.2931709380606233,
            -0.19318072825714036,
            0.16963707682797408,
            -0.1678952022237088,
            1.1636478927838123
        ]
    },
    "AOSP": {
        "rgb2lms": [
            0.39040536,
            0.07084159000000004,
            0.023108180000000002,
            0.5499411200000001,
            0.9631717599999999,
            0.12802080000000002,
            0.008926320000000027,
            0.0013577500000000052,
            0.93624512
        ],
        "lms2rgb": [
            2.85846766750094,
            -0.21018226726543507,
            -0.0418120025914336,
            -1.6287877255287762,
            1.1582008557727166,
            -0.11816935309996411,
            -0.024891035560677063,
            0.0003242814915942015,
            1.0686663677928099
        ]
    }
};

// The actual AOSP algorithm. Returns a 3x3 matrix to transform rgb values.
export function getCorrection3x3(properties) {
    const { whichCone, transform, isCorrection, factor, tritanHack } = properties;
    const pick = (p, d, t) => [p, d, t][whichCone];
    const { rgb2lms, lms2rgb } = transforms[transform];

    // Calculate an error projection in LMS space.
    //
    // For protanopia and deuteranopia, assume that the blue sRGB primary is
    // unaffected. That gives us 3 points in RGB space that mustn't be affected
    // by the projection in LMS space. Project along the normal of the plane
    // that includes all three points. For tritanopia, make the same assumption
    // about the red primary and proceed similarly.
    //
    // Optionally, for tritanopia, assume that *two* primaries are unaffected:
    // red and green. Project along the normal of the plane parallel to the
    // lines between black and white, and between red and green. To my (somewhat
    // tritanomalous) eyes, this does a better job correcting color.
    const lms_bw = M.multiplyMatrixVec(rgb2lms, Array(3).fill(1.0));
    const lms_ab = M.multiplyMatrixVec(rgb2lms,
        !tritanHack ? pick([0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0]) : [1.0, -1.0, 0.0]);
    const soln = M.cross3(lms_bw, lms_ab);

    const simulation = pick(
        [0.0, 0.0, 0.0, -soln[1] / soln[0], 1.0, 0.0, -soln[2] / soln[0], 0.0, 1.0],
        [1.0, -soln[0] / soln[1], 0.0, 0.0, 0.0, 0.0, 0.0, -soln[2] / soln[1], 1.0],
        [1.0, 0.0, -soln[0] / soln[2], 0.0, 1.0, -soln[1] / soln[2], 0.0, 0.0, 0.0]);

    // Error: difference between simulated vision and ideal vision
    const error = M.sub3x3(simulation, M.identity3x3());
    // If correcting, negate the error and spread it across the other cones.
    // If simulating, scale it and leave it on the same cone.
    const spread = isCorrection
        ? pick(
            [0.0, -factor, -factor, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, -factor, 0.0, -factor, 0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -factor, -factor, 0.0])
        : [factor, 0.0, 0.0, 0.0, factor, 0.0, 0.0, 0.0, factor];
    const adjustment = M.add3x3(M.identity3x3(), M.mult3x3(spread, error));
    // Taken together: lms2rgb * (I - (spread * (sim - I)) * rgb2lms
    return M.mult3x3(lms2rgb, M.mult3x3(adjustment, rgb2lms));
}
