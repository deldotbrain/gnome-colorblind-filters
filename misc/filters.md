# Detailed Filter Algorithm Descriptions

## "Opponent Color Solver" Filters

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
have stimulated a trichromat's brain. Searching this way can yield surprising
results: when correcting for tritanomaly, it lightens bright blues to make them
more visible instead of just cranking up the blue value; when correcting for
prot/deuteranomaly, it adds some blue to reds to help distinguish them; etc.

Searching for a color this way does require more resources than the simple
linear transformations that other filters use (probably by a factor of 20-30),
though it still doesn't add up to much actual utilization. At least to the
developer's eyes, the results are well worth the extra computation. Besides,
GPUs are awfully fast.

The simulation filter applies a trivial linear transformation (using the
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
this looks less weird at low strength settings, but there is no evidence to say
that it's more accurate. At higher strength settings, it distorts skin tones
(and everything else) in more noticeable ways.

