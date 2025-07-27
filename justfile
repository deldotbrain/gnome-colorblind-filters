# vim:sw=4 ts=4 sts=4 et

suffix := 'dev'
package := 'colorblind-filters-advanced-' + suffix + '@amyp.codeberg.org'

zip: (make 'all') (make 'zip')

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

test-vm:
    # try to avoid downloading a whole fresh system by using the host nixpkgs
    nix run --override-input nixpkgs nixpkgs '.#testVm'

test-multimon monitors="2" display=":2" resolution="1280x720": install
    MUTTER_DEBUG_NUM_DUMMY_MONITORS={{monitors}} \
    MUTTER_DEBUG_DUMMY_MODE_SPECS={{resolution}} \
    dbus-run-session -- gnome-shell --nested --wayland --display={{display}}

lint:
    npx eslint --config ./misc/lint/eslint.config.mjs src/*.js

install-eslint:
    npm install -D eslint @eslint/js
