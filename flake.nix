{
  outputs =
    { nixpkgs, self }@inputs:
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
        default = colorblind-filters-advanced;

        colorblind-filters-advanced = pkgs.callPackage ./package.nix {
          srcRev = self.rev or self.dirtyRev;
        };

        devEnv = pkgs.buildEnv {
          name = "gnome-colorblind-filters-deps";
          paths = devDeps pkgs;
        };

        testVm =
          (nixpkgs.lib.nixosSystem {
            inherit (pkgs) system;
            specialArgs.flakeInputs = inputs;
            modules = [ ./test-vm.nix ];
          }).config.system.build.vm;
      });

      devShells = mkAttr (pkgs: {
        default = pkgs.mkShell {
          name = "gnome-colorblind-filters-shell";
          packages = devDeps pkgs;
        };
      });
    };
}
