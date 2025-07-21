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
import * as C from './constants.js';

let transforms = null;
function get_transforms(family) {
    if (transforms === null) {
        transforms = {
            HPE: { rgb2lms: M.mult3x3(C.hpe_d65_xyz_to_lms, C.srgb_to_d65_xyz), },
            AOSP: { rgb2lms: M.mult3x3(C.ciecam02, C.srgb2xyz), },
        };

        for (const fam in transforms) {
            transforms[fam].lms2rgb = M.inverse3x3(transforms[fam].rgb2lms);
        }
    }

    return transforms[family];
}

// Compute a transformation that rotates the LMS error vector produced from a
// simulated RGB primary towards another LMS color. Also, scale the
// transformation by the intensity factor.
function getSteeringMatrix(directionVec, primaryError, factor) {
    // https://math.stackexchange.com/a/476311
    const whiteMag = M.magnitude3(directionVec);
    const errorMag = M.magnitude3(primaryError);

    const normWhite = M.scale3(1 / whiteMag, directionVec);
    const normWorst = M.scale3(1 / errorMag, primaryError);

    const v = M.cross3(normWorst, normWhite);
    const c = M.dot3(normWorst, normWhite);

    const cp = [0, v[2], -v[1], -v[2], 0, v[0], v[1], -v[0], 0];

    // It's a rotation matrix. The internet told me so!
    const r = M.add3x3(M.identity3x3(), M.add3x3(cp,
        M.scale3x3(1 / (1 + c), M.mult3x3(cp, cp))));

    // Apply a scaling factor such that the worst-case error is scaled to the
    // full -directionVec.
    return M.scale3x3(factor * whiteMag / errorMag, r);
}

export default function getCorrectionMatrix(properties) {
    const { whichCone, transform, isCorrection, factor, tritanHack, errorSteering } = properties;
    const pick = (p, d, t) => [p, d, t][whichCone];
    const { rgb2lms, lms2rgb } = get_transforms(transform);

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
    const lms_ab = M.multiplyMatrixVec(rgb2lms, !tritanHack
        ? pick([0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [1.0, 0.0, 0.0])
        : [1.0, -1.0, 0.0]);
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
        ? errorSteering
            ? getSteeringMatrix(
                // I have no idea *where* to point the error. For tritans, white
                // will improve visibility. For prot/deuterans, it won't prevent
                // confusion. Maybe magenta/cyan-ish would at least make the
                // colors more distinct?
                //lms_bw,
                M.multiplyMatrixVec(rgb2lms, pick([0.5, 0, 1], [0, 0.5, 1], [1, 1, 1])),
                M.multiplyMatrixVec(
                    error,
                    M.getCol3(rgb2lms, whichCone)),
                factor)
            : pick(
                [0.0, -factor, -factor, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
                [0.0, 0.0, 0.0, -factor, 0.0, -factor, 0.0, 0.0, 0.0],
                [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -factor, -factor, 0.0])
        : [factor, 0.0, 0.0, 0.0, factor, 0.0, 0.0, 0.0, factor];
    const adjustment = M.add3x3(M.identity3x3(), M.mult3x3(spread, error));
    // Taken together: lms2rgb * (I - (spread * (sim - I)) * rgb2lms
    return M.mult3x3(lms2rgb, M.mult3x3(adjustment, rgb2lms));
}
