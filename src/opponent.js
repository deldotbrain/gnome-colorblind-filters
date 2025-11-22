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
// This filter takes a slightly different approach by searching for a new color
// which minimizes (the square of) the distance in opponent color space between
// the intended appearance of the original color and the simulated appearance of
// the new color. Gradient descent is used to search near the original color for
// the new color value.
//
// Something strange happens that the developer doesn't (yet) understand:
// instead of finding the global minimum distance (the "reverse simulation"
// approach yields this), it finds a local minimum near the original color. As
// part of a larger effort to improve this filter, they are working on
// understanding why that is.
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

// Convert L, M, S into V, R-G, Y-B (green, blue positive)
// From Wandell, who very deliberately says that this is just one data
// point, not an absolute, general truth. We'll use it that way anyway.
const lms2opp = [
    1.00,
    -0.59,
    -0.34,
    0.00,
    0.80,
    -0.11,
    0.00,
    -0.12,
    0.93,
];

function getTransforms(whichCone, factor) {
    const rgb2lms = M.mult3x3(hpe_d65_xyz_to_lms, srgb_to_d65_xyz);

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
    const normalize_row = (mat, row_num, ref = mat) =>
        M.scale3(1 / row_sum(ref, row_num, Math.abs), M.getRow3(mat, row_num));

    // Scale luma so that #ffffff has ideal and simulated luma of 1. This avoids
    // spurious corrections of grayscale.
    const luma_norm = both(rgb2opp, mat => M.setRow3(mat, 0, normalize_row(mat, 0)));

    // Align chroma values so that gray colors have zero chroma components by
    // adding a small offset proportional to luma. This prevents a chroma error
    // from appearing on grays due to the different sensitivity, avoiding
    // spurious "correction".
    const chroma_offset = (mat, component) => {
        const row = M.getRow3(mat, component);
        const error = M.dot3(row, [1, 1, 1]);
        return M.sub3(row, M.scale3(error, M.getRow3(mat, 0)));
    };
    const zero_aligned = both(luma_norm, s =>
        M.fromRows(
            M.getRow3(s, 0),
            chroma_offset(s, 1),
            chroma_offset(s, 2)
        ));

    // Scale rows so that the ideal chroma components have a range of 1. Apply
    // the same scaling to the simulated components to simulate the reduction in
    // color sensitivity.
    return both(zero_aligned, mat => M.fromRows(
        M.getRow3(mat, 0),
        normalize_row(mat, 1, zero_aligned.ideal),
        normalize_row(mat, 2, zero_aligned.ideal)));
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

                    float den = dot(opp_weights, sim_grad * sim_grad);
                    if (den == 0) {
                        break;
                    }

                    float num = dot(opp_weights, (rgb2sim * rgb - opp_ideal) * sim_grad);
                    rgb -= (num / den) * grad;
                }
            `);
    }

    updateEffect(properties) {
        // Cost of the opponent-space errors; first component is luma
        const opp_weights = [5, 1, 1];

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
                M.mult3x3(
                    M.transpose(rgb2sim),
                    M.mult3x3(
                        M.diagonal(opp_weights),
                        rgb2ideal))),

            // The variable half still needs to be calculated for every
            // iteration.
            rgb2var: M.scale3(2,
                M.mult3x3(
                    M.transpose(rgb2sim),
                    M.mult3x3(
                        M.diagonal(opp_weights),
                        rgb2sim))),

            // The shader needs a lot of information about the cost function to
            // solve its derivative for zero when deciding on a step size.
            rgb2ideal,
            rgb2sim,
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
