# Colorblind Filters Advanced
A GNOME Shell extension that adds a Quick Settings menu for full-screen color
filters that should help colorblind users and developers.

This extension was forked from [the original on
GitHub](https://github.com/G-dH/gnome-colorblind-filters). This extension has
more filter options and a different user interface.

Originally, this extension used the same algorithm as Android devices to
simulate and correct color blindness, but I've continued to experiment with
changes to the algorithm and entirely new filters. I'm happy with the gradual
improvements I've made, but I've also kept the older filters in the extension
to prove to myself that my changes have been an improvement.

## Screenshot

![Colorblind Filters Advanced menu](colorblind-filters-advanced.png)

## Installation from Source

Should support GNOME Shell 45 - 48, but I don't test against older versions.

To build from source, you'll need `make`, `gettext`, `jq`, and `xmlstarlet`.
Depending on your distro, you might also need a development package for `glib`.

Once you have the dependencies installed, fetch the source and run `make
install`:

    git clone https://codeberg.org/amyp/gnome-colorblind-filters.git
    cd gnome-colorblind-filters
    make install

Then, either reload GNOME Shell (X11 only; press Alt+F2 and enter "r") or log
out and back in (X11 and Wayland) to load the extension. Enable it in the
Extensions app.

## Quick Start

Once enabled, a new button will appear in the Quick Settings menu. Clicking
it toggles the currently-selected filter, and opening it reveals configuration
options.

For correcting color blindness, the defaults should be pretty reasonable, just
pick your color blindness type from the menu, turn the filter on, and adjust
the strength slider until things look okay. If nothing looks good, or if you
just like to tinker, try changing the algorithm (see below).

## Other Setup Instructions

### Filtering Fullscreen Applications

These filters are used by GNOME's compositor, but it typically doesn't run for
fullscreen applications (games, movies, etc.) for performance reasons. To make
these filters work in fullscreen windows, you need one of the following
extensions:

- https://extensions.gnome.org/extension/1873/disable-unredirect-fullscreen-windows/
  (at time of writing, this extension doesn't support GNOME 48)
- https://extensions.gnome.org/extension/8008/disable-unredirect/ (at time of
  writing, only GNOME 48 is supported)

### Configuring Hotkeys

This extension doesn't directly support adding hotkeys, but it's still possible
to set them up.

This extension responds immediately to dconf settings changes. Its settings can
be found in `/org/gnome/shell/extensions/colorblind-filters-advanced`. You can
set a custom shortcut in GNOME's keyboard settings to run `dconf` to modify
those settings. For example, I have Super+F7 and Super+F8 set to turn the
filter off and on by running

    dconf write /org/gnome/shell/extensions/colorblind-filters-advanced/filter-active false

and

    dconf write /org/gnome/shell/extensions/colorblind-filters-advanced/filter-active true

## Filter Algorithm Descriptions

This extension includes many simulation and correction algorithms. They range
in quality and complexity, and of course, each user will have their own
preference for which algorithm works "best".

As general guidelines:

- "Opponent Color Solver" is preferred by the developer for correcting their
  moderate tritanomaly. This algorithm is being developed as part of this
  extension, so any feedback you can provide is helpful!
- "Error Steering" (only for correction) works well for fixing visibility
  problems for tritanomaly, but hasn't been tuned or validated for other color
  blindness types. Check out [this
  issue](https://github.com/deldotbrain/gnome-colorblind-filters/issues/2) if
  you'd like to help fix that!
- "GdH's Filters" are the filters that the original extension provides. Many
  people like them.
- "Daltonize" is more or less the same algorithm used by most other
  simulation/correction filters.
- "Android" is the slightly funky version of "Daltonize" used by Android. [The
  developer thinks the funkiness is a bug in Android, and originally started
  this project to prove
  it.](https://github.com/deldotbrain/gnome-colorblind-filters/issues/1)

### "Opponent Color Solver" Filters

This filter is radically different from anything else in this extension, and
from any other filter I've seen in the wild. Whether that's a good thing or not
remains to be seen.

This filter operates in [opponent color
space](https://foundationsofvision.stanford.edu/chapter-9-color/#Opponent-Colors)
and is built on the work of [Machado et
al.](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)
to simulate color blindness. While their proposed simulation isn't considered
to be as accurate as others, its use of opponent color makes a very different
correction approach possible.

The correction filter searches RGB space for a color which the colorblind
observer is expected to perceive as the original color was intended. To do
this, it defines a cost function based on the squares of the color's distance
from the intended color in simulated opponent-color space and from the original
color in RGB space. The filter searches near the original color using a couple
iterations of gradient descent to find an RGB value with minimal cost.

Treating correction as an optimization problem prevents the resulting color
from going too far outside of the RGB gamut and from distorting the image too
much for non-colorblind observers. That encourages the filter to make changes
that it wouldn't otherwise: when correcting for tritanomaly, it lightens blues
to make them more visible; when correcting for prot/deuteranomaly, it adds some
blue to reds to help distinguish them, etc.

This approach is necessarily much more expensive than other filters (probably
by a factor of 20-30, though it still doesn't add up to much actual
utilization), but yields results that (at least to my tritanomalous eyes) look
more natural. While there are probably some optimizations that could be made to
the filter algorithm, this filter will always be more complex to execute than
daltonization, and daltonization (and linear filters more generally)
fundamentally cannot make the same modifications that this filter does. Is it
worth it? You decide.

The simulation filter applies a trivial linear transformation (inverse of ideal
RGB-to-opponent transform multiplied by simulated RGB-to-opponent transform).
It doesn't need to do any fancy cost function optimization because color
blindness only ever reduces the gamut, so the result of a linear transformation
will always be within the RGB gamut. This filter isn't (currently) terribly
accurate, but it provides valuable insight into how the OCS filter understands
color blindness and what it's actually trying to correct for. Note that
although the approach used by this filter is similar to the work of Machado et
al., it is **not** the same simulation and shouldn't be taken as a
representation of their work!

This filter is still very much under development. I think the correction
filter already looks better than other filters, but there are still many
improvements I'd like to make. If you've actually tried it, I want to know how
it works for you! Open an issue to discuss, send me an email (the address on my
commits works), or whatever.

### "GdH's Filters"

These are the daltonization filters used by the original Colorblind Filters
extension. They use a lot of magic numbers whose provenance isn't clear to me,
so I can't comment on how they really work, except to say that they're
superficially similar to other daltonization algorithms. GdH says he focused on
color differentiability when designing them.

These filters also have an option for "high contrast" mode for protanopia and
deuteranopia, similar to the original extension.

### "Daltonize"

Daltonization filters like this work by finding a plane in [LMS
space](https://en.wikipedia.org/wiki/LMS_color_space) that includes both the
black-to-white and black-to-(some unaffected color) vectors, then projecting
the LMS value of a color down onto it to simulate the loss of sensitivity to
the affected color. If correcting for color blindness, the stimulus that was
lost in the process is spread over the unaffected cones.

### "Error Steering"

To the best of my knowledge, this filter uses a novel change to the typical
daltonization filter that makes it more useful for correction. Instead of
spreading the lost stimulus to the other cones, a specific color is added to
the image in proportion to the amount of error that color blindness would
cause.

For example, I (tritanomalous) find that adding white to replace the blue light
that I didn't see is very helpful for making blue more visible in the ways it's
commonly used in computer UIs. Conversely, this filter also subtracts white
from yellow, making it easier for me to distinguish from white.

### "Android"

This is the daltonization filter used in Android. It uses a poorly-selected
transform into LMS color space that causes it to look worse than other filters.
Otherwise, it is similar to other
[daltonization](http://www.daltonize.org/2010/05/lms-daltonization-algorithm.html)
filters.

### Side-note: "Modified" Transform for Tritanopia

When dealing with tritanopia, daltonization filters typically ignore the fact
that both red and green are unaffected by tritanopia and are perceived more or
less independently from blue. Typically, they arbitrarily choose to hold red
constant when simulating, changing the appearance of greens considerably.

The "Modified" transform holds the difference between red and green constant,
balancing the change in their appearance between them. To my eyes, this looks
less weird, but I don't have any evidence to say that it's more accurate.

## Contribution
Consider contributing to the [original
extension](https://github.com/G-dH/gnome-colorblind-filters) instead of this
fork. The original has many more users, so your contribution will can help more
people. Of course, if you'd prefer to work on this extension, I would welcome
your contributions! Please open issues and PRs [on
GitHub](https://github.com/deldotbrain/gnome-colorblind-filters).

I don't need or want donations for my work. If you find it valuable, please
consider donating to an organization that provides direct support to my queer
siblings. [Pride Center of Vermont](https://www.pridecentervt.org/), [Trevor
Project](https://www.thetrevorproject.org/), and [Rainbow
Railroad](https://www.rainbowrailroad.org/) always need support. Alternatively,
feel free to [buy the author of the original extension a
coffee](https://buymeacoffee.com/georgdh). His extension inspired me to start
thinking about filters like these and gave me a great starting point to
experiment.
