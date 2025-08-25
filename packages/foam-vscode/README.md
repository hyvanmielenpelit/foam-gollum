# Foam for Gollum – Visual Studio Code Extension

Foam for Gollum is a fork of the [Foam Visual Studio Code extension](https://marketplace.visualstudio.com/items?itemName=foam.foam-vscode), which adds support for the **wikilink syntax** that is used in [Markdown](https://www.markdownguide.org/) documents in Gollum-based wikis.

[Gollum](https://github.com/gollum/gollum) is a wiki software based on the [Git version control system](https://git-scm.com/). For example, [GitHub](https://github.com/)'s repository wikis are based on Gollum and use its syntax.

**Wikilinks** are page name links in double brackets (`[[Page Name]]`), which are used in wiki pages to link to other wiki pages. The main differences of the Gollum-style wikilinks to the standard wikilink syntax of [MediaWiki](https://www.mediawiki.org/wiki/MediaWiki) are:

- When a wikilink has an alias, the alias comes first: `[[Alias|Page Name]]`
- Section headings after a hash (`#`) have a different syntax.
- Wikilinks are relative to the current document directory and not to the root directory of the wiki.

## New Settings

New settings in this extension and their defaults are:

```
"foam.wikilinks.syntax": "gollum",
"foam.wikilinks.caseInsensitive": true,
"foam.useCustomFileDropdownProvider": true,
"foam.fileDropdown.uploadsFolderName": "uploads",
"foam.fileDropdown.fileTemplateFormat": "markdown",
"foam.fileDropdown.imageTemplateFormat": "markdown"
```

Possible values for the settings are:

| Setting | Possible values |
| :------ | :-------------- |
| foam.wikilinks.syntax | "gollum", "mediawiki" |
| foam.fileDropdown.fileTemplateFormat | "markdown", "html", "gollum" |
| foam.fileDropdown.imageTemplateFormat | "markdown", "html", "gollum" |

You don't need to specify these settings in Visual Studio Code's settings, if the defaults work for you.

In the case you have multiple repositories with different Markdown syntaxes, you can add Foam for Gollum's settings to *workspace settings*, so that they are specific to a repository. For repositories using the MediaWiki syntax, you need to specify:

```
"foam.wikilinks.syntax": "mediawiki",
"foam.wikilinks.caseInsensitive": false,
"foam.useCustomFileDropdownProvider": false
```

## New Features in This Extension

### 1. Gollum-Style Wikilinks

This extension adds support for the following Gollum-style wikilink features, when `"foam.wikilinks.syntax"` setting is `"gollum"`.

#### 1.1. Alias First in Wikilinks

Wikilinks with an alias follow the convention `[[Alias|Page Name]]`.

#### 1.2. Section Heading Anchors Follow Gollum Notation

Anchors for section headings (`#` + the section heading name in the wikilink) use the Gollum format, which is the following:

- The text is converted to lower case.
- Special characters are removed.
- Spaces are replaced with dashes.

For example, if you have a section heading `4. My Test Heading`, you should use `#4-my-test-heading` as the anchor in the wikilink.

#### 1.3. Gollum-Style Relative and Absolute Path Support

In Gollum, wikilinks are **relative to the current document directory** and not to the root of the wiki. If you are working with files in subdirectories, you need to pay attention to the path in wikilinks, since `[[Page Name]]` links to a document in the current subdirectory and not to a document in the root directory of the wiki. To access parent and root directories, you need to use `/` and `../` before the page name in a wikilink.

This extension adds support for the following notations for wikilinks:

| Notation | Description |
| :------- | :---------- |
| `[[/My page]]` | A starting slash `/` links to a document in the root directory. |
| `[[../My page]]` | `../` links to a document in the parent directory. |
| `[[My subdir/My page]]` | You can add *a subdirectory name and a slash* to link to a *subdirectory under the current document directory*. |
| `[[/My subdir/My page]]` | You can add *a slash, a subdirectory name and a slash* to link to a *subdirectory under the root directory of the wiki*. |

Multiple levels of subdirectories are supported.

### 2. Case-Insensitive Wikilinks

When `"foam.wikilinks.caseInsensitive"` setting is `true`, wikilink parsing is case-insensitive.

#### Example

- `[[my page]]` links to `My page.md` but shows as `my page` in the preview.

### 3. Custom File Dropdown Provider

When the `"foam.useCustomFileDropdownProvider"` setting is `true`, Visual Studio Code uses a custom file dropdown provider that places dropped files under `/uploads/` using a special logic. It creates a folder under `/uploads/` based on the current document folder and the current document name. For example, files related to `/Items/Amulets.md` will go under `/uploads/Items/Amulets/`.

#### 3.1. Uploads Folder Name Customization

The uploads folder name is customizable via the `"foam.fileDropdown.uploadsFolderName"` setting.

The default value is `"uploads"`.

#### 3.2. File Dropdown Template

You can customize the file dropdown template with the `foam.fileDropdown.fileTemplateFormat` setting.

<table>

<thead>
<tr>
<th>Setting Value</th>
<th>Template</th>
</tr>
</thead>

<tbody>

<tr>
<td><code>"markdown"</code></td>
<td><code>&#91;Text&#93;&#40;Link&#41;</code></td>
</tr>

<tr>
<td><code>"html"</code></td>
<td><code>&lt;a href="Link"&gt;Text&lt;/a&gt;</code></td>
</tr>

<tr>
<td><code>"gollum"</code></td>
<td><code>&#91;&#91;Text|Link&#93;&#93;</code></td>
</tr>

</tbody>
</table>

#### 3.3. Image Dropdown Template

You can customize the image dropdown template with the `foam.fileDropdown.imageTemplateFormat` setting.

<table>

<thead>
<tr>
<th>Setting Value</th>
<th>Template</th>
</tr>
</thead>

<tbody>

<tr>
<td><code>"markdown"</code></td>
<td><code>!&#91;Text&#93;&#40;Link&#41;</code></td>
</tr>

<tr>
<td><code>"html"</code></td>
<td><code>&lt;img src="Link" alt="Text" width="Width" height="Height" /&gt;</code></td>
</tr>

<tr>
<td><code>"gollum"</code></td>
<td><code>&#91;&#91;Link|alt=Text, width=Width, height=Height&#93;&#93;</code></td>
</tr>

</tbody>
</table>

## Foam Extension Features

Please refer to [Foam documentation](https://github.com/foambubble/foam/) for the full description of the features of the Foam extension.
