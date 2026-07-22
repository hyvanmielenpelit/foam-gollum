import { ResourceLink } from '../model/note';
import { URI } from '../model/uri';
import { TextEdit } from './text-edit';
import { Config } from '../config';
import * as path from 'path';
import { imageExtensions } from './attachment-provider';

export abstract class MarkdownLink {
  private static wikilinkRegex = new RegExp(
    /\[\[([^#|]+)?#?([^|]+)?\|?(.*)?]]/
  );
  private static wikilinkRegex2 = new RegExp(
    /\[\[\s*([^|#\]]+)?\s*\|?\s*([^#\]]+)?#?([^\]]*)?\s*]]/
  );
  private static directLinkRegex =
    /\[(.*)\]\((?:<([^#>]*)(?:#([^>]*))?>\s*|([^#>]*?)(?:#([^)>"']*))?(?:\s+(?:"[^"]*"|'[^']*'))?)?\)/;
  private static wikilinkRegex3 = /\|\s*#/;

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
      parentCount: parentCount
    };
  }

  public static analyzeLink(link: ResourceLink) {
    try {
      const wikiLinkSyntax = Config.getWikilinksSyntax();
      if (link.type === 'wikilink') {
        if (wikiLinkSyntax === 'mediawiki') {
          // Wikilinks are always parsed from rawText. Any resolved definition is a
          // Foam-generated rendering artifact, not authoritative content — the user's
          // intent is expressed by the wikilink identifier itself.
          const [, target, section, alias] = this.wikilinkRegex.exec(
            link.rawText
          );
          // A fragment starting with ^ is a block anchor (e.g. #^myblock), not a section
          const blockMatch = section?.match(/^\^([a-zA-Z0-9-]+)$/);
          return {
            target: target?.replace(/\\/g, '') ?? '',
            section: blockMatch ? '' : section ?? '',
            blockId: blockMatch?.[1] ?? '',
            alias: alias ?? '',
          };
        }
        if (wikiLinkSyntax === 'gollum') {
          // use Gollum-style syntax
          const match = this.wikilinkRegex2.exec(link.rawText);
          if (!match) {
            throw new Error(`Failed to parse Gollum link: ${link.rawText}`);
          }
          let [, alias, target, section] = match;
          const isMatch3 = this.wikilinkRegex3.test(link.rawText);

          const extension = path.extname(alias) ?? '';
          let imageProperties = '';
          let linkType = 'link';
          if(extension !== '' && imageExtensions.includes(extension)) {
            //Image link
            if((target ?? '').length > 0) {
              imageProperties = target;
            }
            try {
              target = decodeURI(alias);
            } catch (e) {
              target = alias; // Fallback if malformed URI
            }
            alias = '';
            linkType = "image";
          }
          else if ((target ?? '') === '') {           
            if (!isMatch3) {
              target = alias;
              alias = '';
            } else {
              target = '';
            } 
          }

          let {target: target2, isRoot, parentCount} = this.convertGollumTarget(target);

          // A fragment starting with ^ is a block anchor (e.g. #^myblock), not a section
          const blockMatch = section?.match(/^\^([a-zA-Z0-9-]+)$/);
          return {
            target: target2?.replace(/\\/g, '') ?? '',
            section: blockMatch ? '' : section ?? '',
            blockId: blockMatch?.[1] ?? '',
            alias: alias ?? '',
            isRoot: isRoot,
            parentCount: parentCount,
            imageProperties: imageProperties,
            linkType: linkType
          };
        }
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
        let [, alias, angleTarget, angleSection, plainTarget, plainSection] =
          match;
        let target = angleTarget ?? plainTarget ?? '';
        const section = angleSection ?? plainSection ?? '';

        let isRoot = false;
        let parentCount = 0;

        if (wikiLinkSyntax === 'gollum') {
          const retValue = this.convertGollumTarget(target);
          target = retValue.target;
          isRoot = retValue.isRoot;
          parentCount = retValue.parentCount;
        }

        const blockMatch = section?.match(/^\^([a-zA-Z0-9-]+)$/);
        return {
          target,
          section: blockMatch ? '' : section,
          blockId: blockMatch?.[1] ?? '',
          alias: alias ?? '',
          isRoot: isRoot,
          parentCount: parentCount,
          imageProperties: '',
          linkType: 'link'
        };
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
    // Support for Gollum image links with properties
    const { target, section, blockId, alias, imageProperties, linkType: pType } = MarkdownLink.analyzeLink(link);
    const newTarget = delta.target ?? target;
    // Preserve the existing fragment (section or block anchor) when not overriding.
    const existingFragment = blockId ? `^${blockId}` : section;
    const newSection = delta.section ?? existingFragment ?? '';
    const newAlias = delta.alias ?? alias ?? '';
    const sectionDivider = newSection ? '#' : '';
    let aliasDivider = newAlias ? '|' : '';
    const embed = delta.isEmbed ?? link.isEmbed ? '!' : '';
    const type = delta.type ?? link.type;
    if (type === 'wikilink') {
      const wikiLinkSyntax = Config.getWikilinksSyntax();
      if (wikiLinkSyntax === 'gollum') {
        if (pType === 'image') {
          // Gollum images put properties after the pipe
          const props = imageProperties ? `|${imageProperties}` : '';
          return {
            newText: `${embed}[[${newTarget}${sectionDivider}${newSection}${props}]]`,
            range: link.range,
          };
        } else {
          return {
            newText: `${embed}[[${newAlias}${aliasDivider}${newTarget}${sectionDivider}${newSection}]]`,
            range: link.range,
          };      
        }
      } else {
        return {
          newText: `${embed}[[${newTarget}${sectionDivider}${newSection}${aliasDivider}${newAlias}]]`,
          range: link.range,
        };
      }
    }
    if (type === 'link') {
      const defaultAlias = () => {
        return `${newTarget}${sectionDivider}${newSection}`;
      };
      const useAngles =
        newTarget.indexOf(' ') > 0 || newSection.indexOf(' ') > 0;
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
