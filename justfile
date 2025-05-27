zip:
    make zip

install: zip
    gnome-extensions install --force colorblind-filters@G-dH.github.com.zip

uninstall:
    gnome-extensions uninstall colorblind-filters@G-dH.github.com

test: install
    dbus-run-session -- gnome-shell --nested --wayland --display=:1
