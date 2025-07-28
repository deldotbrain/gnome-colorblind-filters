/**
 * ColorBlind Filters
 * opponent.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    0BSD
 */

// Opponent Color Solver
//
// Instead of prescribing a specific transformation to correct for reduced
// sensitivity of a cone, this filter searches for a color that will look the way
// it was intended to, to a viewer with reduced cone sensitivity. The color
// blindness model used here is more or less the one described by Machado et al.
// Its use of opponent color provides a concrete point of reference for how
// colors are meant to be perceived that makes it easier to reason with a solver
// like this.
//
// A color's position in opponent color space tells us how it will look to the
// brain. The more closely our filter can match the stimulus that a colorblind
// person's brain receives to what a trichromat's brain would receive, the more
// accurately the color will be perceived. Machado et al. use the reverse of
// this to simulate color blindness: their simulation produces a color that
// stimulates a trichromat's brain the way the original color would have
// stimulated a colorblind person's.
//
// That works well for simulating color blindness because color blindness
// reduces the color gamut, so the result is always within the RGB gamut.
// Reversing the transformation to correct for color blindness would widen the
// gamut and require colors that our displays can't produce!
//
// To build a correction filter that doesn't just saturate colors, it's
// necessary to correct the appearance of each color (i.e. try to match its
// position in opponent color space) while also limiting the change in RGB value
// that the filter is allowed to make (i.e. try to match its position in RGB
// space). Finding an optimial solution is now an optimization problem that can
// be handled with ordinary techniques.
//
// To do so, we define a cost function as the sum of the square of the distance
// in opponent color space and the square of the distance in RGB space (the math
// is simpler this way). Different components are weighted differently, with RGB
// distance having a low (but non-zero) weight and the luminance component in
// opponent space having a high weight because luma errors are much more visible
// than chroma. Starting at the original RGB value, we use a few iterations of
// gradient descent to find a local minimum in the cost function. To decide the
// step size, the derivative of the cost function along the gradient is solved
// for zero. Deriving the various equations is excruciatingly boring, mechanical
// calculus that won't be repeated here.
//
// c(r,g,b) = W_r*(r_c - R_0)^2
//          + W_g*(g_c - G_0)^2
//          + W_b*(b_c - B_0)^2
//          + W_v*(v_c - V_i)^2
//          + W_yb*(yb_c - YB_i)^2
//          + W_rg*(rg_c - RG_i)^2
//
// There's probably a really clever way to minimize that function analytically,
// but I don't know it and GPU cycles are pretty cheap.
//
// Most of the actual magic of this filter is in the conditioning of the
// RGB-to-opponent transforms. Without conditioning them, simulating a
// difference in sensitivity would introduce chroma errors to grayscale colors
// and luma errors on most colors. The specifics of this conditioning are still
// being worked on, so the best reference is the comments in getTransforms().
//
// Valuable reading:
//
// Machado et al, 2009:
// https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
//
// Wandell:
// https://foundationsofvision.stanford.edu/chapter-9-color/#Opponent-Colors

'use strict';

import GObject from 'gi://GObject';
import { ColorblindFilter } from './shader_base.js';
import * as M from './matrix.js';
import { srgb_to_d65_xyz, hpe_d65_xyz_to_lms } from './constants.js';

// Which LMS-to-Opponent transform to use; doesn't seem to make much difference
const useWandell = true;

// Convert L, M, S into V, R-G, Y-B (green, blue positive)
const lms2opp = useWandell
    // From Wandell, who very deliberately says that this is just one data
    // point, not an absolute, general truth. We'll use it that way anyway.
    ? [
        1.00,
        -0.59,
        -0.34,
        0.00,
        0.80,
        -0.11,
        0.00,
        -0.12,
        0.93,
    ]
    // Machado et al. cite Ingling and Tsou with a different transform:
    : [
        0.600,
        -1.200,
        -0.240,
        0.400,
        1.600,
        -0.105,
        0.000,
        -0.400,
        0.700,
    ];

const rgb2lms = M.mult3x3(hpe_d65_xyz_to_lms, srgb_to_d65_xyz);

