/**
 * Entry point for the Custom World editor, served at /customworld.html.
 * Works fully offline: styles are created, saved and previewed locally.
 */
import { CustomWorldEditor } from './CustomWorldEditor';

const host = document.querySelector<HTMLDivElement>('#customworld');
if (!host) throw new Error('#customworld missing');

document.body.style.margin = '0';
void new CustomWorldEditor().mount(host);
