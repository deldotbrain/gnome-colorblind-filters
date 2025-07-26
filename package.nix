{
  srcRev ? null,
  version ? "g" + lib.substring 0 7 srcRev,

  lib,
  stdenvNoCC,

  which,
  gettext,
  glib,
  zip,
  unzip,
  jq,
  xmlstarlet,
}:
let
  metadata = lib.importJSON ./metadata.json;
  inherit (metadata) uuid description;
  name = lib.head (lib.splitString "@" uuid);
in
stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "gnome-shell-extension-${name}";
  inherit version;
  src =
    with lib.fileset;
    toSource {
      root = ./.;
      fileset = unions [
        ./src
        ./po
        ./schemas
        ./Makefile
        ./metadata.json
        (fileFilter ({ name, ... }: lib.hasPrefix "LICENSE" name) ./.)
      ];
    };

  nativeBuildInputs = [
    which
    gettext
    glib
    zip
    unzip
    jq
    xmlstarlet
  ];

  # Not sure why this doesn't work, not really that worried about it.
  # makeTargets = [ "zip" ];

  buildPhase = ''
    runHook preBuild

    make zip

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/gnome-shell/extensions/${uuid}
    unzip ${uuid}.zip -d $out/share/gnome-shell/extensions/${uuid}

    runHook postInstall
  '';

  meta = {
    description = builtins.head (lib.splitString "\n" description);
    longDescription = description;
    homepage = metadata.url;
    license = lib.licenses.gpl3Only;
    platforms = lib.platforms.linux;
  };

  passthru.extensionUuid = uuid;
})
