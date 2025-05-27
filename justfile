zip:
    make zip

install: zip
    gnome-extensions install --force colorblind-filters@G-dH.github.com.zip

test: install
    dbus-run-session -- gnome-shell --nested --wayland --display=:1
