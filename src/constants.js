/**
 * ColorBlind Filters
 * constants.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    0BSD
 */
'use strict';

// NB: all matrices are column-major!

// sRGB to XYZ from https://en.wikipedia.org/wiki/SRGB#Primaries:
export const srgb2xyz = [
    0.4124,
    0.2126,
    0.0193,
    0.3576,
    0.7152,
    0.1192,
    0.1805,
    0.0722,
    0.9505,
];

// CIECAM02 transformation (https://en.wikipedia.org/wiki/LMS_color_space#Later_CIECAMs):
//
// Used by AOSP's filters. It converts to spectrally-sharpened LMS that doesn't
// reflect actual cone sensitivity, yet the AOSP algorithm relies on it to infer
// the sensitivity of the unaffected cones. This is why AOSP's filters don't
// look right.
export const ciecam02 = [
    0.7328,
    -0.7036,
    0.003,
    0.4296,
    1.6975,
    0.0136,
    -0.1624,
    0.0061,
    0.9834,
];

// From http://brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
//
// Effectively the same as the matrix given by Wikipedia, but with the advantage
// that this matrix is given with an explicitly stated illuminant: D65.
export const srgb_to_d65_xyz = [
    0.4124564,
    0.2126729,
    0.0193339,
    0.3575761,
    0.7151522,
    0.1191920,
    0.1804375,
    0.0721750,
    0.9503041,
];

// Hunt-Pointer-Estevez transformation (https://en.wikipedia.org/wiki/LMS_color_space#Hunt,_RLAB):
//
// This version of the matrix is normalized to D65.
export const hpe_d65_xyz_to_lms = [
    0.4002,
    -0.2263,
    0.0000,
    0.7076,
    1.1653,
    0.0000,
    -0.0808,
    0.0457,
    0.9182,
];
