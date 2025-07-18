/**
 * ColorBlind Filters
 * shaders.js
 *
 * @author     GdH <G-dH@github.com>
 * @copyright  2022-2024
 * @license    GPL-3.0
 */

'use strict';

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import { ColorblindFilter } from './shader_base.js';
import * as Daltonizer from './daltonizer.js';
import * as M from './matrix.js';

export const DesaturateEffect = GObject.registerClass(
    class DesaturateEffect extends Clutter.DesaturateEffect {
        updateEffect(properties) {
            this.factor = properties.factor;
        }
    });

export const InversionEffect = GObject.registerClass(
    class InversionEffect extends ColorblindFilter {
        _init() {
            // Leaving this in sRGB since it does its own gamma shenanigans
            super._init('srgb', { INVERSION_MODE: 'int' }, `
                float alpha = _c.a;

                if (INVERSION_MODE < 2) {
                    /* INVERSION_MODE ? shifted : non-shifted */
                    float mode = float(INVERSION_MODE);
                    float white_bias = mode * alpha * 0.02;
                    float m = 1.0 + white_bias;
                    float shift = white_bias + alpha - min(rgb.r, min(rgb.g, rgb.b)) - max(rgb.r, max(rgb.g, rgb.b));
                    rgb = vec3(((shift + rgb.r) / m),
                            ((shift + rgb.g) / m),
                            ((shift + rgb.b) / m));
                } else if (INVERSION_MODE == 2) {
                    rgb = vec3(alpha * 1.0 - rgb.r, alpha * 1.0 - rgb.g, alpha * 1.0 - rgb.b);
                }

                // gamma has to be compensated to maintain perceived differences in lightness on dark and light ends of the lightness scale
                float gamma = 1.8;
                rgb = pow(rgb, vec3(1.0/gamma));
                `);
        }

        updateEffect(properties) {
            this.set_uniform('INVERSION_MODE', properties.mode);
        }
    });

export const ColorMixerEffect = GObject.registerClass(
    class ColorMixerEffect extends ColorblindFilter {
        _init() {
            // Used sRGB upstream, so this will look a little different
            super._init('linear', { MIX_MODE: 'int', STRENGTH: 'float' }, `
                vec3 m;
                if (MIX_MODE == 0) {
                    m = vec3(rgb.b, rgb.r, rgb.g);
                } else if (MIX_MODE == 1) {
                    m = vec3(rgb.g, rgb.b, rgb.r);
                }
                rgb = mix(rgb, m, STRENGTH);
                `);
        }

        updateEffect(properties) {
            this.set_uniforms({
                // 0 - GRB, 1 - BRG
                MIX_MODE: properties.mode,
                STRENGTH: properties.factor,
            });
        }
    });

export const DaltonismEffect = GObject.registerClass(
    class DaltonismEffect extends ColorblindFilter {
        _init() {
            super._init('linear', { correction: 'mat3' }, `rgb = correction * rgb;`);
        }

        updateEffect(properties) {
            this.set_uniform('correction', Daltonizer.getCorrection3x3(properties));
        }
    });

export const UpstreamDaltonismEffect = GObject.registerClass(
    class UpstreamDaltonismEffect extends ColorblindFilter {
        _init() {
            super._init('srgb', { correction: 'mat3' }, `rgb = correction * rgb;`);
        }

        updateEffect(properties) {
            this.set_uniform('correction', this.getCorrectionMatrix(properties));
        }

        // Upstream does this in the shader, but we have a janky matrix library
        // and can do it on the CPU instead.
        getCorrectionMatrix(properties) {
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
                            -0.7, 0.0, 0.0,
                            0.5, 1.0, 0.0,
                            -0.3, 0.0, 1.0,
                            /*
                            // Upstream PR #28
                            -0.8, 0.0, 0.0,
                            0.0, 0.0, 0.0,
                            -0.2, 0.8, 0.8,
                            */
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
    });
