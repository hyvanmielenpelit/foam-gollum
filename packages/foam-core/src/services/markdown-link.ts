import { ResourceLink } from '../model/note';
import { URI } from '../model/uri';
import { TextEdit } from './text-edit';
import { Config } from '../config';
import { getExtension } from '../utils/path';
import { imageExtensions } from './attachment-provider';

/**
 * The parts of a link. The optional fields are only set for Gollum syntax.
 */
export interface LinkAnalysis {
  target: string;
  section: string;
  blockId: string;
  alias: string;
  /** Gollum: the target started with `/` (relative to the wiki root) */
  isRoot?: boolean;
  /** Gollum: how many leading `../` segments the target had */
  parentCount?: number;
  /** Gollum: the text after the pipe of an image link, e.g. `frame|align=center` */
  imageProperties?: string;
  /** Gollum: `image` for an image link, else `link` */
  linkType?: 'link' | 'image';
  /** Gollum: the target as written, before `/`, `./` and `../` are removed */
  rawTarget?: string;
}

/**
 * Splits `[[target#section|alias]]`. The wikilink runs from the first `[[` to
 * the last `]]`; the target stops at the first `#` or `|`, the section at the
 * first `|`.
 */
function parseWikilink(text: string) {
  const open = text.indexOf('[[');
  const close = text.lastIndexOf(']]');
  if (open < 0 || close < open + 2) {
    return undefined;
  }
  const inner = text.slice(open + 2, close);
  const pipe = inner.indexOf('|');
  const reference = pipe < 0 ? inner : inner.slice(0, pipe);
  const hash = reference.indexOf('#');
  return {
    target: hash < 0 ? reference : reference.slice(0, hash),
    section: hash < 0 ? '' : reference.slice(hash + 1),
    alias: pipe < 0 ? '' : inner.slice(pipe + 1),
  };
}

/**
 * Splits a Gollum `[[alias|target#section]]`. The wikilink runs from the
 * first `[[` to the last `]]`; the first `|` ends the alias, and the first
 * `#` after it ends the target. Without a `|` the whole text is the
 * reference. `[[a|]]` reads as `[[a]]`.
 */
export function parseGollumWikilink(text: string) {
  const open = text.indexOf('[[');
  const close = text.lastIndexOf(']]');
  if (open < 0 || close < open + 2) {
    return undefined;
  }
  const inner = text.slice(open + 2, close);
  const pipe = inner.indexOf('|');
  // A table cell escapes the pipe as `\|`
  let alias = pipe < 0 ? '' : inner.slice(0, pipe).replace(/\\$/, '').trim();
  let reference = pipe < 0 ? inner : inner.slice(pipe + 1);
  if (pipe >= 0 && reference.trim() === '') {
    reference = alias;
    alias = '';
  }
  const hash = reference.indexOf('#');
  return {
    alias,
    target: (hash < 0 ? reference : reference.slice(0, hash)).trim(),
    section: hash < 0 ? '' : reference.slice(hash + 1).trimEnd(),
  };
}

