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
                    mat3 correction = mat3(${useCorr});
                    vec4 c = texture2D(tex, cogl_tex_coord_in[0].st);
                    cogl_color_out = vec4(correction * c.rgb, c.a);
                }
            `;
        }
    });
