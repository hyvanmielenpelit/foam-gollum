/*global markdownit:readonly*/

// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
import markdownItRegex from 'markdown-it-regex';
import { FoamWorkspace } from '@foam/core';
import { Logger } from '@foam/core';
import { Resource, ResourceParser } from '@foam/core';
import { URI } from '@foam/core';
import { Range } from '@foam/core';
import { isSome } from '@foam/core';
import { stripFrontMatter, stripFrontMatterAndTitle } from '@foam/core';
import { RenderContext } from '@foam/core';
import { Config } from '@foam/core';
import {
  WIKILINK_EMBED_REGEX,
  WIKILINK_EMBED_REGEX_GROUPS,
  withLinksRelativeToWorkspaceRoot,
  retrieveNoteConfig,
  extractBlockContent,
  parseImageParameters,
  generateImageStyles,
} from './embed-helpers';

export {
  WIKILINK_EMBED_REGEX,
  WIKILINK_EMBED_REGEX_GROUPS,
  CONFIG_EMBED_NOTE_TYPE,
  withLinksRelativeToWorkspaceRoot,
  retrieveNoteConfig,
  extractBlockContent,
  parseImageParameters,
  generateImageStyles,
} from './embed-helpers';

/**
 * Options for the wikilink embed plugin. Pass the same `renderContext` into
 * `markdownItFoamQuery` so embed↔query cycles get caught.
 */
export interface WikilinkEmbedOptions {
  /** Fallback for resolving `![[#section]]` / `$current`, used when the
   * render context stack is empty (i.e. top-level render). */
  getCurrentResource?: (env?: any) => Resource | null;
  /** Returns the instance that renders the embedded note; it is called
   * mid-render, so it may be `md` itself. Defaults to `md`. */
  createInnerMd?: () => markdownit;
  renderContext: RenderContext;
  /**
   * Whether the host is a virtual workspace (no local filesystem). When true,
   * embeds render a "not supported" warning instead of reading source files.
   * Defaults to `() => false`.
   */
  isVirtualWorkspace?: () => boolean;
  /**
   * Returns the configured embed note type (e.g. `full-inline`, `content-card`).
   * Defaults to `() => 'full-card'`.
   */
  getEmbedNoteType?: () => string;
}

export const markdownItWikilinkEmbed = (
  md: markdownit,
  workspace: FoamWorkspace,
  parser: ResourceParser,
  options: WikilinkEmbedOptions
) => {
  const {
    getCurrentResource,
    createInnerMd,
    renderContext,
    isVirtualWorkspace = () => false,
    getEmbedNoteType = () => 'full-card',
  } = options;
  // Top of the render-context stack wins — keeps `![[#section]]` inside an
  // embed resolving against the embedded note, not the outer page.
  const resolveCurrentNote = (): Resource | null => {
    const stack = renderContext.current();
    if (stack.length > 0) {
      const top = stack[stack.length - 1];
      return workspace.find(top) ?? null;
    }
    return getCurrentResource ? getCurrentResource(undefined) : null;
  };

  return md.use(markdownItRegex, {
    name: 'embed-wikilinks',
    regex: WIKILINK_EMBED_REGEX,
    replace: (wikilinkItem: string) => {
      try {
        const [, noteEmbedModifier, wikilink, parametersString] =
          wikilinkItem.match(WIKILINK_EMBED_REGEX_GROUPS);

        if (isVirtualWorkspace()) {
          return `
<div class="foam-embed-not-supported-warning">
  Embed not supported in virtual workspace: ![[${wikilink}]]
</div>
          `;
        }

        let includedNote = workspace.find(wikilink);

        // A Gollum path such as `../sub/note` is relative to the current note
        if (
          !includedNote &&
          !wikilink.startsWith('#') &&
          Config.getWikilinksSyntax() === 'gollum'
        ) {
          const currentResource = resolveCurrentNote();
          const targetUri =
            currentResource &&
            workspace.resolveLink(currentResource, {
              type: 'wikilink',
              rawText: `[[${wikilink}]]`,
              range: Range.create(0, 0),
              isEmbed: true,
            });
          const target =
            targetUri && !targetUri.isPlaceholder()
              ? workspace.find(targetUri)
              : null;
          if (target) {
            includedNote = { ...target, uri: targetUri };
          }
        }

        if (!includedNote && wikilink.startsWith('#')) {
          const currentResource = resolveCurrentNote();
          if (currentResource) {
            const fragment = wikilink.slice(1);
            includedNote = {
              ...currentResource,
              uri: currentResource.uri.with({ fragment }),
            };
          }
        }

        if (!includedNote) {
          return `![[${wikilink}]]`;
        }

        const isSelfRefFragment = wikilink.startsWith('#');
        const cycleWarning = (): string => {
          const stackPaths = renderContext
            .current()
            .map(u => u.path.toLocaleLowerCase());
          return `
<div class="foam-cyclic-link-warning">
  Cyclic link detected for wikilink: ${wikilink}
  <div class="foam-cyclic-link-warning__stack">
    Link sequence:
    <ul>
      ${stackPaths.map(ref => `<li>${ref}</li>`).join('')}
    </ul>
  </div>
</div>
          `;
        };

        // The URI on the stack may have been pushed by another embed or by
        // a foam-query rendering this note's body — either way, recursing
        // would loop.
        if (!isSelfRefFragment && renderContext.has(includedNote.uri)) {
          return cycleWarning();
        }

        let content: string;
        try {
          content = getNoteContent(
            includedNote,
            noteEmbedModifier,
            parser,
            workspace,
            md,
            getEmbedNoteType,
            parametersString
          );
        } catch (e) {
          Logger.error(
            `Error while including ${wikilinkItem} into the current document of the Preview panel`,
            e
          );
          return '';
        }

        // Self-references (`![[#section]]`) point at the current note by
        // design; don't push or `enter` would refuse and the legitimate
        // inner render would be skipped.
        const entered = isSelfRefFragment
          ? false
          : renderContext.enter(includedNote.uri);
        // Defensive: `has` was false above but `enter` says otherwise — bail
        // rather than risk infinite recursion.
        if (!isSelfRefFragment && !entered) {
          return cycleWarning();
        }
        try {
          const innerMd = createInnerMd ? createInnerMd() : md;
          return innerMd.render(content);
        } finally {
          if (entered) {
            renderContext.exit(includedNote.uri);
          }
        }
      } catch (e) {
        Logger.error(
          `Error while including ${wikilinkItem} into the current document of the Preview panel`,
          e
        );
        return '';
      }
    },
  });
};