export abstract class MarkdownLink {
  private static directLinkRegex =
    /\[(.*)\]\((?:<([^#>]*)(?:#([^>]*))?>\s*|((?:[^#>()]|\([^#>()]*\))*?)(?:#((?:[^()>"']|\([^()>"']*\))*))?(?:\s+(?:"[^"]*"|'[^']*'))?)?\)/;

  public static convertGollumTarget(target: string) {
    let isRoot = false;
    let parentCount = 0;

    if (target.startsWith('/')) {
      target = target.substring(1);
      isRoot = true;
    }
    while (target.startsWith('./')) {
      target = target.substring(2);
    }
    while (target.startsWith('../')) {
      target = target.substring(3);
      parentCount++;
    }
    if (target === '..') {
      target = '';
      parentCount++;
    }
    return {
      target: target,
      isRoot: isRoot,
      parentCount: parentCount,
    };
  }

  private static analyzeGollumWikilink(link: ResourceLink): LinkAnalysis {
    const wikilink = parseGollumWikilink(link.rawText);
    if (!wikilink) {
      throw new Error('No wikilink found');
    }
    let { alias, target, section } = wikilink;
    let imageProperties = '';
    let linkType: 'link' | 'image' = 'link';
    // An image link names the file first: `[[image.png|frame|align=center]]`
    const file = alias !== '' ? alias : target;
    const extension = getExtension(file).toLocaleLowerCase();
    if (extension !== '' && imageExtensions.includes(extension)) {
      if (alias !== '') {
        imageProperties = target;
      }
      try {
        target = decodeURI(file);
      } catch (e) {
        target = file;
      }
      alias = '';
      linkType = 'image';
    }
    const rawTarget = target.replace(/\\/g, '');
    const converted = this.convertGollumTarget(rawTarget);
    // A fragment starting with ^ is a block anchor (e.g. #^myblock), not a section
    const blockMatch = section.match(/^\^([a-zA-Z0-9-]+)$/);
    return {
      target: converted.target,
      section: blockMatch ? '' : section,
      blockId: blockMatch?.[1] ?? '',
      alias,
      isRoot: converted.isRoot,
      parentCount: converted.parentCount,
      imageProperties,
      linkType,
      rawTarget,
    };
  }

  public static analyzeLink(link: ResourceLink): LinkAnalysis {
    try {
      const isGollum = Config.getWikilinksSyntax() === 'gollum';
      if (link.type === 'wikilink') {
        if (isGollum) {
          return this.analyzeGollumWikilink(link);
        }
        // Wikilinks are always parsed from rawText. Any resolved definition is a
        // Foam-generated rendering artifact, not authoritative content — the user's
        // intent is expressed by the wikilink identifier itself.
        const wikilink = parseWikilink(link.rawText);
        if (!wikilink) {
          throw new Error('No wikilink found');
        }
        const { target, section, alias } = wikilink;
        // A fragment starting with ^ is a block anchor (e.g. #^myblock), not a section
        const blockMatch = section.match(/^\^([a-zA-Z0-9-]+)$/);
        return {
          target: target.replace(/\\/g, ''),
          section: blockMatch ? '' : section,
          blockId: blockMatch?.[1] ?? '',
          alias,
        };
      }
      if (link.type === 'external') {
        const url =
          typeof link.definition === 'string'
            ? link.definition
            : ResourceLink.isResolvedReference(link)
              ? link.definition.url
              : link.rawText;
        return { target: url, section: '', blockId: '', alias: '' };
      }
      if (link.type === 'link') {
        // For reference-style links with resolved definitions, parse target and section from definition URL
        if (ResourceLink.isResolvedReference(link)) {
          // Extract alias from rawText for reference-style links
          const referenceMatch = /^\[([^\]]*)\]/.exec(link.rawText);
          const alias = referenceMatch ? referenceMatch[1] : '';

          // Parse target and section from definition URL
          const definitionUri = URI.parse(link.definition.url, 'tmp');
          const defFragment = definitionUri.fragment;
          const defBlockMatch = defFragment?.match(/^\^([a-zA-Z0-9-]+)$/);
          return {
            target: definitionUri.path, // Base path from definition
            section: defBlockMatch ? '' : defFragment ?? '',
            blockId: defBlockMatch?.[1] ?? '',
            alias: alias, // Alias from rawText
          };
        }

        const match = this.directLinkRegex.exec(link.rawText);
        if (!match) {
          // This might be a reference-style link that wasn't resolved
          // Try to extract just the alias text for reference-style links
          const referenceMatch = /^\[([^\]]*)\]/.exec(link.rawText);
          const alias = referenceMatch ? referenceMatch[1] : '';
          return {
            target: '',
            section: '',
            blockId: '',
            alias: alias,
          };
        }
        const [, alias, angleTarget, angleSection, plainTarget, plainSection] =
          match;
        const target = angleTarget ?? plainTarget ?? '';
        const section = angleSection ?? plainSection ?? '';
        const blockMatch = section?.match(/^\^([a-zA-Z0-9-]+)$/);
        const analysis: LinkAnalysis = {
          target,
          section: blockMatch ? '' : section,
          blockId: blockMatch?.[1] ?? '',
          alias: alias ?? '',
        };
        if (isGollum) {
          const converted = this.convertGollumTarget(target);
          analysis.target = converted.target;
          analysis.isRoot = converted.isRoot;
          analysis.parentCount = converted.parentCount;
          analysis.imageProperties = '';
          analysis.linkType = 'link';
          analysis.rawTarget = target;
        }
        return analysis;
      }
      throw new Error(`Link of type ${link.type} is not supported`);
    } catch (e) {
      throw new Error(`Couldn't parse link ${link.rawText} - ${e}`);
    }
  }

  public static createUpdateLinkEdit(
    link: ResourceLink,
    delta: {
      target?: string;
      section?: string;
      alias?: string;
      type?: 'wikilink' | 'link';
      isEmbed?: boolean;
    }
  ): TextEdit {
    if (link.type === 'external') {
      throw new Error('Cannot update an external link');
    }
    const analysis = MarkdownLink.analyzeLink(link);
    const { section, blockId, alias, imageProperties, linkType } = analysis;
    // A Gollum target keeps its `/` or `../` prefix unless a new one is given
    const target = analysis.rawTarget ?? analysis.target;
    const newTarget = delta.target ?? target;
    // Preserve the existing fragment (section or block anchor) when not overriding.
    const existingFragment = blockId ? `^${blockId}` : section;
    const newSection = delta.section ?? existingFragment ?? '';
    const newAlias = delta.alias ?? alias ?? '';
    const sectionDivider = newSection ? '#' : '';
    const aliasDivider = newAlias ? '|' : '';
    const embed = delta.isEmbed ?? link.isEmbed ? '!' : '';
    const type = delta.type ?? link.type;
    if (type === 'wikilink') {
      if (Config.getWikilinksSyntax() === 'gollum') {
        if (linkType === 'image') {
          // Gollum images put properties after the pipe
          const props = imageProperties ? `|${imageProperties}` : '';
          return {
            newText: `${embed}[[${newTarget}${sectionDivider}${newSection}${props}]]`,
            range: link.range,
          };
        }
        return {
          newText: `${embed}[[${newAlias}${aliasDivider}${newTarget}${sectionDivider}${newSection}]]`,
          range: link.range,
        };
      }
      return {
        newText: `${embed}[[${newTarget}${sectionDivider}${newSection}${aliasDivider}${newAlias}]]`,
        range: link.range,
      };
    }
    if (type === 'link') {
      const defaultAlias = () => {
        return `${newTarget}${sectionDivider}${newSection}`;
      };
      const useAngles =
        newTarget.includes(' ') || newSection.includes(' ');
      return {
        newText: `${embed}[${newAlias ? newAlias : defaultAlias()}](${
          useAngles ? '<' : ''
        }${newTarget}${sectionDivider}${newSection}${useAngles ? '>' : ''})`,
        range: link.range,
      };
    }
    throw new Error(`Unexpected state: link of type ${type} is not supported`);
  }
}
