package := 'colorblind-filters@amyp.codeberg.org'

zip:
    make zip

install: zip
    gnome-extensions install --force {{package}}.zip

uninstall:
    gnome-extensions uninstall {{package}}

test display=":1" resolution="1280x720": install
    MUTTER_DEBUG_DUMMY_MODE_SPECS={{resolution}} \
    dbus-run-session -- gnome-shell --nested --wayland --display={{display}}
