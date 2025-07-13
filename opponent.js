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
import Clutter from 'gi://Clutter';
import * as M from './matrix.js';

// Which LMS-to-Opponent transform to use; doesn't seem to make much difference
const useWandell = true;

// See lms_matrices.py for where the magic numbers come from.
const rgb2lms = [
    0.31399021620,
    0.15537240628,
    0.01775238698,
    0.63951293834,
    0.75789446163,
    0.10944209440,
    0.04649754622,
    0.08670141862,
    0.87256922462,
];

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
        0.700
    ];

function getRGB2Opp(whichCone = -1, factor = 0) {
    // Alter rgb2lms according to Machado et al.'s model for cone sensitivity
    const sim_rgb2lms = whichCone == -1
        ? rgb2lms
        : M.setCol3(rgb2lms, whichCone, [
            () => M.add3(
                M.scale3(1 - factor, M.getCol3(rgb2lms, 0)),
                M.scale3(factor * 0.96, M.getCol3(rgb2lms, 1))),
            () => M.add3(
                M.scale3(factor, M.getCol3(rgb2lms, 0)),
                M.scale3((1 - factor) / 0.96, M.getCol3(rgb2lms, 1))),
            () => M.scale3(1 - factor, M.getCol3(rgb2lms, 2)),
        ][whichCone]());

    // Use R+G+B for luminance; for tritanomaly, reduce B accordingly and spread
    // the difference to R and G.
    const rgb2opp = M.setRow3(M.mult3x3(lms2opp, sim_rgb2lms), 0,
        whichCone == 2
            ? [1 + factor / 2, 1 + factor / 2, 1 - factor]
            : [1, 1, 1]);

    // Scale rows so that each opponent component has a range of 1
    const r2o_scaled = M.mult3x3(
        M.diagonal(M.gen3((i) =>
            1 / M.getRow3(rgb2opp, i).reduce((a, v) => a + Math.abs(v), 0))),
        rgb2opp);

    // Offset luma rows so that luma components are 0 for R=G=B (i.e. grays).
    // This prevents the incorrect and colorful "correction" of grays. This
    // feels weird because it changes the ratio of the components, but only
    // the absolute difference between them matters.
    const condition = (row) => {
        const offset = -(row[0] + row[1] + row[2]) / 3;
        return M.gen3((i) => row[i] + offset);
    }
    return M.fromRows(
        M.getRow3(r2o_scaled, 0),
        condition(M.getRow3(r2o_scaled, 1)),
        condition(M.getRow3(r2o_scaled, 2)));
}

// Helpers for getting matrix data into shader uniforms. Clutter has aggregate
// data types for this, but they can't be created from GJS. :(
function updateUniform(effect, name, val) {
    for (const i of val.keys()) {
        const gv = new GObject.Value();
        gv.init(GObject.TYPE_FLOAT);
        gv.set_float(val[i]);

        effect.set_uniform_value(name + i.toString(), gv);
    }
}
function uniformDecl(name, size = 9) {
    return Array(size).fill().map((_, i) => `uniform float ${name}${i}`).join(';\n');
}
function uniformUse(name, type = "mat3", size = 9) {
    return type + "(" + Array(size).fill().map((_, i) => `${name}${i}`).join(', ') + ")";
}
function uniformDefn(name, type = "mat3", size = 9) {
    return `${type} ${name} = ${uniformUse(name, type, size)}`;
}

export const OpponentCorrectionEffect = GObject.registerClass(
    class OpponentCorrectionEffect extends Clutter.ShaderEffect {
        _init(properties) {
            super._init();

            this.set_shader_source(OpponentCorrectionEffect.getSource());
            this.set_uniform_value('tex', 0);

            this.updateEffect(properties);
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

            // As a minor optimization, the constant half of the partial
            // derivatives in the gradient are calculated only once.
            updateUniform(this, 'rgb2const', M.scale3(-2,
                M.add3x3(
                    M.diagonal(rgb_weights),
                    M.mult3x3(
                        M.transpose(rgb2sim),
                        M.mult3x3(
                            M.diagonal(opp_weights),
                            rgb2ideal)))));
            // The variable half still needs to be calculated for every
            // iteration.
            updateUniform(this, 'rgb2var', M.scale3(2,
                M.add3x3(
                    M.diagonal(rgb_weights),
                    M.mult3x3(
                        M.transpose(rgb2sim),
                        M.mult3x3(
                            M.diagonal(opp_weights),
                            rgb2sim)))));

            // The shader needs to know a lot about the cost function to solve
            // its derivative for zero.
            updateUniform(this, 'rgb2ideal', rgb2ideal);
            updateUniform(this, 'rgb2sim', rgb2sim);
            updateUniform(this, 'rgb_weights', rgb_weights);
            updateUniform(this, 'opp_weights', opp_weights);
        }

        vfunc_get_static_shader_source() {
            return OpponentCorrectionEffect.getSource();
        }

        static getSource() {
            return `
                uniform sampler2D tex;
                const int step_count = 5;
                ${uniformDecl('rgb2ideal')};
                ${uniformDecl('rgb2sim')};
                ${uniformDecl('rgb2const')};
                ${uniformDecl('rgb2var')};
                ${uniformDecl('rgb_weights', 3)};
                ${uniformDecl('opp_weights', 3)};

                void main() {
                    vec4 c = texture2D(tex, cogl_tex_coord_in[0].st);

                    ${uniformDefn('rgb_weights', 'vec3', 3)};
                    ${uniformDefn('opp_weights', 'vec3', 3)};

                    ${uniformDefn('rgb2sim')};
                    vec3 opp_ideal = ${uniformUse('rgb2ideal')} * c.rgb;

                    ${uniformDefn('rgb2var')};
                    vec3 grad_const = ${uniformUse('rgb2const')} * c.rgb;

                    vec3 rgb = c.rgb;
                    for (int i = 0; i < step_count; i++) {
                        // evaluate gradient at current rgb coordinates
                        vec3 grad = rgb2var * rgb + grad_const;

                        // line search for zero derivative of cost
                        vec3 sim_grad = rgb2sim * grad;
                        float num =
                            dot(rgb_weights, (rgb - c.rgb) * grad) +
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

                    cogl_color_out = vec4(rgb, c.a);
                }
                `;
        }
    });
