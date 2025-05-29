# Colorblind Filters
A GNOME Shell extension for main panel that offers full-screen color filters
that should help color blind users and developers.

This version was forked from [the original on
GitHub](https://github.com/G-dH/gnome-colorblind-filters) to replace its
daltonization algorithm with the one used by Android devices, which I find more
helpful. Since then, I've also used it to experiment with a number of
improvements to the Android algorithm, and I'm very happy with the results.
I've kept older, worse filters in the extension to prove to myself that my
changes have been an improvement.

At this point, this extension has entirely too many filter options to choose
from (21 at the time of writing!). For correcting or simulating protanopia,
deuteranopia, or tritanopia, the "HPE" filter options are a good starting
point.

Personally, I prefer the "Modified Tritanopia Correction (TPE)" filter for
correcting my tritanomaly. I suspect that its simulation counterpart is more
accurate than the unmodified filter for simulating tritanomaly (but not
necessarily for tritanopia!).

Supports GNOME Shell 45 - 48, but I don't test against older versions.

## Screenshot
![Colorblind Filters menu](colorblind-filters.png)

## Installation

    git clone https://codeberg.org/amyp/gnome-colorblind-filters.git
    cd gnome-colorblind-filters
    make install

## Contribution
Unless your contribution is specific to the filter algorithm, please consider
making your contribution to the original extension [on
GitHub](https://github.com/G-dH/gnome-colorblind-filters) so that its users can
benefit from it. Of course, I'll accept contributions here, as well.

Also, feel free to [buy the original author a
coffee](https://buymeacoffee.com/georgdh) if you find this extension useful. He
did most of the work.
