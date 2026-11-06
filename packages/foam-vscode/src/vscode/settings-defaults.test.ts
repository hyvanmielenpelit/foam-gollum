import fs from 'node:fs';
import path from 'node:path';
import { IFoamConfig, foamConfigFromVsCodeSettings } from '@foam/core';

/** Each setting's default, as this extension's package.json declares it. */
function declaredDefaults(): Record<string, unknown> {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')
  );
  const sections: { properties?: Record<string, { default?: unknown }> }[] = [
    pkg.contributes.configuration,
  ].flat();
  return Object.fromEntries(
    sections
      .flatMap(section => Object.entries(section.properties ?? {}))
      .filter(([, property]) => 'default' in property)
      .map(([key, property]) => [key, property.default])
  );
}

/** What `config` answers to each of its getters. */
function answers(config: IFoamConfig): Record<string, unknown> {
  const getters = Object.getOwnPropertyNames(
    Object.getPrototypeOf(config)
  ).filter(name => name.startsWith('get'));
  return Object.fromEntries(
    getters.map(name => [
      name,
      (config as unknown as Record<string, () => unknown>)[name](),
    ])
  );
}

/**
 * Fork exception: the extension defaults to Gollum wikilinks, while the CLI
 * and MCP server, which Foam for Gollum does not ship, keep MediaWiki ones.
 */
const FORK_DEFAULT_EXCEPTIONS = [
  'getWikilinksSyntax',
  'getWikilinksCaseInsensitive',
];

const withoutForkExceptions = (values: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(values).filter(
      ([name]) => !FORK_DEFAULT_EXCEPTIONS.includes(name)
    )
  );

describe('the settings the CLI and the app read', () => {
  it('default to what desktop declares', () => {
    expect(
      withoutForkExceptions(answers(foamConfigFromVsCodeSettings({})))
    ).toEqual(
      withoutForkExceptions(
        answers(foamConfigFromVsCodeSettings(declaredDefaults()))
      )
    );
  });

  it('read Gollum wikilinks only when a workspace asks for them', () => {
    expect(answers(foamConfigFromVsCodeSettings({}))).toMatchObject({
      getWikilinksSyntax: 'mediawiki',
      getWikilinksCaseInsensitive: false,
    });
    expect(
      answers(foamConfigFromVsCodeSettings(declaredDefaults()))
    ).toMatchObject({
      getWikilinksSyntax: 'gollum',
      getWikilinksCaseInsensitive: true,
    });
  });
});
