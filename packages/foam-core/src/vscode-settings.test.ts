import { URI } from './model/uri';
import { GlobMatcher } from './services/glob-matcher';
import { foamConfigFromVsCodeSettings } from './vscode-settings';

describe('reading Foam settings from .vscode/settings.json', () => {
  it('returns the defaults when there are no settings', () => {
    const config = foamConfigFromVsCodeSettings({});

    expect(config.getTemplatesFolder()).toBe('.foam/templates');
    expect(config.getLegacyDailyNoteSettings()).toEqual({});
  });

  it('reads anything but an object as no settings', () => {
    for (const settings of [null, undefined, [], 'diary', 42]) {
      expect(foamConfigFromVsCodeSettings(settings).getTemplatesFolder()).toBe(
        '.foam/templates'
      );
    }
  });

  it('reads the templates folder', () => {
    const config = foamConfigFromVsCodeSettings({
      'foam.templates.folder': 'templates',
    });

    expect(config.getTemplatesFolder()).toBe('templates');
  });

  it('reads the openDailyNote settings Foam no longer uses, so it can say they are ignored', () => {
    const config = foamConfigFromVsCodeSettings({
      'foam.openDailyNote.directory': 'diary',
      'foam.openDailyNote.filenameFormat': 'dd-mm-yyyy',
      'foam.openDailyNote.fileExtension': 'markdown',
      'foam.openDailyNote.titleFormat': 'fullDate',
    });

    expect(config.getLegacyDailyNoteSettings()).toEqual({
      directory: 'diary',
      filenameFormat: 'dd-mm-yyyy',
      fileExtension: 'markdown',
      titleFormat: 'fullDate',
    });
  });

  it('excludes what is never workspace content, even when the workspace sets its own exclusions', () => {
    const root = URI.file('/workspace');
    const config = foamConfigFromVsCodeSettings({
      'foam.files.exclude': ['drafts/**'],
    });
    const matcher = new GlobMatcher([
      {
        uri: root,
        include: config.getFilesInclude(),
        exclude: config.getFilesExclude(),
      },
    ]);

    for (const path of [
      '.foam/trash/note.md',
      '.foam/templates/new-note.md',
      '.git/note.md',
      '.hg/note.md',
      '.svn/note.md',
      'notes/.DS_Store',
      'notes/Thumbs.db',
    ]) {
      expect(matcher.isMatch(root.joinPath(...path.split('/')))).toBe(false);
    }
    expect(matcher.isMatch(root.joinPath('drafts', 'note.md'))).toBe(false);
    expect(matcher.isMatch(root.joinPath('notes', 'note.md'))).toBe(true);
  });

  it('excludes installed packages by default', () => {
    const root = URI.file('/workspace');
    const config = foamConfigFromVsCodeSettings({});
    const matcher = new GlobMatcher([
      {
        uri: root,
        include: config.getFilesInclude(),
        exclude: config.getFilesExclude(),
      },
    ]);

    for (const path of [
      '.direnv/python-3.10/lib/python3.10/site-packages/pkg/README.md',
      'python-3.14/lib64/python3.14/site-packages/pkg/README.md',
      'vendor/bundle/ruby/3.3.0/gems/rake-13.2.1/README.md',
      '.yarn/sdks/typescript/README.md',
    ]) {
      expect(matcher.isMatch(root.joinPath(...path.split('/')))).toBe(false);
    }
    expect(matcher.isMatch(root.joinPath('notes', 'python.md'))).toBe(true);
    expect(matcher.isMatch(root.joinPath('vendor', 'acme.md'))).toBe(true);
  });

  it('ignores values of the wrong type', () => {
    const config = foamConfigFromVsCodeSettings({
      'foam.openDailyNote.directory': 42,
    });

    expect(config.getLegacyDailyNoteSettings()).toEqual({});
  });
});

describe('reading the wikilink settings with Gollum syntax', () => {
  it('reads the wikilink syntax and case sensitivity', () => {
    const config = foamConfigFromVsCodeSettings({
      'foam.wikilinks.syntax': 'gollum',
      'foam.wikilinks.caseInsensitive': true,
    });

    expect(config.getWikilinksSyntax()).toBe('gollum');
    expect(config.getWikilinksCaseInsensitive()).toBe(true);
  });

  it('reads MediaWiki syntax when it is set', () => {
    const config = foamConfigFromVsCodeSettings({
      'foam.wikilinks.syntax': 'mediawiki',
      'foam.wikilinks.caseInsensitive': false,
    });

    expect(config.getWikilinksSyntax()).toBe('mediawiki');
    expect(config.getWikilinksCaseInsensitive()).toBe(false);
  });

  it('falls back to MediaWiki syntax for an invalid value', () => {
    for (const syntax of ['Gollum', 'markdown', '', 42, true, null]) {
      expect(
        foamConfigFromVsCodeSettings({
          'foam.wikilinks.syntax': syntax,
        }).getWikilinksSyntax()
      ).toBe('mediawiki');
    }
  });

  it('ignores a case sensitivity that is not a boolean', () => {
    const config = foamConfigFromVsCodeSettings({
      'foam.wikilinks.caseInsensitive': 'true',
    });

    expect(config.getWikilinksCaseInsensitive()).toBe(false);
  });

  it('defaults to case-sensitive MediaWiki syntax', () => {
    const config = foamConfigFromVsCodeSettings({});

    expect(config.getWikilinksSyntax()).toBe('mediawiki');
    expect(config.getWikilinksCaseInsensitive()).toBe(false);
  });
});
