import { ELEMENTS, WIDGETS } from './elements';

/** Whether Blogger keeps an element `child`, a widget of the type `type`, in `parent` when saving. */
export function keepsChild(
	parent: string,
	child: string,
	type: string | undefined,
): boolean {
	switch (parent) {
		case 'b:section':
			return child === 'b:widget' && !WIDGETS.removed.has(type ?? '');
		case 'b:widget-settings':
			return child === 'b:widget-setting';
		default:
			return true;
	}
}

/** Whether Blogger keeps the attribute `name` of a widget, it removes the others, `expr:` ones too. */
export function keepsWidgetAttribute(name: string): boolean {
	return name in (ELEMENTS.get('b:widget')?.attributes ?? {});
}

/** A value of a widget, read, as Blogger saves it: `locked` and `visible` true or false, a title too long emptied. */
export function savedWidgetValue(name: string, value: string): string {
	switch (name) {
		case 'locked':
			return value.toLowerCase() === 'true' ? 'true' : 'false';
		case 'visible':
			return value.toLowerCase() === 'false' ? 'false' : 'true';
		case 'title':
			return value.length > WIDGETS.titleLength ? '' : value;
		default:
			return value;
	}
}

/** A setting, read, as Blogger saves it: trimmed as Java trims, every character up to the space. */
export function savedSetting(value: string): string {
	let start = 0;
	let end = value.length;
	while (start < end && value.charCodeAt(start) <= 0x20) {
		start++;
	}
	while (end > start && value.charCodeAt(end - 1) <= 0x20) {
		end--;
	}
	return value.slice(start, end);
}

/** Whether Blogger keeps a setting, read and trimmed, of a widget of the type `type`: an HTML widget loses an empty one. */
export function keepsSetting(type: string | undefined, value: string): boolean {
	return type !== 'HTML' || value !== '';
}
