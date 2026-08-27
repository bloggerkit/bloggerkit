export const HOST_REGEX =
	/^(?:https?:)?\/\/((?:[^/]+\.)?(?:blogspot\.com|googleusercontent\.com))(?:\/|$)/;

export const PARAMS_REGEX =
	/[^/]+(?=\/[^/]+\.[^/?]+(?:\?|$))|(?<==)[^=&?/]+(?=\?|$)/;

export const BOOLEAN_PARAMS = new Set([
	'rj',
	'rp',
	'rw',
	'rwa',
	'rg',
	'rh',
	'nw',
	'h',
	'g',
	'k',
	'x',
	'y',
	'z',
	'a',
	'd',
	'b',
	'r',
	'n',
	's',
	'c',
	'o',
	'p',
	'cc',
	'dv',
	'vm',
	'no',
	'ip',
	'sm',
	'fg',
	'pg',
	'ft',
	'ng',
	'lo',
	'fv',
	'ci',
	'al',
	'df',
	'fh',
	'pf',
	'pp',
	'gd',
	'il',
	'lf',
	'md',
	'mo',
	'mv',
	'nc',
	'nd',
	'ns',
	'nu',
	'nt0',
	'pa',
	'rwu',
	'sg',
]);

export const NUMBER_PARAMS = new Set([
	'w',
	'h',
	's',
	'b',
	'e',
	'r',
	'l',
	'v',
	'm',
	'a',
	'ba',
	'pd',
	'br',
	'cp',
	'iv',
	'pc',
	'sc',
	'vb',
]);

export const HEX_PARAMS = new Set(['c', 'bc', 'pc']);

const NUMBER_PARAM_REGEX = new RegExp(
	`^(${[...NUMBER_PARAMS].join('|')})(\\d+)$`,
);
const HEX_PARAM_REGEX = new RegExp(
	`^(${[...HEX_PARAMS].join('|')})(0x[0-9A-Fa-f]{6,8})$`,
);
const FCROP_PARAM_REGEX = /^(fcrop64)(=1,[0-9A-Fa-f]{6,16})$/;
const FSOFTEN_PARAM_REGEX = /^(fSoften)(=\d+,\d+,\d+)$/;
const UNKNOWN1_PARAM_REGEX = /^(mm)(,[0-9A-Za-z]+)$/;
const UNKNOWN2_PARAM_REGEX = /^(t|q)([0-9A-Za-z]+)$/;

export const BOOLEAN_PARAM = '00_';
export const NUMBER_PARAM = '01_';
export const HEX_PARAM = '02_';
export const FCROP_PARAM = '03_';
export const FSOFTEN_PARAM = '04_';
export const UNKNOWN1_PARAM = '05_';
export const UNKNOWN2_PARAM = '06_';

export type ParsedParam =
	| [typeof BOOLEAN_PARAM, string, true]
	| [typeof NUMBER_PARAM, string, number]
	| [
			(
				| typeof HEX_PARAM
				| typeof FCROP_PARAM
				| typeof FSOFTEN_PARAM
				| typeof UNKNOWN1_PARAM
				| typeof UNKNOWN2_PARAM
			),
			string,
			string,
	  ];

export function parseParam(param: string): ParsedParam | null {
	// Boolean param
	if (BOOLEAN_PARAMS.has(param)) {
		return [BOOLEAN_PARAM, param, true];
	}

	// Number param
	let match = param.match(NUMBER_PARAM_REGEX);
	if (match) {
		return [NUMBER_PARAM, match[1], +match[2]];
	}

	// HEX param
	match = param.match(HEX_PARAM_REGEX);
	if (match) {
		return [HEX_PARAM, match[1], match[2]];
	}

	// Free crop param
	match = param.match(FCROP_PARAM_REGEX);
	if (match) {
		return [FCROP_PARAM, match[1], match[2]];
	}

	// Free soften param
	match = param.match(FSOFTEN_PARAM_REGEX);
	if (match) {
		return [FSOFTEN_PARAM, match[1], match[2]];
	}

	// Unknown 1 param
	match = param.match(UNKNOWN1_PARAM_REGEX);
	if (match) {
		return [UNKNOWN1_PARAM, match[1], match[2]];
	}

	// Unknown 2 param
	match = param.match(UNKNOWN2_PARAM_REGEX);
	if (match) {
		return [UNKNOWN2_PARAM, match[1], match[2]];
	}

	return null;
}
