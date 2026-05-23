import { createNanoEvents } from 'nanoevents';
import { domReady, readFileAsText } from '../utils.js';
import Spinner from './spinner.js';

export default class MainMenu {
  constructor() {
    this.emitter = createNanoEvents();
    this._spinner = new Spinner();

    domReady.then(() => {
      this.container = document.querySelector('.toolbar-site');
      if (!this.container) return;

      this._loadFileInput = this.container.querySelector('.load-file-input');
      this._pasteInput = this.container.querySelector('.paste-input');
      this._loadDemoBtn = this.container.querySelector('.load-demo');
      this._loadFileBtn = this.container.querySelector('.load-file');
      this._pasteLabel = this.container.querySelector('.toolbar-paste');

      this._loadFileBtn?.addEventListener('click', (event) =>
        this._onLoadFileClick(event),
      );
      this._loadDemoBtn?.addEventListener('click', (event) =>
        this._onLoadDemoClick(event),
      );
      this._loadFileInput?.addEventListener('change', () =>
        this._onFileInputChange(),
      );
      this._pasteInput?.addEventListener('input', () =>
        this._onTextInputChange(),
      );
    });
  }

  stopSpinner() {
    this._spinner.hide();
  }

  blurDemoButton() {
    this._loadDemoBtn?.blur();
  }

  showFilePicker() {
    this._loadFileInput?.click();
  }

  setPasteInput(value) {
    if (!this._pasteInput) return;
    this._pasteInput.value = value;
    this._pasteInput.dispatchEvent(new Event('input'));
  }

  async loadDemo({ auto = false } = {}) {
    if (!auto) {
      this._loadDemoBtn?.append(this._spinner.container);
      this._spinner.show();
    }

    try {
      const data = await fetch('test-svgs/car-lite.svg').then((response) =>
        response.text(),
      );
      this.emitter.emit('svgDataLoad', {
        data,
        filename: 'car-lite.svg',
        fromDemo: !auto,
      });
    } catch {
      this.stopSpinner();

      const error = new Error("Couldn't fetch demo SVG");

      this.emitter.emit('error', { error });
    }
  }

  _onTextInputChange() {
    const value = this._pasteInput.value;
    if (!value.includes('</svg>')) return;

    this._pasteInput.value = '';
    this._pasteInput.blur();

    this._pasteLabel?.append(this._spinner.container);
    this._spinner.show();

    this.emitter.emit('svgDataLoad', {
      data: value,
      filename: 'image.svg',
    });
  }

  _onLoadFileClick(event) {
    event.preventDefault();
    event.target.blur();
    this.showFilePicker();
  }

  async _onFileInputChange() {
    const file = this._loadFileInput.files[0];

    if (!file) return;

    this._loadFileBtn.append(this._spinner.container);
    this._spinner.show();

    this.emitter.emit('svgDataLoad', {
      data: await readFileAsText(file),
      filename: file.name,
    });
  }

  async _onLoadDemoClick(event) {
    event.preventDefault();
    event.target.blur();
    await this.loadDemo();
  }
}
