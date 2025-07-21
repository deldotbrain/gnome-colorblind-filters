/**
 * ColorBlind Filters
 * opponent.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0 or MIT, others upon request
 */

// Opponent Color Solver
//
// Instead of prescribing a specific transformation to correct for reduced
// sensitivity of a cone, this filter solves for a color that will look the way
// it was intended to, to a viewer with reduced cone sensitivity. This approach
// is certainly less efficient than the typical linear transformations and looks
// only slightly better, but it *does* look better.
//
// The color blindness model used here is more or less the one described by
// Machado et al. Its use of opponent color provides a concrete point of
// reference for how colors are meant to be perceived that makes it easier to
// reason with a solver like this.
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
    // From Wandell
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

function getRGB2Opp(whichCone = -1, factor = 0) {

    // Alter rgb2lms according to Machado et al.'s model for cone sensitivity
    const sim_rgb2lms = whichCone === -1
        ? rgb2lms
        : M.setRow3(rgb2lms, whichCone, [
            () => M.add3(
                M.scale3(1 - factor, M.getRow3(rgb2lms, 0)),
                M.scale3(factor * 0.96, M.getRow3(rgb2lms, 1))),
            () => M.add3(
                M.scale3(factor, M.getRow3(rgb2lms, 0)),
                M.scale3((1 - factor) / 0.96, M.getRow3(rgb2lms, 1))),
            () => M.scale3(1 - factor, M.getRow3(rgb2lms, 2)),
        ][whichCone]());

    // Use L+M+S for luminance. With factor = 0, rgb2lms is normalized so that
    // this is equivalent to R+G+B, but this allows the simulated change in
    // sensitivity to be applied to luminance as well.
    const mod_lms2opp = M.setRow3(lms2opp, 0, [1, 1, 1]);
    const rgb2opp = M.mult3x3(mod_lms2opp, sim_rgb2lms);

    // Scale rows so that each opponent component has a range of 1, sort of.
    // Normalizing the simulated luma row avoids an erroneous correction for
    // unchanged luma, but re-using the chroma normalization for typical cones
    // properly simulates the loss of contrast and encourages an aggressive
    // correction. At least for tritan, that means dark blues and light yellows
    // are more vibrant, which I like.
    const nom_rgb2opp = whichCone === -1 ? rgb2opp
        : M.setRow3(M.mult3x3(mod_lms2opp, rgb2lms),
            0, M.getRow3(rgb2opp, 0));
    const r2o_scaled = M.mult3x3(
        M.diagonal(M.gen3(i =>
            1 / M.getRow3(nom_rgb2opp, i).reduce((a, v) => a + Math.abs(v), 0))),
        rgb2opp);

    // Offset luma rows so that luma components are 0 for R=G=B (i.e. grays).
    // This prevents the incorrect and colorful "correction" of grays. This
    // feels weird because it changes the ratio of the components, but only
    // the absolute difference between them matters.
    const condition = row => {
        const offset = -(row[0] + row[1] + row[2]) / 3;
        return M.gen3(i => row[i] + offset);
    };
    return M.fromRows(
        M.getRow3(r2o_scaled, 0),
        condition(M.getRow3(r2o_scaled, 1)),
        condition(M.getRow3(r2o_scaled, 2)));
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

                    // line search for zero derivative of cost
                    vec3 sim_grad = rgb2sim * grad;
                    float num =
                        dot(rgb_weights, (rgb - orig_rgb) * grad) +
                        dot(opp_weights * sim_grad, rgb2sim * rgb - opp_ideal);
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
        const { whichCone, factor } = properties;
        // Cost of the opponent-space errors; first component is luma
        const opp_weights = [250, 50, 50];
        // Cost of adjustment away from original RGB value. Has little
        // effect for low factor, but avoids solutions far outside of the
        // RGB gamut for high factors.
        const rgb_weights = [1, 1, 1];

        // To correct for reduced cone sensitivity, search for an RGB value
        // that produces a point in opponent-color space for a colorblind
        // viewer that is close to the intended point. Luma errors are much
        // more visible than chroma, so they should be reduced compared to
        // chroma errors. Finally, the RGB gamut is finite, so values that
        // differ greatly from the original RGB should be avoided. So,
        // minimize a cost function:
        // c(r,g,b) = W_r*(r_c - R_0)^2
        //          + W_g*(g_c - G_0)^2
        //          + W_b*(b_c - B_0)^2
        //          + W_v*(v_c - V_i)^2
        //          + W_yb*(yb_c - YB_i)^2
        //          + W_rg*(rg_c - RG_i)^2
        // i.e. the square of the distance in opponent-color space between
        // the simulated corrected image and the intended image, plus the
        // square of the distance in RGB space between the corrected image
        // and the original, but with some components possibly weighted
        // differently.
        //
        // There's probably a really clever way to solve this analytically,
        // but I don't know it and GPU cycles are pretty cheap. A couple of
        // iterations of gradient descent produce a very accurate result.

        const rgb2ideal = getRGB2Opp();
        const rgb2sim = getRGB2Opp(whichCone, factor);

        this.set_uniforms({
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

            // The shader needs to know a lot about the cost function to
            // solve its derivative for zero.
            rgb2ideal,
            rgb2sim,
            rgb_weights,
            opp_weights,
        });
    }
}

export function getSimulationMatrix(properties) {
    const { isCorrection, whichCone, factor } = properties;

    const rgb2ideal = getRGB2Opp();
    const rgb2sim = getRGB2Opp(whichCone, factor);

    return isCorrection
        ? M.mult3x3(M.inverse3x3(rgb2sim), rgb2ideal)
        : M.mult3x3(M.inverse3x3(rgb2ideal), rgb2sim);
}
