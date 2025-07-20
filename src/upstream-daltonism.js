'use strict';
import * as M from './matrix.js';

// Upstream does this in the shader, but we have a janky matrix library
// and can do it on the CPU instead.
export default function getCorrectionMatrix(properties) {
    const { whichCone, isCorrection, highContrast, factor } = properties;

    const rgb2lms = M.transpose([
        17.8824, 43.5161, 4.11935,
        3.45565, 27.1554, 3.86714,
        0.0299566, 0.184309, 1.46709,
    ]);

    const lms2lms = M.transpose([
        [
            0.0, 2.02344, -2.52581,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0,
        ],
        [
            1.0, 0.0, 0.0,
            0.494207, 0.0, 1.24827,
            0.0, 0.0, 1.0,
        ],
        [
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            -0.012491378299329402, 0.07203451899279534, 0.0,
        ],
    ][whichCone]);

    const lms2error = M.transpose([
        0.0809444479, -0.130504409, 0.116721066,
        -0.0102485335, 0.0540193266, -0.113614708,
        -0.000365296938, -0.00412161469, 0.693511405,
    ]);

    const rgb2error = M.mult3x3(lms2error, M.mult3x3(lms2lms, rgb2lms));

    if (!isCorrection) {
        // upstream has some spiffy math here, but it's stubbed out and reduces to:
        // lightness_diff = error.g - color.g;
        //
        // prot: error.rg += 2*lightness_diff
        // deuter: error.rg += 0.7 * lightness_diff
        // trit: nothing
        // out_color = mix(color, error, strength)
        const lightness_diff = [
            [
                0, 0, 0,
                2, 2, 0,
                0, 0, 0,
            ],
            [
                0, 0, 0,
                0.7, 0.7, 0,
                0, 0, 0,
            ],
            M.zero3x3(),
        ][whichCone];
        const rgb2ld =
            M.mult3x3(lightness_diff,
                M.sub3x3(M.identity3x3(), rgb2error));

        return M.add3x3(
            M.scale3x3(1 - factor, M.identity3x3()),
            M.scale3x3(factor, M.add3x3(rgb2ld, rgb2error)));
    } else {
        // upstream:
        // error = mix(color, error, strength);
        // error = color - error;
        // ...which, if I'm not too fried right now, means:
        // error = str * (color - error)
        const rgb2diff = M.sub3x3(M.identity3x3(), rgb2error);
        const correction = M.transpose([
            [
                [
                    0.56667, 0.43333, 0.00000,
                    0.55833, 0.44267, 0.00000,
                    0.00000, 0.24167, 0.75833,
                ],
                [
                    -0.8, 0.0, 0.0,
                    0.0, 0.0, 0.0,
                    -0.2, 0.8, 0.8,
                ],
                [
                    0.3, 0.5, 0.4,
                    0.5, 0.7, 0.3,
                    0.0, 0.0, 1.0,
                ],
            ],
            [
                [
                    2.56667, 0.43333, 0.00000,
                    1.55833, 0.44267, 0.00000,
                    0.00000, 0.24167, 0.75833,
                ],
                [
                    -1.5, 1.5, 0.0,
                    -1.5, 1.5, 0.0,
                    1.5, 0.0, 0.0,
                ],
                // no tritanomaly high contrast mode
            ],
        ][highContrast ? 1 : 0][whichCone]);
        // out_color = color + correction
        return M.add3x3(
            M.identity3x3(),
            M.mult3x3(
                correction,
                M.scale3x3(factor, rgb2diff)));
    }
}
