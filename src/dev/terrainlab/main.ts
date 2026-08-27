/**
 * Entry point for the developer-only terrain resolution lab.
 * Served at /terrainlab.html. Not part of the game bundle.
 */
import './terrainlab.css';
import { TerrainLab } from './TerrainLab';

const host = document.querySelector<HTMLDivElement>('#lab');
if (!host) throw new Error('#lab missing');

document.body.style.margin = '0';
void new TerrainLab().mount(host);
