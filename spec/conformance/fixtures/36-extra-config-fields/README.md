# 36-extra-config-fields — unrecognised keys in `.zettelgeist.yaml` are ignored

The config loader only reads `format_version` and `specs_dir`. Any other
keys are preserved in the file but do not trigger errors. This leaves
room for tool-specific configuration without coupling the format to it.
