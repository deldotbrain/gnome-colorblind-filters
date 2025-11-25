#!/bin/sh

# For each image, autocrop the borders, resulting in a 1003px tall image; cut a
# 251px horizontal strip of the image; then stack it with the other images.
stack() {
	magick \
		-font 'DejaVu-Sans' -pointsize 72 -fill white -undercolor '#00000080' -gravity NorthWest \
		\( "$4" -trim +repage -crop x251+0+0 +repage -annotate +0+0 "$3" -stroke '#000000ff' -draw 'line 0,250 %[fx:w],250' -stroke '#00000000' \) \
		\( "$6" -trim +repage -crop x251+0+251 +repage -annotate +0+0 "$5" -stroke '#000000ff' -draw 'line 0,250 %[fx:w],250' -stroke '#00000000' \) \
		\( "$8" -trim +repage -crop x251+0+502 +repage -annotate +0+0 "$7" -stroke '#000000ff' -draw 'line 0,250 %[fx:w],250' -stroke '#00000000' \) \
		\( "${10}" -trim +repage -crop +0+753 +repage -annotate +0+0 "$9" \) \
		-append \
		-scale 50% \
		-quality 90 "$1"
}

mkdir -p out

stack \
	"out/ocs-comparison.webp" "Opponent Color Solver" \
	Original "orig.png" \
	Protanopia "ocs-protanopia.png" \
	Deuteranopia "ocs-deuteranopia.png" \
	Tritanopia "ocs-tritanopia.png"

stack \
	"out/gdh-comparison.webp" "G-dH's Filters" \
	Original "orig.png" \
	Protanopia "gdh-protanopia.png" \
	Deuteranopia "gdh-deuteranopia.png" \
	Tritanopia "gdh-tritanopia.png"

stack \
	"out/hpe-comparison.webp" "Daltonize" \
	Original "orig.png" \
	Protanopia "hpe-protanopia.png" \
	Deuteranopia "hpe-deuteranopia.png" \
	Tritanopia "hpe-tritanopia.png"

stack \
	"out/prot-comparison.webp" "Protanopia Correction Algorithms" \
	"Original Image" "orig.png" \
	"Opponent Color Solver" "ocs-protanopia.png" \
	"GdH's Filters" "gdh-protanopia.png" \
	"Daltonize" "hpe-protanopia.png"

stack \
	"out/deut-comparison.webp" "Deuteranopia Correction Algorithms" \
	"Original Image" "orig.png" \
	"Opponent Color Solver" "ocs-deuteranopia.png" \
	"GdH's Filters" "gdh-deuteranopia.png" \
	"Daltonize" "hpe-deuteranopia.png"

stack \
	"out/trit-comparison.webp" "Tritanopia Correction Algorithms" \
	"Original Image" "orig.png" \
	"Opponent Color Solver" "ocs-tritanopia.png" \
	"GdH's Filters" "gdh-tritanopia.png" \
	"Daltonize" "hpe-tritanopia.png"
