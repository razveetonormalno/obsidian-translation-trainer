const MAX_TILT_X = 3;
const MAX_TILT_Y = 4;

export function enhanceButtonMotion(button: HTMLButtonElement): HTMLButtonElement {
	button.addClass('translation-trainer-interactive-button');
	button.addEventListener('pointermove', (event: PointerEvent) => {
		if (button.disabled || event.pointerType === 'touch') return;
		const bounds = button.getBoundingClientRect();
		const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
		const y = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
		button.style.setProperty('--translation-trainer-tilt-x', `${(-y * MAX_TILT_X).toFixed(2)}deg`);
		button.style.setProperty('--translation-trainer-tilt-y', `${(x * MAX_TILT_Y).toFixed(2)}deg`);
	});
	button.addEventListener('pointerleave', () => {
		button.style.removeProperty('--translation-trainer-tilt-x');
		button.style.removeProperty('--translation-trainer-tilt-y');
	});
	return button;
}
