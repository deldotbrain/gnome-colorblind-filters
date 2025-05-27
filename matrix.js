/**
 * ColorBlind Filters
 * matrix.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    GPL-3.0
 */

// There don't seem to be easy matrix methods within reach, so roll our own. I
// don't feel like writing the whole algorithm to find inverse matrices, so some
// things that AOSP calculated at runtime are now hardcoded. See
// lms_matrices.py for where the magic numbers come from.
//
// Convention: all matrices are 3x3 and are stored in a column-major array of 9
// elements; the value at row R, column C is mat[3*C+R]. All vectors are 1x3 or
// 3x1 and stored in an array of 3 elements.

'use strict';

export function identity3x3() {
    return [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
}

export function getRow3(mat, row) {
    return [mat[row], mat[row + 3], mat[row + 6]];
}

export function getCol3(mat, col) {
    const start = 3 * col;
    return mat.slice(start, start + 3);
}

export function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function multiplyMatrixVec(mat, vec) {
    return Array(3).fill().map((_, i) => dot3(getRow3(mat, i), vec));
}

export function cross3(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0]
    ];
}

export function add3x3(a, b) {
    let result = Array(9);
    for (let i = 0; i < 9; i++) {
        result[i] = a[i] + b[i];
    }
    return result;
}

export function sub3x3(a, b) {
    let result = Array(9);
    for (let i = 0; i < 9; i++) {
        result[i] = a[i] - b[i];
    }
    return result;
}

export function mult3x3(a, b) {
    let result = Array(9);

    for (let c = 0; c < 3; c++) {
        for (let r = 0; r < 3; r++) {
            result[c * 3 + r] = dot3(getRow3(a, r), getCol3(b, c));
        }
    }

    return result;
}

