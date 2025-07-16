{
  outputs =
    { nixpkgs, ... }:
    {
      devShells.x86_64-linux.default =
        with nixpkgs.legacyPackages.x86_64-linux;
        mkShell {
          packages = [
            just

            # For lms_matrices.py
            python3
            python3.pkgs.numpy

            # Run from command line
            gjs
            clutter

            # because there wasn't enough pain in this world, we created eslint
            nodejs

            # Building
            gettext
            glib.dev
            gnumake
            jq
            xmlstarlet
          ];
        };
    };
}
