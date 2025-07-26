# Replace these with the name and domain of your extension!
NAME ?= colorblind-filters-advanced
DOMAIN ?= amyp.codeberg.org

# Set to e.g. dev to change UUID, settings location, etc. for testing
SUFFIX ?=
sfx := $(if $(SUFFIX),-$(SUFFIX))

PNAME := $(NAME)$(sfx)
UUID := $(PNAME)@$(DOMAIN)
ZIP_NAME := $(UUID).zip

BUILD_TMP ?= build$(sfx)

js_files = $(wildcard src/*.js)
locales_po = $(wildcard po/*.po)
schema_out = $(BUILD_TMP)/schemas/org.gnome.shell.extensions.$(PNAME).gschema.xml
schema_in = schemas/org.gnome.shell.extensions.$(NAME).gschema.xml

ifneq ($(shell which msgfmt xgettext &>/dev/null; echo $$?),0)
warn_gettext:
	@echo -e '\e[1;31mWarning: gettext not found; translations will not be packaged\e[0m'

.PHONY: warn_gettext

build_mos = warn_gettext
check_pot = warn_gettext
else
locales_mo = $(patsubst po/%.po,$(BUILD_TMP)/locale/%/LC_MESSAGES/$(NAME).mo,$(locales_po))
build_mos = $(locales_mo)
check_pot = check_pot
endif

zip_generated = \
		$(BUILD_TMP)/metadata.json \
		$(BUILD_TMP)/schemas/gschemas.compiled \
		$(schema_out) \
		$(locales_mo)
zip_asis = \
		$(patsubst src/%,$(BUILD_TMP)/%,$(js_files)) \
		$(wildcard LICENSE*)

# These recipes can be invoked by the user.
.PHONY: all zip install uninstall clean check_pot

all: $(build_mos) $(zip_generated) $(check_pot)

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
		--copyright-holder="A. Pennucci" \
		--package-name="$(NAME)" \
		--output=$@ \
		$(js_files)

check_pot: $(BUILD_TMP)/po/$(NAME).pot
	@if ! diff \
		<(grep '^msgid' $< | sort | uniq) \
		<(grep '^msgid' po/$(NAME).pot | sort | uniq) \
		&>/dev/null; then \
		echo -e '\e[1;31mWarning: po/$(NAME).pot is out of date\e[0m'; \
	fi

# This removes all temporary files created with the other recipes.
clean:
	rm -rf $(BUILD_TMP) $(ZIP_NAME)

$(BUILD_TMP):
	mkdir -p $(BUILD_TMP)

$(BUILD_TMP)/metadata.json: metadata.json $(BUILD_TMP)
	if [ -n "$(SUFFIX)" ]; then \
		jq '.["settings-schema"] = "org.gnome.shell.extensions.$(PNAME)" | .uuid = "$(UUID)"$(if $(SUFFIX), | .name = .name + " ($(SUFFIX))")' $< >$@; \
	else \
		cp $< $@; \
	fi

$(schema_out): $(schema_in)
	mkdir -p $(BUILD_TMP)/schemas
	if [ -n "$(SUFFIX)" ]; then \
		xmlstarlet ed \
			-u //schema/@id -v "org.gnome.shell.extensions.$(PNAME)" \
			-u //schema/@path -v "/org/gnome/shell/extensions/$(PNAME)/" \
			$< >$@; \
	else \
		cp $< $@; \
	fi

# Compiles the gschemas.compiled file from the gschema.xml file.
$(BUILD_TMP)/schemas/gschemas.compiled: $(schema_out)
	glib-compile-schemas $(BUILD_TMP)/schemas

$(BUILD_TMP)/locale/%/LC_MESSAGES/$(NAME).mo: po/%.po
	mkdir -p $(BUILD_TMP)/locale/$*/LC_MESSAGES
	msgfmt -c -o $@ $<

$(BUILD_TMP)/%.js: src/%.js $(BUILD_TMP)
	cp $< $@

# This bundles the extension and checks whether it is small enough to be uploaded to
# extensions.gnome.org. We do not use "gnome-extensions pack" for this, as this is not
# readily available on the GitHub runners.
$(ZIP_NAME): $(build_mos) $(zip_generated) $(zip_asis)
	rm --force $(ZIP_NAME)
	cd $(BUILD_TMP) && zip "$(abspath $(ZIP_NAME))" $(patsubst $(BUILD_TMP)/%,%,$^)

	@#Check if the zip size is too big to be uploaded
	@SIZE=$$(unzip -Zt $(ZIP_NAME) | awk '{print $$3}') ; \
	 if [[ $$SIZE -gt 5242880 ]]; then \
	    echo "ERROR! The extension is too big to be uploaded to" \
	         "the extensions website, keep it smaller than 5 MB!"; \
	    exit 1; \
	 fi
