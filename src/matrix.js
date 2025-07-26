/**
 * ColorBlind Filters
 * matrix.js
 *
 * @author     A. Pennucci <apennucci@protonmail.com>
 * @copyright  2025
 * @license    0BSD
 */

// There don't seem to be easy matrix methods within reach, so roll our own.
//
// Convention: all matrices are 3x3 and are stored in a column-major array of 9
// elements; the value at row R, column C is mat[3*C+R]. All vectors are 1x3 or
// 3x1 and stored in an array of 3 elements.

'use strict';

export function gen3(fn) {
    const result = Array(3);
    for (let i = 0; i < 3; i++) {
        result[i] = fn(i);
    }
    return result;
}

export function gen3x3(fn) {
    const result = Array(9);
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
            result[c * 3 + r] = fn(r, c);
        }
    }
    return result;
}

function gen3x3ByIdx(fn) {
    const result = Array(9);
    for (let i = 0; i < 9; i++) {
        result[i] = fn(i);
    }
    return result;
}

export function transpose(mat) {
    return gen3x3((r, c) => mat[r * 3 + c]);
}

export function fromCols(a, b, c) {
    return [...a, ...b, ...c];
}

export function fromRows(a, b, c) {
    return transpose(fromCols(a, b, c));
}

export function diagonal(vec) {
    return [vec[0], 0, 0, 0, vec[1], 0, 0, 0, vec[2]];
}

export function identity3x3() {
    return diagonal([1, 1, 1]);
}

export function zero3x3() {
    return Array(9).fill(0);
}

export function getRow3(mat, row) {
    return [mat[row], mat[row + 3], mat[row + 6]];
}

export function getCol3(mat, col) {
    const start = 3 * col;
    return mat.slice(start, start + 3);
}

export function setRow3(mat, row, vec) {
    return gen3x3((r, c) => r === row ? vec[c] : mat[c * 3 + r]);
}

export function setCol3(mat, col, vec) {
    return gen3x3((r, c) => c === col ? vec[r] : mat[c * 3 + r]);
}

export function add3(a, b) {
    return gen3(i => a[i] + b[i]);
}

export function sub3(a, b) {
    return gen3(i => a[i] - b[i]);
}

export function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function scale3(s, vec) {
    return vec.map(x => x * s);
}

export function magnitude3(vec) {
    return Math.sqrt(dot3(vec, vec));
}

export function multiplyMatrixVec(mat, col_vec) {
    return gen3(i => dot3(getRow3(mat, i), col_vec));
}

export function cross3(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

export function add3x3(a, b) {
    return gen3x3ByIdx(i => a[i] + b[i]);
}

export function sub3x3(a, b) {
    return gen3x3ByIdx(i => a[i] - b[i]);
}

export function mult3x3(a, b) {
    return gen3x3((r, c) => dot3(getRow3(a, r), getCol3(b, c)));
}

export function scale3x3(s, mat) {
    return mat.map(x => x * s);
}

// *Sigh* I didn't want to have write any non-trivial matrix functions.
export function inverse3x3(mat) {
    const work = Array.from(mat);
    const ret = identity3x3();
    const idx = (r, c) => c * 3 + r;

    for (let col = 0; col < 3; col++) {
        // Pick the row with the greatest pivot
        let max_row = col;
        for (let row = col + 1; row < 3; row++) {
            if (Math.abs(work[idx(row, col)]) > Math.abs(work[idx(max_row, col)])) {
                max_row = row;
            }
        }
        if (work[idx(max_row, col)] === 0) {
            return null;
        }

        // scale the rest of the row in the work matrix as if the pivot had been
        // scaled to 1; scale the whole return matrix row
        const pivot_scale = 1 / work[idx(max_row, col)];
        for (let c = col + 1; c < 3; c++)
            work[idx(max_row, c)] *= pivot_scale;

        for (let c = 0; c < 3; c++)
            ret[idx(max_row, c)] *= pivot_scale;


        // Swap the rest of the row in the work matrix into place; swap the
        // whole return matrix row
        //
        // NB: can't skip swapping the current column, it's used for elimination
        // below
        for (let c = col; c < 3; c++) {
            const wtmp = work[idx(max_row, c)];
            work[idx(max_row, c)] = work[idx(col, c)];
            work[idx(col, c)] = wtmp;
        }
        for (let c = 0; c < 3; c++) {
            const rtmp = ret[idx(max_row, c)];
            ret[idx(max_row, c)] = ret[idx(col, c)];
            ret[idx(col, c)] = rtmp;
        }

        // Subtract from the other rows
        for (let r = 0; r < 3; r++) {
            if (r === col)
                continue;
            const elim_scale = work[idx(r, col)];
            // As usual: only update the work columns to the right, but update
            // all return matrix columns
            for (let c = col + 1; c < 3; c++)
                work[idx(r, c)] -= elim_scale * work[idx(col, c)];

            for (let c = 0; c < 3; c++)
                ret[idx(r, c)] -= elim_scale * ret[idx(col, c)];
        }
    }

    return ret;
}
