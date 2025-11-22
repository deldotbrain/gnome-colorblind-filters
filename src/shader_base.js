/**
 * ColorBlind Filters
 * shader_base.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */

'use strict';

import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';

// Clutter.ShaderMatrix exists, but it's an error to use it. Instead, we hack
// aggregates together using one uniform per element.
export class UniformDim {
    constructor(type, size) {
        this.type = type;
        this.size = size;
    }

    declare(name) {
        if (this.size === 1) {
            return `uniform ${this.type} ${name};`;
        } else {
            return Array(this.size).fill().map(
                (_, i) => `uniform float ${name}${i};`).join('\n');
        }
    }

    define(name) {
        if (this.size === 1) {
            // Scalars don't need to be redefined
            return '';
        } else {
            const elems = Array(this.size).fill().map((_, i) => `${name}${i}`).join(', ');
            return `${this.type} ${name} = ${this.type}(${elems});`;
        }
    }

    update(effect, name, value) {
        // GJS really likes to coerce whole numbers to GValue ints, so we need
        // to be explicit about our intended GValue type. Otherwise, e.g.
        // setting a float uniform to a whole number will silently fail.
        const cast = (type, val) => {
            const gv = new GObject.Value();
            gv.init(GObject[`TYPE_${type.toUpperCase()}`]);
            gv[`set_${type}`](val);
            return gv;
        };

        if (this.size === 1) {
            effect.set_uniform_value(name, cast(this.type, value));
        } else if (this.size === value.length) {
            for (const i in value) {
                effect.set_uniform_value(`${name}${i}`, cast('float', value[i]));
            }
        } else {
            console.warn('incorrect dimension for uniform ' +
                `${name}: ${value.length} != ${this.size}`);
        }
    }
}

const uniform_types = Object.fromEntries([
    ['int', 1],
    ['float', 1],
    ['vec3', 3],
    ['vec4', 4],
    ['mat3', 9],
].map(([t, s]) => [t, new UniformDim(t, s)]));

export class ColorblindFilter extends Clutter.ShaderEffect {
    static {
        GObject.registerClass(this);
    }

    // colorspace: 'linear' or 'srgb'
    // uniforms: object containing type names
    // snippet: fragment of glsl operating on `vec3 rgb`
    _init(colorspace, uniforms, snippet) {
        super._init();

        this.uniforms = Object.fromEntries(Object.entries(uniforms).map(
            ([name, type]) => type instanceof UniformDim
                ? [name, type]
                : [name, uniform_types[type]]));

        this.source = this.make_shader_source(snippet, colorspace);
        this.set_shader_source(this.source);
        this.set_uniform_value('tex', 0);
    }

    set_uniform(name, value) {
        this.uniforms[name].update(this, name, value);
    }

    set_uniforms(values) {
        Object.entries(values)
            .forEach(([name, value]) => this.set_uniform(name, value));
    }

    vfunc_get_static_shader_source() {
        return this.source;
    }

    // TODO: Have Clutter handle colorspace transformations for us. That
    // appears to require reimplementing large parts of Clutter.ShaderEffect
    // to add the required cogl snippets to the pipeline (and to have access
    // to the pipeline's color state to begin with).
    make_shader_source(snippet, colorspace) {
        const want_linear = { linear: true, srgb: false }[colorspace];
        if (want_linear === undefined) {
            console.warn(`unknown colorspace ${colorspace}, assuming srgb`);
        }

        // Highly scientific colorspace conversion: assume sRGB input and
        // output and use the x^2.2 approximation for gamma.
        const get_rgb = want_linear ? 'pow(_c.rgb, vec3(2.2))' : '_c.rgb';
        const set_rgb = want_linear ? 'pow(rgb, vec3(1/2.2))' : 'rgb';

        const declare_uniforms = Object.entries(this.uniforms)
            .map(([n, u]) => u.declare(n))
            .join('\n');
        const define_uniforms = Object.entries(this.uniforms)
            .map(([n, u]) => u.define(n))
            .filter(s => s !== '')
            .join('\n');

        return `
            uniform sampler2D tex;
            ${declare_uniforms}

            void main() {
            ${define_uniforms}

            vec4 _c = texture2D(tex, cogl_tex_coord_in[0].st);
            vec3 rgb = ${get_rgb};

            ${snippet}

            cogl_color_out = vec4(${set_rgb}, _c.a);
            }
            `;
    }
}
