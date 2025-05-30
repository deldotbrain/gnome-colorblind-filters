suffix := 'dev'
package := 'colorblind-filters-aosp-' + suffix + '@amyp.codeberg.org'

zip: (make 'zip')

clean: (make 'clean')

make *target:
    make SUFFIX={{suffix}} {{target}}

install: zip
    gnome-extensions install --force {{package}}.zip

uninstall:
    gnome-extensions uninstall {{package}}

test display=":1" resolution="1280x720": install
    MUTTER_DEBUG_DUMMY_MODE_SPECS={{resolution}} \
    dbus-run-session -- gnome-shell --nested --wayland --display={{display}}
