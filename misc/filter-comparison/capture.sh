#!/bin/sh -x

SUFFIX="${1:+-$1}"

opt() {
	dconf write /org/gnome/shell/extensions/colorblind-filters-advanced"$SUFFIX"/"$1" "$2"
}

snap() {
	gnome-screenshot --file="$PWD/$1"
}

# Open in fullscreen. A screenshot of just a borderless window would be ideal
# (no need to crop later), but GNOME's screenshot API doesn't capture the
# filter's effect when capturing individual windows.
#
# The photo is by Pixabay and licensed CC0; source:
# https://www.pexels.com/photo/assorted-color-pencil-set-459799/
feh --fullscreen --zoom 30 "$(dirname "$0")"/pexels-photo-459799.jpeg &
feh=$!

# No idea how long it takes for feh to appear
sleep 0.5

old_settings="$(dconf dump /org/gnome/shell/extensions/colorblind-filters-advanced"$SUFFIX"/)"

opt filter-active false
sleep 0.1
snap "orig.png"

opt filter-active true

for t in protanopia deuteranopia tritanopia; do
	for f in ocs gdh hpe; do
		if [ "$f" = "hpe" ]; then s=0.35; else s=0.5; fi
		if [ "$f" = "gdh" ] && [ "$t" != "tritanopia" ]; then suff="-normal"; else suff=; fi
		if [ "$f" = "hpe" ] && [ "$t" = "tritanopia" ]; then suff="-typical"; fi

		opt filter-strength "$s"
		opt filter-name "\"correction-$f-$t$suff\""
		sleep 0.1 # wait a polite amount of time for the screen to update

		snap "$f-$t.png"
		sleep 0.1 # wait a polite amount of time for the screen capture. is it even asynchronous?
	done
done

kill $feh

# Politely restore the settings we scribbled over
echo "$old_settings" | dconf load /org/gnome/shell/extensions/colorblind-filters-advanced"$SUFFIX"/
