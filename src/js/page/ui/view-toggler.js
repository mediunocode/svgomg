import { createNanoEvents } from 'nanoevents';
import { domReady } from '../utils.js';

/**
 * Tabs that toggle between showing the SVG image and XML markup.
 */
export default class ViewToggler {
  constructor() {
    this.emitter = createNanoEvents();
    /** @type {HTMLElement | null} */
    this.wrapper = null;
    /** @type {HTMLFormElement | null} */
    this.container = null;

    domReady.then(() => {
      this.wrapper = document.querySelector('.toolbar-output-nav');
      this.container = this.wrapper?.querySelector('.view-toggler') ?? null;
      if (!this.container) return;

      // stop browsers remembering previous form state
      this.container.output[0].checked = true;

      this.container.addEventListener('change', () => {
        for (const input of this.container.output) {
          input.blur();
        }

        this.emitter.emit('change', {
          value: this.container.output.value,
        });
      });
    });
  }

  show() {
    if (this.wrapper) {
      this.wrapper.hidden = false;
    }
    if (this._pendingSelectImage) {
      this.selectImage();
    }
  }

  selectImage() {
    if (!this.container) {
      this._pendingSelectImage = true;
      return;
    }

    this._pendingSelectImage = false;
    const imageInput = this.container.querySelector('input[value="image"]');
    if (!imageInput) return;

    const wasCode = this.container.output.value === 'code';
    imageInput.checked = true;

    const focused = document.activeElement;
    if (focused?.closest('.toolbar-view-toggler')) {
      focused.blur();
    }

    if (wasCode) {
      this.emitter.emit('change', { value: 'image' });
    }
  }
}
