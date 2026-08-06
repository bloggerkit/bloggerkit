import { assert, test } from 'vitest';
import { parse } from './parser';

test('only the fixed function set can be called', () => {
	assert.throws(() => parse('len([1,2,3])'), /Unknown function 'len'/);
	assert.throws(() => parse('join(["a","b"], "-")'), /Unknown function 'join'/);
	assert.throws(
		() => parse('data:foo()'),
		/not be called|Only a function name/,
	);
});

test('call arity and literal argument types are validated at parse time', () => {
	assert.throws(
		() => parse('path("https://example.com")'),
		/expects 2 argument/,
	);
	assert.throws(
		() => parse('path("https://example.com", "a", "b")'),
		/expects 2 argument/,
	);
	assert.throws(() => parse('path(data:url, 5)'), /must be a string literal/);
	assert.throws(
		() => parse('params("https://example.com", ["a", "b"])'),
		/must be a map literal/,
	);
	assert.throws(
		() => parse('resizeImage(data:img, "wide")'),
		/must be a number literal/,
	);
	assert.throws(
		() => parse('snippet(data:str, { length: "x" })'),
		/must be a number/,
	);
	assert.throws(
		() => parse('snippet(data:str, { bogus: 1 })'),
		/unsupported option 'bogus'/,
	);
	// All fine when the args are dynamic (not literals) — nothing to check at parse time.
	assert.doesNotThrow(() => parse('path(data:url, data:segment)'));
});

test('infix (named-operator) syntax is only allowed for the six documented functions', () => {
	assert.doesNotThrow(() => parse('data:url path "x"'));
	assert.doesNotThrow(() => parse('data:str snippet { length: 150 }'));
	assert.throws(
		() => parse('data:img resizeImage 200'),
		/Unexpected token 'resizeImage'/,
	);
});

test('unknown expression syntax throws ParseError with a position', () => {
	assert.throws(() => parse('data:a ==='), /ParseError|Unexpected/);
});

test('map and set literals are distinguished at parse time', () => {
	assert.equal(parse('{ a: 1, b: "x" }').type, 'MapLiteral');
	assert.equal(parse('{"a", "b", "c"}').type, 'SetLiteral');
	assert.equal(parse('{}').type, 'SetLiteral');
	assert.throws(
		() => parse('{ a: 1, "b" }'),
		/Cannot mix a keyed map entry into a set literal|Expected a map key|Expected ':'/,
	);
});

test("a map key must be followed by ': ' (colon and a space)", () => {
	assert.doesNotThrow(() => parse('{ a: 1 }'));
	assert.throws(() => parse('{ a:1 }'), /Expected a space after ':'/);
});

test('a bare identifier outside any lambda is a parse error', () => {
	assert.throws(() => parse('foo'), /Unknown identifier 'foo'/);
	assert.throws(() => parse('to'), /Unknown identifier 'to'/);
});

test('bare lambda-parameter access inside a {} literal', () => {
	assert.doesNotThrow(() => parse('data:links map (l => { title: l.name })'));
});

test('bare lambda-parameter access inside a [] literal', () => {
	assert.doesNotThrow(() =>
		parse('data:links filter (l => l.name in [l.name])'),
	);
});

test('bare access to an outer lambda parameter is barred inside a nested lambda body', () => {
	assert.throws(
		() =>
			parse(
				'data:sections filter (id => data:widgets any (w => w.sectionId == id))',
			),
		/Unknown identifier 'id'/,
	);
});
