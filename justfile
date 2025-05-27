zip:
    make zip

install: zip
    gnome-extensions install --force colorblind-filters@G-dH.github.com.zip

uninstall:
    gnome-extensions uninstall colorblind-filters@G-dH.github.com

test display=":1" resolution="1280x720": install
    MUTTER_DEBUG_DUMMY_MODE_SPECS={{resolution}} \
    dbus-run-session -- gnome-shell --nested --wayland --display={{display}}
