/*global markdownit:readonly*/

import markdownItRegex from 'markdown-it-regex';
import { ResourceParser } from '@foam/core';
import { FoamWorkspace } from '@foam/core';
import type { WikilinkEmbedOptions } from './wikilink-embed';
import { WIKILINK_EMBED_REGEX } from './embed-helpers';

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

export const markdownItWikilinkEmbed = (
  md: markdownit,
  workspace: FoamWorkspace,
  parser: ResourceParser,
  _options?: WikilinkEmbedOptions
) => {
  return md.use(markdownItRegex, {
    name: 'embed-wikilinks',
    regex: WIKILINK_EMBED_REGEX,
    replace: (wikilinkItem: string) => {
      return `
      <div class="foam-embed-not-supported-warning">
        Embed not supported in web mode: ${wikilinkItem}
      </div>
`;
    },
  });
};

export default markdownItWikilinkEmbed;