function getNoteContent(
  includedNote: Resource,
  noteEmbedModifier: string | undefined,
  parser: ResourceParser,
  workspace: FoamWorkspace,
  md: markdownit,
  getEmbedNoteType: () => string,
  parametersString?: string
): string {
  let content = `Embed for [[${includedNote.uri.path}]]`;
  let toRender: string;

  switch (includedNote.type) {
    case 'note': {
      const { noteScope, noteStyle } = retrieveNoteConfig(
        noteEmbedModifier,
        getEmbedNoteType
      );

      const formatter: EmbedNoteFormatter =
        noteStyle === 'card'
          ? cardFormatter
          : noteStyle === 'inline'
          ? inlineFormatter
          : cardFormatter;

      content = withLinksRelativeToWorkspaceRoot(
        includedNote.uri,
        extractNoteText(includedNote, noteScope === 'content'),
        parser,
        workspace
      );
      toRender = formatter(content, md);
      break;
    }
    case 'attachment':
      content = `
<div class="embed-container-attachment">
${md.renderInline('[[' + includedNote.uri.path + ']]')}<br/>
Embed for attachments is not supported
</div>`;
      toRender = md.render(content);
      break;
    case 'image': {
      const imageParams = parseImageParameters(
        includedNote.uri.path,
        parametersString
      );
      const imageHtml = generateImageStyles(imageParams, md);
      content = `<div class="embed-container-image">${imageHtml}</div>`;
      toRender = content;
      break;
    }
    default:
      toRender = content;
  }

  return toRender;
}

/**
 * Returns the part of the note the embed points at. Slicing happens on the
 * source as read, so the parsed section and block ranges line up with it.
 * A fragment that resolves to nothing falls back to the whole note, which is
 * shown without its frontmatter.
 */
function extractNoteText(note: Resource, withoutTitle: boolean): string {
  const noteText = readFileSync(note.uri.toFsPath()).toString();
  const rows = noteText.split('\n');
  const fragment = note.uri.fragment;
  if (fragment.startsWith('^')) {
    const block = Resource.findBlock(note, fragment.slice(1));
    if (isSome(block)) {
      return extractBlockContent(noteText, note, block);
    }
  } else if (fragment) {
    const section = Resource.findSection2(
      note,
      fragment,
      Config.getWikilinksSyntax() === 'gollum'
    );
    if (isSome(section)) {
      const start = withoutTitle
        ? section.headingRange.end.line + 1
        : section.range.start.line;
      return rows.slice(start, section.range.end.line).join('\n');
    }
  }
  return withoutTitle
    ? stripFrontMatterAndTitle(noteText, note.sections)
    : stripFrontMatter(noteText);
}

/**
 * A type of function that renders note content with the desired style in html
 */
export type EmbedNoteFormatter = (content: string, md: markdownit) => string;

function cardFormatter(content: string, md: markdownit): string {
  return `<div class="embed-container-note">\n\n${content}\n\n</div>`;
}

function inlineFormatter(content: string, md: markdownit): string {
  return content;
}

export default markdownItWikilinkEmbed;
