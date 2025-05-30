# Replace these with the name and domain of your extension!
NAME ?= colorblind-filters-aosp
DOMAIN ?= amyp.codeberg.org

# Set to e.g. dev to change UUID, settings location, etc. for testing
SUFFIX ?=
sfx := $(if $(SUFFIX),-$(SUFFIX))

PNAME := $(NAME)$(sfx)
UUID := $(PNAME)@$(DOMAIN)
ZIP_NAME := $(UUID).zip

BUILD_TMP ?= build$(sfx)

js_files = $(wildcard *.js)
locales_po = $(wildcard po/*.po)
locales_mo = $(patsubst po/%.po,$(BUILD_TMP)/locale/%/LC_MESSAGES/$(NAME).mo,$(locales_po))

zip_generated = \
		$(BUILD_TMP)/metadata.json \
		$(BUILD_TMP)/schemas/gschemas.compiled \
		$(BUILD_TMP)/schemas/org.gnome.shell.extensions.$(PNAME).gschema.xml \
		$(locales_mo)
zip_asis = $(patsubst %,$(BUILD_TMP)/%,$(js_files))

# These six recipes can be invoked by the user.
.PHONY: all zip install uninstall clean

all: $(zip_generated)

# The zip recipes only bundles the extension without installing it.
zip: $(ZIP_NAME)

# The install recipes creates the extension zip and installs it.
install: $(ZIP_NAME)
	gnome-extensions install "$(ZIP_NAME)" --force
	@echo "Extension installed successfully! Now restart the Shell ('Alt'+'F2', then 'r' or log out/log in on Wayland)."

# This uninstalls the previously installed extension.
uninstall:
	gnome-extensions uninstall "$(UUID)"

# Use gettext to generate a translation template file.
$(BUILD_TMP)/po/$(NAME).pot: $(js_files)
	mkdir -p $(BUILD_TMP)/po
	xgettext --from-code=UTF-8 \
	          --add-comments=Translators \
	          --copyright-holder="GdH" \
	          --package-name="$(NAME)" \
	          --output=$(BUILD_TMP)/po/$(NAME).pot \
	          $(js_files)

# This removes all temporary files created with the other recipes.
clean:
	rm -rf $(BUILD_TMP) $(ZIP_NAME)

$(BUILD_TMP):
	mkdir -p $(BUILD_TMP)

$(BUILD_TMP)/metadata.json: metadata.json $(BUILD_TMP)
	jq '.["settings-schema"] = "org.gnome.shell.extensions.$(PNAME)" | .uuid = "$(UUID)"$(if $(SUFFIX), | .name = .name + " ($(SUFFIX))")' $< >$@

$(BUILD_TMP)/schemas/org.gnome.shell.extensions.$(PNAME).gschema.xml: schemas/org.gnome.shell.extensions.$(NAME).gschema.xml
	mkdir -p $(BUILD_TMP)/schemas
	xmlstarlet ed \
		-u //schema/@id -v "org.gnome.shell.extensions.$(PNAME)" \
		-u //schema/@path -v "/org/gnome/shell/extensions/$(PNAME)/" \
		$< > $(BUILD_TMP)/schemas/org.gnome.shell.extensions.$(PNAME).gschema.xml

# Compiles the gschemas.compiled file from the gschema.xml file.
$(BUILD_TMP)/schemas/gschemas.compiled: $(BUILD_TMP)/schemas/org.gnome.shell.extensions.$(PNAME).gschema.xml
	glib-compile-schemas $(BUILD_TMP)/schemas

# FIXME surely gettext can't see its .pot file, but it doesn't care? It's fine,
# I broke i18n ages ago anyway.
$(BUILD_TMP)/locale/%/LC_MESSAGES/$(NAME).mo: po/%.po $(BUILD_TMP)/po/$(NAME).pot
	mkdir -p $(BUILD_TMP)/locale/$*/LC_MESSAGES
	msgfmt -c -o $@ $<

$(BUILD_TMP)/%.js: %.js $(BUILD_TMP)
	cp $< $@

# This bundles the extension and checks whether it is small enough to be uploaded to
# extensions.gnome.org. We do not use "gnome-extensions pack" for this, as this is not
# readily available on the GitHub runners.
$(ZIP_NAME): $(zip_generated) $(zip_asis)
	rm --force $(ZIP_NAME)
	cd $(BUILD_TMP) && zip -r "$(abspath $(ZIP_NAME))" $(patsubst $(BUILD_TMP)/%,%,$^)

	@#Check if the zip size is too big to be uploaded
	@SIZE=$$(unzip -Zt $(ZIP_NAME) | awk '{print $$3}') ; \
	 if [[ $$SIZE -gt 5242880 ]]; then \
	    echo "ERROR! The extension is too big to be uploaded to" \
	         "the extensions website, keep it smaller than 5 MB!"; \
	    exit 1; \
	 fi
