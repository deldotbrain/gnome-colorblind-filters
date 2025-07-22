{
  outputs =
    { nixpkgs, self }:
    let
      inherit (nixpkgs) lib;

      devDeps =
        pkgs: with pkgs; [
          just

          # You know you've having a bad time when you need this for a
          # *JavaScript* project:
          #gdb

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

      mkAttr = fn: lib.genAttrs lib.systems.flakeExposed (sys: fn nixpkgs.legacyPackages.${sys});
    in
    {
      packages = mkAttr (pkgs: rec {
        default = gnome-colorblind-filters;

        gnome-colorblind-filters = pkgs.callPackage ./package.nix {
          srcRev = self.rev or self.dirtyRev;
        };

        devEnv = pkgs.buildEnv {
          name = "gnome-colorblind-filters-deps";
          paths = devDeps pkgs;
        };
      });

      devShells = mkAttr (pkgs: {
        default = pkgs.mkShell {
          name = "gnome-colorblind-filters-shell";
          packages = devDeps pkgs;
        };
      });
    };
}
