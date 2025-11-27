{
  # nixpkgs' WIP GNOME 49 branch
  inputs.nixpkgs-gnome.url = "github:nixos/nixpkgs/wip-gnome";

  outputs =
    { nixpkgs, nixpkgs-gnome, self }@inputs:
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

          # filter comparison screenshots
          feh
          imagemagick
        ];

      mkAttr = fn: lib.genAttrs lib.systems.flakeExposed (sys: fn sys nixpkgs.legacyPackages.${sys});

      mkTestVm = nixpkgsFlake: system:
          (nixpkgsFlake.lib.nixosSystem {
            inherit system;
            specialArgs.flakeInputs = inputs;
            modules = [ ./misc/test-vm.nix ];
          }).config.system.build.vm;
    in
    {
      packages = mkAttr (system: pkgs: rec {
        default = colorblind-filters-advanced;

        colorblind-filters-advanced = pkgs.callPackage ./package.nix {
          srcRev = self.rev or self.dirtyRev or "unknown";
        };

        devEnv = pkgs.buildEnv {
          name = "gnome-colorblind-filters-deps";
          paths = devDeps pkgs;
        };

        testVm = mkTestVm nixpkgs system;

        testVmGnome49 = mkTestVm nixpkgs-gnome system;
      });

      devShells = mkAttr (_: pkgs: {
        default = pkgs.mkShell {
          name = "gnome-colorblind-filters-shell";
          packages = devDeps pkgs;
        };
      });
    };
}
