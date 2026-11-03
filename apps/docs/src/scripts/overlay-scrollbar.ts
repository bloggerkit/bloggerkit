import { onPage } from './page';

/** The space between the thumb and the top and bottom of the element. */
const inset = 8;

/**
 * A thin scrollbar over the edge of each `[data-overlay-scroll]` element. `scrollbar-overlay` hides the native one.
 * The thumb is `position: fixed`, so it takes no space and leaves the padding alone. It sits after the element, so a
 * `mask` fade on the element doesn't fade it. Scrolling stays native, and the thumb can be dragged.
 */
onPage((signal) => {
	for (const scroller of document.querySelectorAll<HTMLElement>(
		'[data-overlay-scroll]',
	)) {
		const thumb = document.createElement('div');
		thumb.dataset.scrollThumb = '';
		thumb.setAttribute('aria-hidden', 'true');
		Object.assign(thumb.style, {
			position: 'fixed',
			zIndex: '20',
			width: '6px',
			borderRadius: '9999px',
			background: 'var(--border)',
			transition: 'opacity 200ms',
			touchAction: 'none',
		});
		scroller.after(thumb);

		let frame = 0;
		const update = () => {
			frame = 0;
			const { scrollTop, scrollHeight, clientHeight } = scroller;
			const box = scroller.getBoundingClientRect();
			// Nothing to scroll, or not shown (the sidebar on small screens, closed)
			if (scrollHeight <= clientHeight || box.height === 0) {
				thumb.hidden = true;
				return;
			}
			thumb.hidden = false;
			const track = clientHeight - 2 * inset;
			const height = Math.max(24, (clientHeight / scrollHeight) * track);
			const top =
				(scrollTop / (scrollHeight - clientHeight)) * (track - height);
			Object.assign(thumb.style, {
				height: `${height}px`,
				top: `${box.top + inset + top}px`,
				left: `${box.right - 6}px`,
			});
		};
		const schedule = () => (frame ||= requestAnimationFrame(update));

		// Shown while it scrolls, and a moment after
		let hide = 0;
		scroller.addEventListener(
			'scroll',
			() => {
				schedule();
				scroller.dataset.scrolling = '';
				clearTimeout(hide);
				hide = window.setTimeout(() => {
					delete scroller.dataset.scrolling;
				}, 800);
			},
			{ passive: true, signal },
		);
		addEventListener('scroll', schedule, { passive: true, signal });
		addEventListener('resize', schedule, { signal });
		const resized = new ResizeObserver(schedule);
		resized.observe(scroller);
		for (const child of scroller.children) {
			resized.observe(child);
		}
		signal.addEventListener('abort', () => {
			resized.disconnect();
			cancelAnimationFrame(frame);
			clearTimeout(hide);
			thumb.remove();
		});

		thumb.addEventListener(
			'pointerdown',
			(event) => {
				event.preventDefault();
				thumb.setPointerCapture(event.pointerId);
				thumb.dataset.dragging = '';
				const startY = event.clientY;
				const startTop = scroller.scrollTop;
				const move = (moved: PointerEvent) => {
					const { scrollHeight, clientHeight } = scroller;
					const track = clientHeight - 2 * inset - thumb.offsetHeight;
					scroller.scrollTop =
						startTop +
						((moved.clientY - startY) * (scrollHeight - clientHeight)) / track;
				};
				const stop = () => {
					delete thumb.dataset.dragging;
					thumb.removeEventListener('pointermove', move);
				};
				thumb.addEventListener('pointermove', move);
				thumb.addEventListener('pointerup', stop, { once: true });
				thumb.addEventListener('pointercancel', stop, { once: true });
			},
			{ signal },
		);
		update();
	}
});
