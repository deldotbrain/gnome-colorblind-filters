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
import * as Daltonizer from './daltonizer.js';
import * as M from './matrix.js';

function set_uniform_float(effect, name, value) {
    const gv = new GObject.Value();
    gv.init(GObject.TYPE_FLOAT);
    gv.set_float(value);

    effect.set_uniform_value(name, gv);
}

export const DesaturateEffect = GObject.registerClass(
    class DesaturateEffect extends Clutter.DesaturateEffect {
        updateEffect(properties) {
            this.factor = properties.factor;
        }
    });

export const InversionEffect = GObject.registerClass(
    class InversionEffect extends Clutter.ShaderEffect {
        _init(properties) {
            super._init();
            this.updateEffect(properties);

            this.set_shader_source(InversionEffect.getSource());
        }

        updateEffect(properties) {
            this.set_uniform_value('tex', 0);
            this.set_uniform_value('INVERSION_MODE', properties.mode);
        }

        vfunc_get_static_shader_source() {
            return InversionEffect.getSource();
        }

        static getSource() {
            return `
                uniform sampler2D tex;
                uniform int INVERSION_MODE;
                // Modes: 0 = Lightness
                //        1 = Lightness - white bias
                //        2 = Color

                // based on shift_whitish.glsl https://github.com/vn971/linux-color-inversion

                void main() {
                    vec4 c = texture2D(tex, cogl_tex_coord_in[0].st);
                    if (INVERSION_MODE < 2) {
                        /* INVERSION_MODE ? shifted : non-shifted */
                        float mode = float(INVERSION_MODE);
                        float white_bias = mode * c.a * 0.02;
                        float m = 1.0 + white_bias;
                        float shift = white_bias + c.a - min(c.r, min(c.g, c.b)) - max(c.r, max(c.g, c.b));
                        c = vec4(  ((shift + c.r) / m),
                                ((shift + c.g) / m),
                                ((shift + c.b) / m),
                                c.a);

                    } else if (INVERSION_MODE == 2) {
                        c = vec4(c.a * 1.0 - c.r, c.a * 1.0 - c.g, c.a * 1.0 - c.b, c.a);
                    }

                    // gamma has to be compensated to maintain perceived differences in lightness on dark and light ends of the lightness scale
                    float gamma = 1.8;
                    c.rgb = pow(c.rgb, vec3(1.0/gamma));

                    cogl_color_out = c;
                }
            `;
        }
    });

export const ColorMixerEffect = GObject.registerClass(
    class ColorMixerEffect extends Clutter.ShaderEffect {
        _init(properties) {
            super._init();
            // 0 - GRB, 1 - BRG
            this.updateEffect(properties);

            this.set_shader_source(ColorMixerEffect.getSource());
        }

        updateEffect(properties) {
            this.set_uniform_value('tex', 0);
            this.set_uniform_value('MIX_MODE', properties.mode);
            set_uniform_float(this, 'STRENGTH', properties.factor);
        }

        vfunc_get_static_shader_source() {
            return ColorMixerEffect.getSource();
        }

        static getSource() {
            return `
                uniform sampler2D tex;
                uniform int MIX_MODE;
                uniform float STRENGTH;
                void main() {
                    vec4 c = texture2D(tex, cogl_tex_coord_in[0].st);
                    vec4 m;
                    if (MIX_MODE == 0) {
                        m = vec4(c.b, c.r, c.g, c.a);
                    } else if (MIX_MODE == 1) {
                        m = vec4(c.g, c.b, c.r, c.a);
                    }
                    c = m * STRENGTH + c * (1.0 - STRENGTH);
                    cogl_color_out = c;
                }
            `;
        }
    });

export const DaltonismEffect = GObject.registerClass(
    class DaltonismEffect extends Clutter.ShaderEffect {
        _init(properties) {
            super._init();
            this.updateEffect(properties);

            this.set_shader_source(DaltonismEffect.getSource());
        }

        updateEffect(properties) {
            this.set_uniform_value('tex', 0);
            const correction = Daltonizer.getCorrection3x3(properties);
            // None of Clutter's aggregate data types can be used from GJS, so:
            for (let i = 0; i < 9; i++) {
                set_uniform_float(this, `CORRECTION${i}`, correction[i]);
            }
        }

        vfunc_get_static_shader_source() {
            return DaltonismEffect.getSource();
        }

        static getSource() {
            const declareCorr = Array(9).fill().map((_, i) => `uniform float CORRECTION${i};`).join('\n');
            const useCorr = Array(9).fill().map((_, i) => `CORRECTION${i}`).join(', ');
            return `
                ${declareCorr}
                uniform sampler2D tex;

                void main() {
                    vec4 c = texture2D(tex, cogl_tex_coord_in[0].st);
                    cogl_color_out = vec4(mat3(${useCorr}) * c.rgb, c.a);
                }
            `;
        }
    });

export const UpstreamDaltonismEffect = GObject.registerClass(
    class UpstreamDaltonismEffect extends Clutter.ShaderEffect {
        _init(properties) {
            super._init();

            this.set_shader_source(UpstreamDaltonismEffect.getSource());

            this.set_uniform_value('tex', 0);
            this.updateEffect(properties);
        }

        updateEffect(properties) {
            this._mode = properties.mode;
            this._strength = properties.factor;

            const correction = this.getCorrectionMatrix(properties);
            for (let i = 0; i < 9; i++) {
                set_uniform_float(this, `CORRECTION${i}`, correction[i]);
            }
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

        vfunc_get_static_shader_source() {
            return UpstreamDaltonismEffect.getSource();
        }

        // FIXME: share with DaltonismEffect since it's exactly the same
        static getSource() {
            const declareCorr = Array(9).fill().map((_, i) => `uniform float CORRECTION${i};`).join('\n');
            const useCorr = Array(9).fill().map((_, i) => `CORRECTION${i}`).join(', ');
            return `
                ${declareCorr}
                uniform sampler2D tex;

                void main() {
                    vec4 c = texture2D(tex, cogl_tex_coord_in[0].st);
                    cogl_color_out = vec4(mat3(${useCorr}) * c.rgb, c.a);
                }
            `;
        }
    });