function getTransforms(whichCone, factor) {
    const both = (inputs, fn) => {
        const ret = {};
        for (const i in inputs) {
            ret[i] = fn(inputs[i]);
        }
        return ret;
    };

    // Alter rgb2lms according to Machado et al.'s model for cone sensitivity
    const sim_rgb2lms = M.setRow3(rgb2lms, whichCone, [
        () => M.add3(
            M.scale3(1 - factor, M.getRow3(rgb2lms, 0)),
            M.scale3(factor * 0.96, M.getRow3(rgb2lms, 1))),
        () => M.add3(
            M.scale3(factor / 0.96, M.getRow3(rgb2lms, 0)),
            M.scale3(1 - factor, M.getRow3(rgb2lms, 1))),
        () => M.scale3(1 - factor, M.getRow3(rgb2lms, 2)),
    ][whichCone]());

    const r2l = { ideal: rgb2lms, sim: sim_rgb2lms };

    // Use L+M+S for luminance. With factor = 0, rgb2lms is normalized so that
    // this is equivalent to R+G+B, but this allows the simulated change in
    // sensitivity to be applied to luminance as well.
    const mod_lms2opp = M.setRow3(lms2opp, 0, [1, 1, 1]);
    const rgb2opp = both(r2l, mat => M.mult3x3(mod_lms2opp, mat));

    const row_sum = (mat, row_num, elem_map = x => x) =>
        M.getRow3(mat, row_num).reduce((a, v) => a + elem_map(v), 0);

    // Scale rows so that each opponent component has a range of 1, sort of.
    // Normalizing the simulated luma row avoids an erroneous correction for
    // unchanged luma, but re-using the chroma normalization for typical cones
    // properly simulates the loss of contrast and encourages an aggressive
    // correction. At least for tritan, that means dark blues and light yellows
    // are more vibrant, which I like.
    const scaled = both(rgb2opp, r2o => {
        const ref = M.setRow3(rgb2opp.ideal, 0, M.getRow3(r2o, 0));
        return M.mult3x3(
            M.diagonal(M.gen3(i => 1 / row_sum(ref, i, Math.abs))),
            r2o);
    });

    // Align "neutral" chroma values with a small offset proportional to luma.
    // Otherwise, a chroma error appears on grays due to the different
    // sensitivity, causing an unwanted correction.
    const row_offset = row_num => {
        const ideal_white = M.dot3(M.getRow3(scaled.ideal, row_num), [1, 1, 1]);
        const sim_white = M.dot3(M.getRow3(scaled.sim, row_num), [1, 1, 1]);
        return sim_white - ideal_white;
    };
    const correct_offset = M.sub3x3(
        M.identity3x3(),
        M.gen3x3((r, c) => c === 0 && r !== 0 ? row_offset(r) : 0));
    return {
        ideal: scaled.ideal,
        sim: M.mult3x3(correct_offset, scaled.sim),
    };
}

export class OpponentCorrectionEffect extends ColorblindFilter {
    static {
        GObject.registerClass(this);
    }

    _init() {
        super._init(
            'linear',
            {
                rgb2ideal: 'mat3',
                rgb2sim: 'mat3',
                rgb2const: 'mat3',
                rgb2var: 'mat3',
                rgb_weights: 'vec3',
                opp_weights: 'vec3',
            },
            `
                const int step_count = 5;

                vec3 orig_rgb = rgb;
                vec3 opp_ideal = rgb2ideal * rgb;
                vec3 grad_const = rgb2const * rgb;

                for (int i = 0; i < step_count; i++) {
                    // evaluate gradient at current rgb coordinates
                    vec3 grad = rgb2var * rgb + grad_const;

                    // pick a step size by solving the derivative of cost wrt
                    // step size for zero.
                    vec3 sim_grad = rgb2sim * grad;
                    float num =
                        dot(rgb_weights, (rgb - orig_rgb) * grad) +
                        dot(opp_weights, (rgb2sim * rgb - opp_ideal) * sim_grad);
                    float den =
                        dot(rgb_weights, grad * grad) +
                        dot(opp_weights, sim_grad * sim_grad);

                    // gradient descent
                    if (den == 0) {
                        break;
                    }
                    float step = num / den;
                    rgb -= step * grad;
                }
            `);
    }

    updateEffect(properties) {
        // Cost of the opponent-space errors; first component is luma
        const opp_weights = [250, 50, 50];
        // Cost of adjustment away from original RGB value. Has little
        // effect for low factor, but avoids solutions far outside of the
        // RGB gamut for high factors.
        const rgb_weights = [1, 1, 1];

        const { whichCone, factor } = properties;
        const { ideal: rgb2ideal, sim: rgb2sim } = getTransforms(whichCone, factor);

        this.set_uniforms({
            // The derivative of the cost function splits nicely in half, with
            // one half based on the initial RGB value and the other on the
            // corrected value.
            //
            // As a minor optimization, the constant half of the partial
            // derivatives in the gradient are calculated only once.
            rgb2const: M.scale3(-2,
                M.add3x3(
                    M.diagonal(rgb_weights),
                    M.mult3x3(
                        M.transpose(rgb2sim),
                        M.mult3x3(
                            M.diagonal(opp_weights),
                            rgb2ideal)))),

            // The variable half still needs to be calculated for every
            // iteration.
            rgb2var: M.scale3(2,
                M.add3x3(
                    M.diagonal(rgb_weights),
                    M.mult3x3(
                        M.transpose(rgb2sim),
                        M.mult3x3(
                            M.diagonal(opp_weights),
                            rgb2sim)))),

            // The shader needs a lot of information about the cost function to
            // solve its derivative for zero when deciding on a step size.
            rgb2ideal,
            rgb2sim,
            rgb_weights,
            opp_weights,
        });
    }
}

// Color blindness only reduces the gamut, so there's no need for cost function
// shenanigans when simulating. A simple linear transform is sufficient.
export function getSimulationMatrix(properties) {
    const { isCorrection, whichCone, factor } = properties;
    const { ideal: rgb2ideal, sim: rgb2sim } = getTransforms(whichCone, factor);

    return isCorrection
        ? M.mult3x3(M.inverse3x3(rgb2sim), rgb2ideal)
        : M.mult3x3(M.inverse3x3(rgb2ideal), rgb2sim);
}
