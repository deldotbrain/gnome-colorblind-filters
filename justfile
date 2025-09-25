# vim:sw=4 ts=4 sts=4 et

# suffix for names of extension, build directory, and zip file
suffix := 'dev'

# for debug and test targets
lang := '' # e.g. it_IT.UTF-8
display := ':1'
resolution := '1920x1080'
monitors := '1'

# not customizable; needs to agree with makefile
package := 'colorblind-filters-advanced-' + suffix + '@amyp.codeberg.org'

# Invoke make, passing a value for $SUFFIX
_make *target:
    make SUFFIX={{suffix}} {{target}}

# Apparently, on GNOME 49+, this should be "dbus-run-session -- gnome-shell
# --devkit" instead.
[doc('Run a nested GNOME compositor with a clean environment')]
_run_gnome mode launcher: install
    systemd-run --user --{{mode}} \
        --setenv MUTTER_DEBUG_NUM_DUMMY_MONITORS={{monitors}} \
        --setenv MUTTER_DEBUG_DUMMY_MODE_SPECS={{resolution}} \
        {{if lang != '' { '--setenv LANG=' + lang } else { '' } }} \
        dbus-run-session -- {{launcher}} gnome-shell --nested --wayland --display={{display}}

# 'all' runs checks that 'zip' doesn't
[doc('Package the extension into a zip file')]
zip: (_make 'all') (_make 'zip')

# Clean up the build directory
clean: (_make 'clean')

# Install or update the extension
install: zip
    gnome-extensions install --force {{package}}.zip

# Uninstall the extension
uninstall:
    gnome-extensions uninstall {{package}}

# tries to avoid downloading a whole fresh system by using the host nixpkgs
[doc('Run a NixOS virtual machine with the extension enabled')]
test-vm:
    nix run --override-input nixpkgs nixpkgs '.#testVm'

# Some of the builds require huge amounts of memory, so don't run too many at
# once.
[doc('Run a NixOS virtual machine with GNOME 49 and the extension')]
test-vm-49:
    nix run --max-jobs 2 '.#testVmGnome49'

# Update the extension and run a nested GNOME compositor
test: (_run_gnome 'pipe' '')

# Update the extension and run a nested GNOME compositor inside gdb
debug: (_run_gnome 'pty' (shell('which gdb') + ' --args'))

# Run eslint on everything in src/
lint:
    npx eslint --config ./misc/lint/eslint.config.mjs src/*.js

# Install eslint and its dependencies
install-eslint:
    npm install -D eslint @eslint/js
