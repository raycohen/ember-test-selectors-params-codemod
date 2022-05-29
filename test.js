const recast = require('ember-template-recast');

const { transform: _transform } = require('./index');

function transform(code) {
  let root = recast.parse(code);
  _transform(root);
  return recast.print(root);
}

describe('transform', () => {
  test('simple mustache', () => {
    let input = `{{some-component data-test-foo}}`;
    let expected = `{{some-component data-test-foo=true}}`;
    expect(transform(input)).toEqual(expected);
  });

  test('mustache with existing args', () => {
    let input = `{{some-component foo data-test-foo 42 @bar baz=qux bla="42"}}`;
    let expected = `{{some-component foo 42 @bar data-test-foo=true baz=qux bla="42"}}`;
    expect(transform(input)).toEqual(expected);
  });

  test('block mustache', () => {
    let input = `{{#some-component data-test-foo}}FOO{{/some-component}}`;
    let expected = `{{#some-component data-test-foo=true}}FOO{{/some-component}}`;
    expect(transform(input)).toEqual(expected);
  });
});
