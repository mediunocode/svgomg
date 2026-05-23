import { strToEl } from '../utils.js';
import Ripple from './ripple.js';
import Spinner from './spinner.js';

const downloadIconSvg =
  // prettier-ignore
  '<svg aria-hidden="true" class="icon" viewBox="0 0 24 24">' +
    '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>' +
  '</svg>';

export default class DownloadPngButton {
  constructor() {
    this.container = strToEl(
      `<div class="download-png-control">
        <span class="download-png-control-label">PNG</span>
        <button class="unbutton floating-action-button floating-action-button--png-download" type="button">
          ${downloadIconSvg}
        </button>
      </div>`,
    );

    this._button = this.container.querySelector('button');
    this._button.setAttribute('title', 'Download PNG');
    this._ripple = new Ripple();
    this._button.append(this._ripple.container);
    this._spinner = new Spinner();
    this._button.append(this._spinner.container);
    this._button.addEventListener('click', () => this.onClick());
    this._handler = null;
    this.setEnabled(false);
  }

  setHandler(handler) {
    this._handler = handler;
  }

  onClick() {
    this._ripple.animate();

    if (!this._handler || this._button.disabled) {
      return;
    }

    this._handler();
  }

  setEnabled(enabled) {
    this._button.disabled = !enabled;
    this._button.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    this.container.classList.toggle('is-disabled', !enabled);
  }

  working() {
    this._spinner.show(500);
  }

  done() {
    this._spinner.hide();
  }
}
