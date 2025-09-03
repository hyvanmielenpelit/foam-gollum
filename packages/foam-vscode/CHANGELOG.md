# Change Log

All notable changes to the "foam-vscode-gollum" extension will be documented in this file.

## [1.2.11] - 2025-09-03

- Fix wrong build.

## [1.2.10] - 2025-09-03

- Fix file renaming to work with wikilinks with an alias.

## [1.2.9] - 2025-08-31

- Fix README.
- Fix handling for filenames with a dot.

## [1.2.8] - 2025-08-15

- Fix section heading link conversion to render dots as dashes.

## [1.2.7] - 2025-08-15

- Fix section heading completion for the existing page.
- Fix wikilinks with no target and only a section heading.

## [1.2.6] - 2025-08-12

- Move the cursor 1 character it ends on a new line.

## [1.2.5] - 2025-08-12

- Further fixing to moving cursor 2 characters left when necessary.

## [1.2.4] - 2025-08-12

- Add move left by 2 characters to section heading autocompletion when necessary.

## [1.2.3] - 2025-08-12

- Remove move left by 2 characters from section heading autocompletion.

## [1.2.2] - 2025-08-08

- Fix wikilink autocompletion.

## [1.2.1] - 2025-08-08

- Fix section headings in wikilinks.
- Fix section heading autocompletion.

## [1.2.0] - 2025-08-04

- Changed setting names by removing dashes.

```
"foam.wikilinks.syntax": "gollum",
"foam.wikilinks.caseInsensitive": true,
"foam.useCustomFileDropdownProvider": true,
"foam.fileDropdown.uploadsFolderName": "uploads",
"foam.fileDropdown.fileTemplateFormat": "markdown",
"foam.fileDropdown.imageTemplateFormat": "markdown"
```

## [1.1.11] - 2025-08-04

- Update README.md.

## [1.1.10] - 2025-08-04

- Update README.md.

## [1.1.9] - 2025-08-04

- Update README.md.

## [1.1.8] - 2025-08-04

- Fixed file dropdown templates.

## [1.1.7] - 2025-08-04

- Changed to read image dimensions from a file.

## [1.1.6] - 2025-08-03

- Fix align, float, frame in Gollum-style image template.

## [1.1.5] - 2025-08-03

- Update README.md.

## [1.1.4] - 2025-08-03

- Update README.md.

## [1.1.3] - 2025-08-03

- Added support for Gollum-style image and file links: `[Image Url|alt=text, width=64px, height=64px]`.
- Added new settings and their defaults:
    - "foam.file-dropdown.uploads-folder-name": "uploads"
    - "foam.file-dropdown.file-template-format": "markdown"
    - "foam.file-dropdown.image-template-format": "markdown"

## [1.1.2] - 2025-07-30

- Fixed some bugs.

## [1.1.1] - 2025-07-30

- Updated repository links to [https://github.com/hyvanmielenpelit/foam-gollum](https://github.com/hyvanmielenpelit/foam-gollum).

## [1.1.0] - 2025-07-30

- Merged changes from Foam 0.27.2.

## [1.0.21] - 2025-07-30

Fixed page lookup being relative to the end of the lookup path so that when looking for `Boots.md`, all files in all subdirectories named `Boots.md` were found. Now it finds the exact path, so lookup for `Boots.md` finds only `Boots.md` in the root directory.

## [1.0.20] - 2025-07-30

- Updated README.md.

## [1.0.19] - 2025-07-29

- Support for dropping multiple files at once.

## [1.0.18] - 2025-07-29

- Added support for dropping files from within the current workspace to a Markdown document. In this case, the file will not be copied to a new directory, but a link to the original file location will be established.

## [1.0.17] - 2025-07-29

- Added proper support for URI encoding and decoding.

## [1.0.16] - 2025-07-28

- Fix spaces in image paths.

## [1.0.15] - 2025-07-28

- Fixed file copying.

## [1.0.14] - 2025-07-28

- Added a custom file dropdown provider.

## [1.0.13] - 2025-07-28

- Fix img tag rendering.

## [1.0.12] - 2025-07-28

- Support for img tags with a root relative path.

## [1.0.11] - 2025-07-28

- Support for Gollum style image links.

## [1.0.10] - 2025-07-26

- Updated README.md.
  
## [1.0.9] - 2025-07-26

- Updated README.md.

## [1.0.8] - 2025-07-26

- Updated README.md.
- A small performance fix.

## [1.0.7] - 2025-07-26

- Added proper support for case insensitivity in previews.

## [1.0.6] - 2025-07-26

- Added support for wikilinks with multiple parent directories, such as `../../Lawful`.

## [1.0.5] - 2025-07-25

- Fix relative links with subdirectories in documents in subdirectories.

## [1.0.4] - 2025-07-25

- Changed setting name to `foam.wikilinks.syntax` with `gollum` and `mediawiki` options.
- Added `foam.wikilinks.case-insensitive` setting with `true` and `false`.
- Support for recognizing the need for `/` in wikilinks referring to document root items.

## [1.0.3] - 2025-07-24

- Added support for lowercase wikilinks.
- Added support for Gollum-style section headers.

## [1.0.2] - 2025-07-24

- Added support for links starting with `/` and `../`.

## [1.0.1] - 2025-07-23

- Updated README.MD.
- Updated CHANGELOG.MD.
- Updated the extension icon.

## [1.0.0] - 2025-07-23

- Forked Foam 0.26.12.
- Added support for Gollum-style wikilinks `[[Alias|Page Name]]`.
- Added `foam.wikilinks.order` setting with `alias-first` and `alias-last` options.
