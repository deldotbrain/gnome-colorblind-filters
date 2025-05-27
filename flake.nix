{
  outputs =
    { nixpkgs, ... }:
    {
      devShells.x86_64-linux.default =
        with nixpkgs.legacyPackages.x86_64-linux;
        mkShell {
          packages = [
            just

            # Run from command line
            gjs
            clutter

            # Building
            gettext
            glib.dev
            gnumake
          ];
        };
    };
}
