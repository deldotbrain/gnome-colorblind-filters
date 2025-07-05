/**
 * ColorBlind Filters
 * effects.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */

import * as Shaders from './shaders.js';

function getOtherEffects(_) {
    return [
        {
            description: _('Channel Mixer - GBR'),
            name: 'ColorMixerGBR',
            shortName: 'GBR',
            properties: {
                mode: 0,
                factor: 1,
            },
            shader: Shaders.ColorMixerEffect,
        },
        {
            description: _('Channel Mixer - BRG'),
            name: 'ColorMixerBRG',
            shortName: 'BRG',
            properties: {
                mode: 1,
                factor: 1,
            },
            shader: Shaders.ColorMixerEffect,
        },
        {
            description: _('Desaturation'),
            name: 'Desaturation',
            shortName: 'D',
            properties: {
                factor: 1,
            },
            shader: Shaders.DesaturateEffect,
        },
        {
            description: _('Lightness Inversion'),
            name: 'LightnessInversion',
            shortName: 'LI',
            properties: {
                mode: 0,
            },
            shader: Shaders.InversionEffect,
        },
        {
            description: _('Color Inversion'),
            name: 'ColorInversion',
            shortName: 'CI',
            properties: {
                mode: 2,
            },
            shader: Shaders.InversionEffect,
        },
    ];
}

function getSimulationEffects(_) {
    return [
        {
            description: _('Protanopia Simulation'),
            name: 'ProtanSim',
            shortName: 'PS',
            properties: {
                errorSteering: null,
                whichCone: 0,
                isCorrection: false,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Deuteranopia Simulation'),
            name: 'DeuteranSim',
            shortName: 'DS',
            properties: {
                errorSteering: null,
                whichCone: 1,
                isCorrection: false,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Tritanopia Simulation'),
            name: 'TritanSim',
            shortName: 'TS',
            properties: {
                errorSteering: null,
                whichCone: 2,
                isCorrection: false,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
    ];
}

function getCorrectionEffects() {
    return [
        {
            description: _('Protanopia Correction') + ' (+W)',
            name: 'ProtanCorrW',
            shortName: 'PCW',
            properties: {
                errorSteering: [1, 1, 1],
                whichCone: 0,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Protanopia Correction') + ' (+R)',
            name: 'ProtanCorr-R',
            shortName: 'PCR',
            properties: {
                errorSteering: [1, 0, 0],
                whichCone: 0,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Protanopia Correction') + ' (+R-g)',
            name: 'ProtanCorr-Rg',
            shortName: 'PCRg',
            properties: {
                errorSteering: [1, -0.5, 0],
                whichCone: 0,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Protanopia Correction') + ' (+R-g+b)',
            name: 'ProtanCorr-RgB',
            shortName: 'PCRgB',
            properties: {
                errorSteering: [1, -0.5, 0.5],
                whichCone: 0,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Protanopia Correction') + ' (+r-g+B)',
            name: 'ProtanCorr-RgBB',
            shortName: 'PCRgBB',
            properties: {
                errorSteering: [0.5, -0.5, 1],
                whichCone: 0,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Deuteranopia Correction') + ' (+W)',
            name: 'DeuteranCorr-W',
            shortName: 'DCW',
            properties: {
                errorSteering: [1, 1, 1],
                whichCone: 1,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Deuteranopia Correction') + ' (+G)',
            name: 'DeuteranCorr-G',
            shortName: 'DCG',
            properties: {
                errorSteering: [0, 1, 0],
                whichCone: 1,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Deuteranopia Correction') + ' (-r+G)',
            name: 'DeuteranCorr-rG',
            shortName: 'DCrG',
            properties: {
                errorSteering: [-0.5, 1, 0],
                whichCone: 1,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            // Having read about the opponent color model a little bit, I don't
            // think this will be helpful; probably -B would be?
            description: _('Deuteranopia Correction') + ' (-r+G+b)',
            name: 'DeuteranCorr-rGB',
            shortName: 'DCrGB',
            properties: {
                errorSteering: [-0.5, 1, 0.5],
                whichCone: 1,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Deuteranopia Correction') + ' (-r+g+B)',
            name: 'DeuteranCorr-rGBB',
            shortName: 'DCrGBB',
            properties: {
                errorSteering: [-0.5, 0.5, 1.0],
                whichCone: 1,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Deuteranopia Correction') + ' (-r+G-b)',
            name: 'DeuteranCorr-rGb',
            shortName: 'DCrGb',
            properties: {
                errorSteering: [-0.5, 1, -0.5],
                whichCone: 1,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Deuteranopia Correction') + ' (-r+g-B)',
            name: 'DeuteranCorr-rGbb',
            shortName: 'DCrGbb',
            properties: {
                errorSteering: [-0.5, 0.5, -1],
                whichCone: 1,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Tritanopia Correction') + ' (+W)',
            name: 'TritanCorr-W',
            shortName: 'TCW',
            properties: {
                errorSteering: [1, 1, 1],
                whichCone: 2,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
        {
            description: _('Tritanopia Correction') + ' (+B)',
            name: 'TritanCorr-B',
            shortName: 'TCB',
            properties: {
                errorSteering: [0, 0, 1],
                whichCone: 2,
                isCorrection: true,
                factor: 1,
            },
            shader: Shaders.DaltonismEffect,
        },
    ];
}

let allEffects = null;

export function getEffectGroups(_) {
    if (allEffects === null) {
        allEffects = {
            corrections: getCorrectionEffects(_),
            simulations: getSimulationEffects(_),
            others: getOtherEffects(_),
        };
    }

    return allEffects;
}

export function getEffectByName(_, name) {
    for (const [_, effects] of Object.entries(getEffectGroups(_))) {
        for (const e of effects) {
            if (e.name == name) {
                return e;
            }
        }
    }
}

const shader_cache = new Map();

export function makeShader(effect) {
    const shaderClass = effect.shader;

    const cached = shader_cache.get(shaderClass);
    if (cached) {
        cached.updateEffect(effect.properties);
        return cached;
    } else {
        const shader = new shaderClass(effect.properties);
        shader_cache.set(shaderClass, shader);
        return shader;
    }
}
