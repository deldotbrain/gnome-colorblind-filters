/**
 * ColorBlind Filters
 * shaders.js
 *
 * @author     GdH <G-dH@github.com>, A. Pennucci <apennucci@protonmail.com>
 * @copyright  2022-2025
 * @license    GPL-3.0
 */

'use strict';

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import { ColorblindFilter } from './shader_base.js';

export class GenericFilter extends ColorblindFilter {
    static {
        GObject.registerClass(this);
    }

    _init(colorspace) {
        super._init(colorspace, { correction: 'mat3' }, 'rgb = correction * rgb;');
    }

    updateEffect(properties) {
        this.set_uniform('correction', properties.getCorrectionMatrix(properties));
    }
}

export class GenericLinearFilter extends GenericFilter {
    static {
        GObject.registerClass(this);
    }

    _init() { super._init('linear'); }
}

export class GenericSRGBFilter extends GenericFilter {
    static {
        GObject.registerClass(this);
    }

    _init() { super._init('srgb'); }
}

export class DesaturateEffect extends Clutter.DesaturateEffect {
    static {
        GObject.registerClass(this);
    }

    updateEffect(properties) {
        this.factor = properties.factor;
    }
}

export class InversionEffect extends ColorblindFilter {
    static {
        GObject.registerClass(this);
    }

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
}

export class ColorMixerEffect extends ColorblindFilter {
    static {
        GObject.registerClass(this);
    }

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
}
