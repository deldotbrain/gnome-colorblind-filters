{
  pkgs,
  modulesPath,
  flakeInputs,
  ...
}:
let
  thisExtension = flakeInputs.self.packages.${pkgs.system}.default;
in
{
  imports = [
    "${modulesPath}/profiles/minimal.nix"
    "${modulesPath}/virtualisation/qemu-vm.nix"
  ];

  config = {
    system = {
      name = "cfa-test";
      stateVersion = "25.05";
    };

    # Run gnome; automatically login
    services.xserver = {
      enable = true;
      displayManager.gdm.enable = true;
      desktopManager.gnome.enable = true;
    };
    services.displayManager.autoLogin = {
      enable = true;
      user = "username";
    };
    environment.gnome.excludePackages = with pkgs; [
      gnome-tour
      gnome-bluetooth
    ];

    # install and enable this extension
    environment.systemPackages = [ thisExtension ];
    programs.dconf.profiles.user.databases = [
      {
        settings."org/gnome/shell"."enabled-extensions" = [ thisExtension.extensionUuid ];
        # And set a nice gay background while we're at it
        settings."org/gnome/desktop/background" = {
          "picture-uri" = "file:///run/current-system/sw/share/backgrounds/gnome/progress-l.jxl";
          "picture-uri-dark" = "file:///run/current-system/sw/share/backgrounds/gnome/progress-d.jxl";
        };
      }
    ];

    # Speed up boot: I don't care about networking, pstore, etc.
    networking.networkmanager.enable = false;
    networking.useDHCP = false;
    networking.firewall.enable = false;
    systemd.services."mount-pstore".enable = false;

    # create a very secure default user
    users = {
      mutableUsers = false;
      allowNoPasswordLogin = true;
      users."username" = {
        password = "password";
        group = "users";
        extraGroups = [ "wheel" ];
        isNormalUser = true;
      };
    };

    virtualisation = {
      # No persistent disk
      diskImage = null;
      # 1G is barely enough for GNOME's desktop; 2G still crashes when e.g.
      # changing backgrounds
      memorySize = 4096;
      # Everyone has lots of cores these days, right?
      cores = 4;
      # no need for network to test this thing
      restrictNetwork = true;

      # virtio is resizable and more efficient anyway
      # resolution = { x = 1600; y = 900; };
      qemu.options = [
        "-vga none"
        "-device virtio-gpu-gl,hostmem=1G" #,blob=true,venus=true"
        "-display gtk,gl=on,show-tabs=on,show-cursor=on,window-close=on,zoom-to-fit=on"
      ];
    };
  };
}
