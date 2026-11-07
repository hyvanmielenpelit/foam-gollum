import { VsCodeOutputLogger } from './logging';

describe('VsCodeOutputLogger error forwarding', () => {
  it('forwards the Error argument and never the message text', () => {
    const logger = new VsCodeOutputLogger();
    const forwarded: Error[] = [];
    logger.setErrorSink({ captureOriginal: e => forwarded.push(e) });
    const error = new Error('boom');

    logger.error('text with C:\\Users\\x\\note.md', error, { detail: 'not an error' });

    expect(forwarded).toEqual([error]);
    logger.dispose();
  });

  it('forwards the message when it is itself an Error', () => {
    const logger = new VsCodeOutputLogger();
    const forwarded: Error[] = [];
    logger.setErrorSink({ captureOriginal: e => forwarded.push(e) });
    const error = new Error('boom');

    logger.error(error);

    expect(forwarded).toEqual([error]);
    logger.dispose();
  });

  it('forwards errors even when the log level hides them', () => {
    const logger = new VsCodeOutputLogger();
    const forwarded: Error[] = [];
    logger.setErrorSink({ captureOriginal: e => forwarded.push(e) });
    logger.setLevel('off');

    logger.error('hidden', new Error('boom'));

    expect(forwarded).toHaveLength(1);
    logger.dispose();
  });
});
