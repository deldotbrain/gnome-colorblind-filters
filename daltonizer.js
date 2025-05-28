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
            0.3139188,
            0.15529867,
            0.017721260000000003,
            0.63955568,
            0.7579451199999999,
            0.10944944000000001,
            0.046524420000000004,
            0.08672536,
            0.8727491
        ],
        "lms2rgb": [
            5.472504494072676,
            -1.1247095815502104,
            0.029927454376835815,
            -4.64219698980189,
            2.2926289889214537,
            -0.19325299692399875,
            0.16956890313305473,
            -0.16786337959051792,
            1.1634129193285379
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
    const { whichCone, transform, isCorrection, factor } = properties;
    const pick = (p, d, t) => [p, d, t][whichCone];
    const { rgb2lms, lms2rgb } = transforms[transform];

    const lms_w = M.multiplyMatrixVec(rgb2lms, Array(3).fill(1.0));
    const soln = M.cross3(lms_w, M.getCol3(rgb2lms, pick(2, 2, 0)));
    const sim = pick(
        [0.0, 0.0, 0.0, -soln[1] / soln[0], 1.0, 0.0, -soln[2] / soln[0], 0.0, 1.0],
        [1.0, -soln[0] / soln[1], 0.0, 0.0, 0.0, 0.0, 0.0, -soln[2] / soln[1], 1.0],
        [1.0, 0.0, -soln[0] / soln[2], 0.0, 1.0, -soln[1] / soln[2], 0.0, 0.0, 0.0]);

    // If correcting, spread the error across other channels. If simulating,
    // scale it.
    const spread = isCorrection
        ? pick(
            [0.0, factor, factor, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, factor, 0.0, factor, 0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, factor, factor, 0.0])
        : [-factor, 0.0, 0.0, 0.0, -factor, 0.0, 0.0, 0.0, -factor];
    // lms2rgb * (I + (spread * (I - sim)) * rgb2lms
    const adjustment = M.mult3x3(spread, M.sub3x3(M.identity3x3(), sim));
    return M.mult3x3(lms2rgb, M.mult3x3(M.add3x3(M.identity3x3(), adjustment), rgb2lms));
}
