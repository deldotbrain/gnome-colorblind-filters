# Colorblind Filters Advanced
A GNOME Shell extension that adds a Quick Settings menu for full-screen color
filters that should help colorblind users and developers.

The primary purpose of this extension is to help colorblind users see more
accurately and use their computers more easily. Many filters are provided to
correct color blindness, and the developer believes that their "Opponent Color
Solver" filter is a significant improvement over the state of the art. Other
filters are also provided, such as those from GdH's Colorblind Filters
extension and from Android phones.

Filters to simulate color blindness are provided to help developers understand
how colorblind users see. However, these aren't the focus of this extension, so
options are limited. The most accurate simulation algorithms don't have a
corresponding correction algorithm, so they haven't been added to the extension
yet. If there's a need for those filters, they could be added upon request.

A few effects from the original extension that aren't related to color
blindnesss are included as well.

This extension was forked from [the original on
GitHub](https://github.com/G-dH/gnome-colorblind-filters). This extension has
more filter options and a different user interface.

## Screenshot

![Colorblind Filters Advanced menu](colorblind-filters-advanced.png)

## Installation from Source

Should support GNOME Shell 45 - 48, but older versions are not tested.

To build from source, you'll need `git`, GNU `make` and `zip`. Depending on
your distro, you might also need a development package for `glib`. `gettext` is
optional to build translations (but the extension hasn't been translated yet).

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
those settings. For example, the commands to turn the filters off and on are:

    dconf write /org/gnome/shell/extensions/colorblind-filters-advanced/filter-active false

and

    dconf write /org/gnome/shell/extensions/colorblind-filters-advanced/filter-active true

## Filter Algorithm Descriptions

This extension includes many simulation and correction algorithms. They range
in quality and complexity, and of course, each user will have their own
preference for which algorithm works "best".

As general guidelines:

- "Opponent Color Solver" is the default and is thought by the developer to be
  more effective and natural-looking than other algorithms. This algorithm is
  being developed as part of this extension, so any feedback you can provide is
  helpful!
- "Error Steering" (only for correction) works well for aggressively fixing
  visibility problems, including for severe color blindness. However, it hasn't
  been tuned for color blindness types other than tritanomaly. Check out [this
  issue](https://github.com/deldotbrain/gnome-colorblind-filters/issues/2) if
  you'd like to help tune it.
- "GdH's Filters" are the filters that the original Colorblind Filters
  extension provides. Many people like them.
- "Daltonize" is more or less the same algorithm used by most other
  simulation/correction filters.
- "Android" is the slightly funky version of "Daltonize" used by Android.

### "Opponent Color Solver" Filters

This filter is radically different from anything else in this extension, and
from any other filter the developer has seen in the wild. It operates in
[opponent color
space](https://foundationsofvision.stanford.edu/chapter-9-color/#Opponent-Colors)
and is built on the work of [Machado et
al.](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)
to simulate color blindness. While their proposed simulation isn't considered
to be as accurate as others, its use of opponent color makes a very different
approach to correction possible.

Typically, color blindness correction filters describe a way of converting a
color into a different color in the hope that it will look "better", for some
definition of "better". Instead, this filter searches for a color that will
stimulate a colorblind viewer's brain the same way the original color would
have stimulated a trichromat's brain, but also tries not to change the RGB
values of the color by too much. Making the filter dynamically balance those
goals causes it to make changes it wouldn't otherwise: when correcting for
tritanomaly, it lightens bright blues to make them more visible instead of just
cranking up the blue value; when correcting for prot/deuteranomaly, it adds
some blue to reds to help distinguish them; etc.

Searching for a color this way does require more resources than the simple
linear transformations that other filters use (probably by a factor of 20-30),
though it still doesn't add up to much actual utilization. At least to the
developer's eyes, the results are well worth the extra computation. Besides,
GPUs are awfully fast.

The simulation filter applies a trivial linear transformation (uses the
colorblind conversion from RGB to opponent color, then the non-colorblind
conversion back to RGB). The simulation's accuracy hasn't been validated, but
it provides valuable insight into how the correction filter understands color
blindness and what it's actually trying to correct for. Note that although the
approach used by this filter is similar to the work of Machado et al., it is
**not** the same simulation and shouldn't be taken as a representation of their
work!

This filter is still very much under development. The developer thinks the
correction filter already looks better than other filters, but there is still
room for improvement, especially to the maximum strength of the filter. If
you've actually tried it, the developer wants to know how it works for you!
Open an issue to discuss, send them an email (the address on their commits
works), or whatever.

### "GdH's Filters"

These are the daltonization filters used by the original Colorblind Filters
extension. They use a lot of magic numbers whose provenance isn't clear, so it
is difficult to say how they really work, except to say that they're
superficially similar to other daltonization algorithms. GdH says he focused on
color differentiability when designing them.

These filters also have an option for "high contrast" mode for protanopia and
deuteranopia, similar to the original extension.

### "Daltonize"

[Daltonization
filters](http://www.daltonize.org/2010/05/lms-daltonization-algorithm.html)
like this work by finding a plane in [LMS
space](https://en.wikipedia.org/wiki/LMS_color_space) that includes both the
black-to-white and black-to-(some unaffected color) vectors, then projecting
the LMS value of a color down onto it to simulate the loss of sensitivity to
the affected color. If correcting for color blindness, the stimulus that was
lost in the process is spread over the unaffected cones.

If that description sounds too sterile and mathematical to describe a
biological and physical process, that's because it is. These filters are known
for efficiently producing acceptable results, not for their accuracy. That
said, their simplicity is a very valuable property.

### "Error Steering"

To the best of the developer's knowledge, this filter uses a novel change to
the typical daltonization filter that makes it more useful for correction.
Instead of spreading the lost stimulus to the other cones, a specific color is
added to the image in proportion to the amount of error that color blindness
would cause.

For example, the developer (tritanomalous) finds that adding white to replace
the blue light that they didn't see is very helpful for making blue more
visible in the ways it's commonly used in computer UIs. Conversely, this filter
also subtracts white from yellow, making it easier to distinguish yellow from
white.

[This approach should also be helpful for other types of color blindness, but
feedback is needed to figure out how to tune the filter to be most
effective.](https://github.com/deldotbrain/gnome-colorblind-filters/issues/2)

### "Android"

This is the daltonization filter used in Android. It uses a poorly-selected
transform into LMS color space that causes it to look worse than other filters.
Otherwise, it is similar to other daltonization filters.

[The developer thinks the worse appearance is a bug in Android, and originally
started this project to prove
it.](https://github.com/deldotbrain/gnome-colorblind-filters/issues/1)

### Side-note: "Modified" Transform for Tritanopia

When dealing with tritanopia, daltonization filters typically ignore the fact
that both red and green are unaffected by tritanopia and are perceived more or
less independently from blue. Typically, they arbitrarily choose to hold red
constant when simulating, changing the appearance of greens considerably.

The "Modified" transform holds the difference between red and green constant,
balancing the change in their appearance between them. To the developer's eyes,
this looks less weird, but there is no evidence to say that it's more accurate.
(Accuracy was never really a consideration for daltonization algorithms to
begin with.)

## Contribution
Consider contributing to the [original
extension](https://github.com/G-dH/gnome-colorblind-filters) instead of this
fork. The original has many more users, so your contribution can help more
people. Of course, if you'd prefer to work on this extension, your
contributions are welcome! Please open issues and PRs [on
GitHub](https://github.com/deldotbrain/gnome-colorblind-filters). PRs [on
Codeberg](https://codeberg.org/amyp/gnome-colorblind-filters) are also
accepted.

## Donations
The developer doesn't need or want donations for their work. If you find it
valuable, please consider donating to an organization that provides direct
support to their queer siblings. For example, [Pride Center of
Vermont](https://www.pridecentervt.org/), [Trevor
Project](https://www.thetrevorproject.org/), and [Rainbow
Railroad](https://www.rainbowrailroad.org/) always need support. Alternatively,
feel free to [buy the author of the original extension a
coffee](https://buymeacoffee.com/georgdh). His extension inspired the developer
to start thinking about filters like these and provided a great starting point
to experiment.

## License
This code is distributed under the terms of the GNU General Public License
version 3.0. The files related to the Opponent Color Solver filters may also be
used under the terms of the Zero-Clause BSD License.
